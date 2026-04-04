/**
 * acp.ts - Agent Client Protocol (ACP) mode sidecar for Meow
 *
 * Implements JSON-RPC 2.0 over stdio for programmatic control of Meow.
 * Methods: initialize, newSession, loadSession, prompt, cancel
 */
import { runLeanAgent } from "../core/lean-agent.ts";
import { initializeToolRegistry, getAllTools } from "./tool-registry.ts";
import { createSession, appendToSession, loadSession } from "../core/session-store.ts";

interface JSONRPCRequest { jsonrpc: "2.0"; id: string | number | null; method: string; params?: Record<string, unknown>; }
interface JSONRPCResponse { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string; data?: unknown }; }
interface JSONRPCNotification { jsonrpc: "2.0"; method: string; params?: Record<string, unknown>; }

const ERR_PARSE_ERROR = -32700;
const ERR_INVALID_REQUEST = -32600;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INTERNAL_ERROR = -32603;

interface ACPSession { id: string; messages: { role: string; content: string; timestamp: string }[]; }
let currentSession: ACPSession | null = null;
let currentAgentAbortController: AbortController | null = null;
let dangerousMode = false;
let initialized = false;

function sendResponse(response: JSONRPCResponse): void {
  process.stdout.write(JSON.stringify(response) + "\n");
}
function sendNotification(notification: JSONRPCNotification): void {
  process.stdout.write(JSON.stringify(notification) + "\n");
}