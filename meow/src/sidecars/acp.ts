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
        { role: "assistant", content: result.content, timestamp: new Date().toISOString() }
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
// handleNewSession
function handleNewSession(params?: Record<string, unknown>): unknown {
  const sessionId = (params?.id as string) || generateId();
  const session: ACPSession = { id: sessionId, messages: [], createdAt: currentTimeISO() };
  sessions.set(sessionId, session);
  acpState.currentSession = session;
  return { sessionId, createdAt: session.createdAt };
}

// handleLoadSession
function handleLoadSession(params?: Record<string, unknown>): unknown {
  const sessionId = params?.sessionId as string;
  if (!sessionId) { throw new Error("sessionId is required"); }
  const session = sessions.get(sessionId);
  if (!session) { throw new Error("Session not found: " + sessionId); }
  acpState.currentSession = session;
  return { sessionId, messages: session.messages, createdAt: session.createdAt };
}
// handlePrompt
async function handlePrompt(params?: Record<string, unknown>): Promise<unknown> {
  const prompt = params?.prompt as string;
  if (!prompt) { throw new Error("prompt is required"); }
  let session: ACPSession | null = null;
  if (params?.sessionId) { session = sessions.get(params.sessionId as string) || null; }
  if (!session) session = acpState.currentSession;
  const dangerous = params?.dangerous !== undefined ? params.dangerous as boolean : acpState.dangerous;
  const maxIterations = (params?.maxIterations as number) || 10;
  if (acpState.currentAbortController) { acpState.currentAbortController.abort(); }
  const abortController = new AbortController();
  acpState.currentAbortController = abortController;
  const abortPromise = new Promise<never>((_, reject) => {
    abortController.signal.addEventListener("abort", () => { reject(new Error("CANCELLED")); });
  });
  try {
    const messages: { role: string; content: string }[] = [];
    if (session) { messages.push(...session.messages); }
    const result = await Promise.race([
      runLeanAgent(prompt, { dangerous, maxIterations, abortSignal: abortController.signal, messages: messages.length > 0 ? messages : undefined }),
      abortPromise,
    ]);
    if (session) {
      session.messages.push({ role: "user", content: prompt });
      session.messages.push({ role: "assistant", content: result.content });
    }
    return { content: result.content, iterations: result.iterations, completed: result.completed, usage: result.usage };
  } finally {
    acpState.currentAbortController = null;
  }
}
// handleCancel
function handleCancel(): unknown {
  if (acpState.currentAbortController) {
    acpState.currentAbortController.abort();
    acpState.currentAbortController = null;
    return { cancelled: true };
  }
  return { cancelled: false, reason: "No in-flight prompt to cancel" };
}

// Server loop helpers
function parseJsonRpc(data: string): JsonRpcRequest | null {
  try {
    const parsed = JSON.parse(data);
    if (parsed && parsed.jsonrpc === "2.0" && typeof parsed.method === "string") { return parsed as JsonRpcRequest; }
  } catch { /* not valid JSON */ }
  return null;
}
async function processRequest(req: JsonRpcRequest): Promise<string> {
  const { id, method, params } = req;
  try {
    switch (method) {
      case "initialize": return jsonResponse(id, await handleInitialize(params));
      case "newSession": return jsonResponse(id, handleNewSession(params));
      case "loadSession": return jsonResponse(id, handleLoadSession(params));
      case "prompt": return jsonResponse(id, await handlePrompt(params));
      case "cancel": return jsonResponse(id, handleCancel());
      default: return jsonError(id, ACP_ERROR_METHOD_NOT_FOUND, "Method not found: " + method);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "CANCELLED") { return jsonError(id, ACP_ERROR_CANCELLED, "Prompt was cancelled"); }
    console.error("[ACP] Error handling method", method + ":", msg);
    return jsonError(id, ACP_ERROR_INTERNAL, msg);
  }
}
