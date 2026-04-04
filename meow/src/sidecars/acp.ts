/// <reference types="node" />
/**
 * acp.ts - ACP (Agent Client Protocol) sidecar
 *
 * Implements JSON-RPC 2.0 over stdio for programmatic control of Meow.
 * Supported methods: initialize, newSession, loadSession, prompt, cancel.
 */
interface JsonRpcRequest { jsonrpc: "2.0"; id: number | string | null; method: string; params?: Record<string, unknown>; }
interface JsonRpcResponse { jsonrpc: "2.0"; id: number | string | null; result?: unknown; error?: { code: number; message: string; data?: unknown; }; }
interface InitializeParams { capabilities?: { mcpServers?: Array<{ command: string; args?: string[] }>; dangerous?: boolean; }; sessionId?: string; }
interface PromptParams { prompt: string; dangerous?: boolean; systemPrompt?: string; }
interface NewSessionParams { sessionId?: string; }
interface LoadSessionParams { sessionId: string; }