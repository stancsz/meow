/// <reference types="node" />
/**
 * acp.ts - ACP (Agent Client Protocol) sidecar for Meow
 *
 * Implements JSON-RPC 2.0 over stdio for programmatic control of Meow.
 * IDEs and tools can control Meow headlessly via JSON-RPC messages.
 *
 * Methods:
 *   initialize  - Set up agent config, register MCP servers
 *   newSession  - Create a new session, return session id
 *   loadSession - Load an existing session by id
 *   prompt      - Run a single prompt through the agent, return response
 *   cancel      - Abort the current running prompt
 *
 * Reference: docs/harvest/acp-mode.md
 */

import { runLeanAgent, type LeanAgentOptions, type AgentResult } from "../core/lean-agent.ts";

async function handlePrompt(id: number | string | null, params: PromptParams): Promise<void> { const { initializeToolRegistry } = await import("./tool-registry.ts"); await initializeToolRegistry(); const { initializeCheckpointing } = await import("./checkpointing.ts"); await initializeCheckpointing(); const { runLeanAgent } = await import("../core/lean-agent.ts"); agentAbortController = new AbortController(); const abortSignal = agentAbortController.signal; try { const result = await runLeanAgent(params.prompt, { dangerous: params.dangerous ?? dangerousMode, systemPrompt: params.systemPrompt, abortSignal }); sendResponse(jsonRpcResponse(id, { content: result.content, iterations: result.iterations, completed: result.completed, usage: result.usage })); } catch (e: unknown) { const err = e as Error; if (err.message === "Interrupted") { sendResponse(jsonRpcResponse(id, { content: "", iterations: 0, completed: false, cancelled: true })); } else { sendResponse(jsonRpcError(id, ACP_ERROR_INTERNAL_ERROR, "Agent error: " + err.message)); } } finally { agentAbortController = null; } }
// ============================================================================
// JSON-RPC Types
// ============================================================================

interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: JSONRPCError;
}

interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

const ERR_PARSE_ERROR = -32700;
const ERR_INVALID_REQUEST = -32600;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INTERNAL_ERROR = -32603;

function makeResponse(id: number | string | null, result: unknown): JSONRPCResponse {
  return { jsonrpc: "2.0", id, result };
}

function makeError(id: number | string | null, code: number, message: string, data?: unknown): JSONRPCResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

async function handleCancel(id: number | string | null): Promise<void> { if (agentAbortController) { agentAbortController.abort(); agentAbortController = null; sendResponse(jsonRpcResponse(id, { cancelled: true })); } else { sendResponse(jsonRpcResponse(id, { cancelled: false })); } }
function handleUnknownMethod(id: number | string | null, method: string): void { sendResponse(jsonRpcError(id, ACP_ERROR_METHOD_NOT_FOUND, "Method not found: " + method)); }

// Request Dispatcher

async function dispatchRequest(request: JsonRpcRequest): Promise<void> { const { method, params = {}, id } = request; switch (method) { case "initialize": await handleInitialize(id, params as InitializeParams); break; case "newSession": await handleNewSession(id, params as NewSessionParams); break; case "loadSession": await handleLoadSession(id, params as LoadSessionParams); break; case "prompt": await handlePrompt(id, params as PromptParams); break; case "cancel": await handleCancel(id); break; default: handleUnknownMethod(id, method); } }

// JSON-RPC Batch Support

function parseRequest(input: string): JsonRpcRequest | JsonRpcRequest[] | null { try { const parsed = JSON.parse(input); if (Array.isArray(parsed)) { return parsed as JsonRpcRequest[]; } return parsed as JsonRpcRequest; } catch { return null; } }