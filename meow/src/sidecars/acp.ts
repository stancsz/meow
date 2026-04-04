/**
 * acp.ts - Agent Client Protocol (ACP) mode sidecar for Meow
 *
 * Implements JSON-RPC 2.0 over stdio for programmatic control of Meow.
 * Methods: initialize, newSession, loadSession, prompt, cancel, tools/list
 */
import * as readline from "node:readline";
import { stdin as input } from "node:process";
import { runLeanAgent } from "../core/lean-agent.ts";
import { getAllTools } from "./tool-registry.ts";
import { createSession, appendToSession, loadSession } from "../core/session-store.ts";

const ERR_PARSE_ERROR = -32700;
const ERR_INVALID_REQUEST = -32600;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INTERNAL_ERROR = -32603;

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

interface ACPSession {
  id: string;
  messages: { role: string; content: string; timestamp: string }[];
}

let currentSession: ACPSession | null = null;
let currentAgentAbortController: AbortController | null = null;
let dangerousMode = false;

function sendResponse(response: JSONRPCResponse): void {
  process.stdout.write(JSON.stringify(response) + "\n");
}

async function handleInitialize(params: Record<string, unknown>) {
  if (params.dangerous === true) dangerousMode = true;
  return {
    protocolVersion: "1.0",
    capabilities: { sessions: true, tools: true, streaming: false },
  };
}

async function handleNewSession() {
  if (currentSession) {
    appendToSession(currentSession.id, currentSession.messages);
  }
  const id = createSession();
  currentSession = { id, messages: [] };
  return { sessionId: id };
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
  const msgs = currentSession?.messages ?? [];

  try {
    const result = await runLeanAgent(promptText, {
      dangerous: dangerousMode,
      abortSignal: currentAgentAbortController.signal,
      messages: msgs.map((m) => ({ role: m.role, content: m.content })),
    });

    if (currentSession) {
      currentSession.messages.push(
        { role: "user", content: promptText, timestamp: new Date().toISOString() },
        { role: "assistant", content: result.content, timestamp: new Date().toISOString() },
      );
    }
    return { content: result.content, usage: result.usage };
  } finally {
    currentAgentAbortController = null;
  }
}

async function handleCancel() {
  if (currentAgentAbortController) {
    currentAgentAbortController.abort();
    return { cancelled: true };
  }
  return { cancelled: false };
}

async function dispatch(req: JSONRPCRequest) {
  const { id, method, params = {} } = req;
  try {
    let result: unknown;
    switch (method) {
      case "initialize":
        result = await handleInitialize(params);
        break;
      case "newSession":
        result = await handleNewSession();
        break;
      case "loadSession":
        result = await handleLoadSession(params);
        break;
      case "prompt":
        result = await handlePrompt(params);
        break;
      case "cancel":
        result = await handleCancel();
        break;
      case "tools/list":
        result = getAllTools().map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        }));
        break;
      default:
        sendResponse({
          jsonrpc: "2.0",
          id,
          error: { code: ERR_METHOD_NOT_FOUND, message: "Method not found: " + method },
        });
        return;
    }
    sendResponse({ jsonrpc: "2.0", id, result });
  } catch (err: any) {
    sendResponse({
      jsonrpc: "2.0",
      id,
      error: { code: ERR_INTERNAL_ERROR, message: err.message || "Internal error", data: err.stack },
    });
  }
}

function isValidRequest(obj: unknown): boolean {
  return typeof obj === "object" && obj !== null &&
    (obj as any).jsonrpc === "2.0" &&
    typeof (obj as any).method === "string";
}

/**
 * Start the ACP JSON-RPC server over stdio.
 * Reads JSON-RPC requests from stdin line-by-line, sends responses to stdout.
 */
export async function startACPServer(): Promise<void> {
  const rl = readline.createInterface({ input, output: process.stdout });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (isValidRequest(parsed)) {
        await dispatch(parsed as JSONRPCRequest);
      } else {
        sendResponse({
          jsonrpc: "2.0",
          id: null,
          error: { code: ERR_INVALID_REQUEST, message: "Invalid request" },
        });
      }
    } catch (e: any) {
      sendResponse({
        jsonrpc: "2.0",
        id: null,
        error: { code: ERR_PARSE_ERROR, message: "Parse error: " + e.message },
      });
    }
  }
}
