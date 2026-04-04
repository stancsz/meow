/**
 * sidecars/acp.ts
 *
 * ACP (Agent Client Protocol) mode sidecar.
 * Implements JSON-RPC 2.0 over stdio for programmatic Meow control.
 *
 * Methods:
 *   initialize  - Handshake, set up agent config
 *   newSession  - Start a new session
 *   loadSession - Load an existing session
 *   prompt      - Run a prompt through the agent
 *   cancel      - Abort the current prompt
 *
 * Reference: docs/research/competitors/gemini-cli/docs/cli/acp-mode.md
 */
import { runLeanAgent } from "../core/lean-agent.ts";
import {
  initializeToolRegistry,
  getToolDefinitions,
} from "./tool-registry.ts";

// ============================================================================
// JSON-RPC Types
// ============================================================================

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

// ============================================================================
// ACP State
// ============================================================================

let currentAbortController: AbortController | null = null;
let currentSessionId: string | null = null;
let dangerousMode = false;

// ============================================================================
// JSON-RPC Helpers
// ============================================================================

function id(request: JsonRpcRequest): number | string | null {
  return request.id;
}

function response(request: JsonRpcRequest, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id(request), result };
}

function errorResponse(
  request: JsonRpcRequest,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id(request), error: { code, message, data } };
}

function send(res: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(res) + "
");
}

// ============================================================================
// ACP Methods
// ============================================================================

async function handleInitialize(
  request: JsonRpcRequest,
  params: Record<string, unknown>
): Promise<JsonRpcResponse> {
  const capabilities = {
    tools: getToolDefinitions().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.parameters,
    })),
    options: {
      dangerousMode: typeof params.dangerousMode === "boolean" ? params.dangerousMode : false,
    },
  };

  if (typeof params.dangerousMode === "boolean") {
    dangerousMode = params.dangerousMode;
  }

  return response(request, {
    capabilities,
    serverVersion: "1.0.0",
    agentName: "meow",
    protocolVersion: "2.0",
  });
}

async function handleNewSession(
  request: JsonRpcRequest,
  _params: Record<string, unknown>
): Promise<JsonRpcResponse> {
  currentSessionId = "session_" + Date.now();
  return response(request, {
    sessionId: currentSessionId,
    status: "created",
  });
}

async function handleLoadSession(
  request: JsonRpcRequest,
  params: Record<string, unknown>
): Promise<JsonRpcResponse> {
  const sessionId = params.sessionId as string;
  if (!sessionId) {
    return errorResponse(request, -32602, "Missing required parameter: sessionId");
  }
  currentSessionId = sessionId;
  return response(request, {
    sessionId,
    status: "loaded",
  });
}

async function handlePrompt(
  request: JsonRpcRequest,
  params: Record<string, unknown>
): Promise<JsonRpcResponse> {
  const prompt = params.prompt as string;
  if (!prompt) {
    return errorResponse(request, -32602, "Missing required parameter: prompt");
  }

  currentAbortController = new AbortController();

  try {
    const result = await runLeanAgent(prompt, {
      dangerous: dangerousMode,
      abortSignal: currentAbortController.signal,
      maxIterations: params.maxIterations ? (params.maxIterations as number) : 10,
      timeoutMs: params.timeoutMs ? (params.timeoutMs as number) : undefined,
    });

    currentAbortController = null;

    return response(request, {
      content: result.content,
      iterations: result.iterations,
      completed: result.completed,
      usage: result.usage
        ? {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
            estimatedCost: result.usage.estimatedCost,
          }
        : undefined,
    });
  } catch (e: any) {
    currentAbortController = null;
    if (e.message === "Interrupted") {
      return response(request, {
        content: "Cancelled",
        iterations: 0,
        completed: false,
        cancelled: true,
      });
    }
    return errorResponse(request, -32603, "Agent error: " + e.message);
  }
}

async function handleCancel(
  request: JsonRpcRequest,
  _params: Record<string, unknown>
): Promise<JsonRpcResponse> {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
    return response(request, { cancelled: true });
  }
  return response(request, { cancelled: false, message: "No active prompt to cancel" });
}

// ============================================================================
// Main ACP Server Loop
// ============================================================================

async function handleRequest(request: JsonRpcRequest): Promise<void> {
  if (!request.method || request.jsonrpc !== "2.0") {
    send(errorResponse(request, -32600, "Invalid JSON-RPC request"));
    return;
  }

  const params = request.params || {};

  switch (request.method) {
    case "initialize":
      send(await handleInitialize(request, params));
      break;
    case "newSession":
      send(await handleNewSession(request, params));
      break;
    case "loadSession":
      send(await handleLoadSession(request, params));
      break;
    case "prompt":
      send(await handlePrompt(request, params));
      break;
    case "cancel":
      send(await handleCancel(request, params));
      break;
    default:
      send(errorResponse(request, -32601, "Method not found: " + request.method));
  }
}

export async function runACPServer(): Promise<void> {
  await initializeToolRegistry();

  let buffer = "";

  process.stdin.setEncoding("utf-8");

  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;

    const lines = buffer.split("
");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const request = JSON.parse(trimmed) as JsonRpcRequest;
        handleRequest(request).catch((e) => {
          const errorReq: JsonRpcRequest = request;
          send(errorResponse(errorReq, -32603, "Unhandled error: " + e.message));
        });
      } catch {
        // Ignore malformed JSON
      }
    }
  });

  process.stdin.on("end", () => {
    const trimmed = buffer.trim();
    if (trimmed) {
      try {
        const request = JSON.parse(trimmed) as JsonRpcRequest;
        handleRequest(request).catch((e) => {
          const errorReq: JsonRpcRequest = request;
          send(errorResponse(errorReq, -32603, "Unhandled error: " + e.message));
        });
      } catch {
        // Ignore malformed JSON at end
      }
    }
  });
}
