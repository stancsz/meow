/**
 * acp.ts — Agent Client Protocol (ACP) mode sidecar
 *
 * Implements JSON-RPC 2.0 over stdio for programmatic control of Meow.
 * Methods: initialize, newSession, loadSession, prompt, cancel
 *
 * ACP is an open protocol — IDEs and tools can implement once, control any ACP agent.
 */
import { runLeanAgent } from "../core/lean-agent.ts";
import { initializeToolRegistry, getAllTools } from "./tool-registry.ts";
import { createSession, appendToSession, loadSession } from "../core/session-store.ts";

// ============================================================================
// JSON-RPC Types
// ============================================================================

interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JSONRPCNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

// ============================================================================
// ACP Session State
// ============================================================================

interface ACPSession {
  id: string;
  messages: { role: string; content: string; timestamp: string }[];
}

let currentSession: ACPSession | null = null;
let currentAgentAbortController: AbortController | null = null;
let dangerousMode = false;
let initialized = false;

// ============================================================================
// JSON-RPC Transport
// ============================================================================

function sendResponse(response: JSONRPCResponse): void {
  process.stdout.write(JSON.stringify(response) + "\n");
}

function sendNotification(notification: JSONRPCNotification): void {
  process.stdout.write(JSON.stringify(notification) + "\n");
}

// ============================================================================
// ACP Methods
// ============================================================================

async function handleInitialize(params: Record<string, unknown>): Promise<{ protocolVersion: string; capabilities: Record<string, unknown> }> {
  initialized = true;
  if (params.dangerous === true) {
    dangerousMode = true;
  }
  return {
    protocolVersion: "1.0",
    capabilities: {
      sessions: true,
      tools: true,
      streaming: false,
    },
  };
}

async function handleNewSession(_params: Record<string, unknown>): Promise<{ sessionId: string }> {
  if (currentSession) {
    appendToSession(currentSession.id, currentSession.messages);
  }
  const sessionId = createSession();
  currentSession = { id: sessionId, messages: [] };
  return { sessionId };
}

async function handleLoadSession(params: Record<string, unknown>): Promise<{ sessionId: string; messages: { role: string; content: string; timestamp: string }[] }> {
  const sessionId = params.sessionId as string;
  if (!sessionId) throw new Error("sessionId is required");
  const messages = loadSession(sessionId);
  currentSession = { id: sessionId, messages };
  return { sessionId, messages };
}

async function handlePrompt(params: Record<string, unknown>): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCost: number } }> {
  const promptText = params.prompt as string;
  if (!promptText) throw new Error("prompt is required");

  currentAgentAbortController = new AbortController();
  const sessionMessages = currentSession?.messages ?? [];

  try {
    const result = await runLeanAgent(promptText, {
      dangerous: dangerousMode,
      abortSignal: currentAgentAbortController.signal,
      messages: sessionMessages.map((m) => ({ role: m.role, content: m.content })),
    });

    if (currentSession) {
      currentSession.messages.push(
        { role: "user", content: promptText, timestamp: new Date().toISOString() },
        { role: "assistant", content: result.content, timestamp: new Date().ToISOString() }
      );
    }

    return { content: result.content, usage: result.usage };
  } finally {
    currentAgentAbortController = null;
  }
}

async function handleCancel(_params: Record<string, unknown>): Promise<{ cancelled: boolean }> {
  if (currentAgentAbortController) {
    currentAgentAbortController.abort();
    return { cancelled: true };
  }
  return { cancelled: false };
}

// ============================================================================
// Dispatcher
// ============================================================================

async function dispatch(request: JSONRPCRequest): Promise<void> {
  const { id, method, params = {} } = request;

  try {
    let result: unknown;

    switch (method) {
      case "initialize":
        result = await handleInitialize(params);
        break;
      case "newSession":
        result = await handleNewSession(params);
        break;
      case "loadSession":
        result = await handleLoadSession(params);
        break;
      case "prompt":
        result = await handlePrompt(params);
        break;
      case "cancel":
        result = await handleCancel(params);
        break;
      case "tools/list":
        result = getAllTools().map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
        break;
      default:
        sendResponse({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
        return;
    }

    sendResponse({ jsonrpc: "2.0", id, result });
  } catch (err: any) {
    sendResponse({ jsonrpc: "2.0", id, error: { code: -32603, message: err.message || "Internal error", data: err.stack } });
  }
}

// ============================================================================
// Helpers
// ============================================================================

function isValidRequest(obj: unknown): boolean {
  return typeof obj === "object" && obj !== null && (obj as any).jsonrpc === "2.0" && typeof (obj as any).method === "string";
}

// ============================================================================
// Main entry point — starts the ACP server
// ============================================================================

export async function startACPServer(): Promise<void> {
  await initializeToolRegistry();

  const rl = await import("node:readline").then((m) =>
    m.createInterface({ input: process.stdin, crlfDelay: Infinity })
  );

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n");
      continue;
    }

    if (Array.isArray(parsed)) {
      for (const req of parsed) {
        if (isValidRequest(req)) await dispatch(req as JSONRPCRequest);
      }
    } else if (isValidRequest(parsed)) {
      await dispatch(parsed as JSONRPCRequest);
    }
  }
}
