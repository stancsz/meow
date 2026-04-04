/**
 * acp.ts - Agent Client Protocol (ACP) mode sidecar for Meow
 *
 * Implements JSON-RPC 2.0 over stdio for programmatic control of Meow.
 * Methods: initialize, newSession, loadSession, prompt, cancel
 *
 * ACP is an open protocol - IDEs and tools can implement once, control any ACP agent.
 */
import { runLeanAgent, type LeanAgentOptions, type AgentResult } from "../core/lean-agent.ts";
import { initializeToolRegistry, getAllTools } from "./tool-registry.ts";
import { createSession, appendToSession, loadSession } from "../core/session-store.ts";

// JSON-RPC Types
interface JSONRPCRequest { jsonrpc: "2.0"; id: string | number | null; method: string; params?: Record<string, unknown>; }
interface JSONRPCResponse { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string; data?: unknown }; }
interface JSONRPCNotification { jsonrpc: "2.0"; method: string; params?: Record<string, unknown>; }

const ERR_PARSE_ERROR = -32700;
const ERR_INVALID_REQUEST = -32600;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INTERNAL_ERROR = -32603;

// ACP Session State
interface ACPSession { id: string; messages: { role: string; content: string; timestamp: string }[]; }
let currentSession: ACPSession | null = null;
let currentAgentAbortController: AbortController | null = null;
let dangerousMode = false;
let initialized = false;

function sendResponse(response: JSONRPCResponse): void { process.stdout.write(JSON.stringify(response) + "
"); }
function sendNotification(notification: JSONRPCNotification): void { process.stdout.write(JSON.stringify(notification) + "
"); }

// ACP Methods
async function handleInitialize(params: Record<string, unknown>) {
  initialized = true;
  if (params.dangerous === true) dangerousMode = true;
  return {
    protocolVersion: "1.0",
    capabilities: { sessions: true, tools: true, streaming: false },
  };
}

async function handleNewSession(): Promise<{ sessionId: string }> {
  if (currentSession) appendToSession(currentSession.id, currentSession.messages);
  const sessionId = createSession();
  currentSession = { id: sessionId, messages: [] };
  return { sessionId };
}

async function handleLoadSession(params: Record<string, unknown>) {
  const sessionId = params.sessionId as string;
  if (!sessionId) throw new Error("sessionId is required");
  const messages = loadSession(sessionId);
  currentSession = { id: sessionId, messages };
  return { sessionId, messages };
}

async function handlePrompt(params: Record<string, unknown>) {
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

async function handleCancel(): Promise<{ cancelled: boolean }> {
  if (currentAgentAbortController) {
    currentAgentAbortController.abort();
    return { cancelled: true };
  }
  return { cancelled: false };
}

function toolsList() {
  return getAllTools().map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
}

// Dispatcher
async function dispatch(request: JSONRPCRequest): Promise<void> {
  const { id, method, params = {} } = request;
  try {
    let result: unknown;
    switch (method) {
      case "initialize": result = await handleInitialize(params); break;
      case "newSession": result = await handleNewSession(); break;
      case "loadSession": result = await handleLoadSession(params); break;
      case "prompt": result = await handlePrompt(params); break;
      case "cancel": result = await handleCancel(); break;
      case "tools/list": result = toolsList(); break;
      default:
        sendResponse({ jsonrpc: "2.0", id, error: { code: ERR_METHOD_NOT_FOUND, message: "Method not found: " + method } });
        return;
    }
    sendResponse({ jsonrpc: "2.0", id, result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    sendResponse({ jsonrpc: "2.0", id, error: { code: ERR_INTERNAL_ERROR, message: msg } });
  }
}

function isValidRequest(obj: unknown): boolean {
  return typeof obj === "object" && obj !== null && (obj as any).jsonrpc === "2.0" && typeof (obj as any).method === "string";
}

export async function startACPServer(): Promise<void> {
  await initializeToolRegistry();
  const rl = await import("node:readline").then((m) => m.createInterface({ input: process.stdin, crlfDelay: Infinity }));
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(trimmed); }
    catch { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: ERR_PARSE_ERROR, message: "Parse error" } }) + "
"); continue; }
    if (Array.isArray(parsed)) { for (const req of parsed) { if (isValidRequest(req)) await dispatch(req as JSONRPCRequest); } }
    else if (isValidRequest(parsed)) { await dispatch(parsed as JSONRPCRequest); }
  }
}