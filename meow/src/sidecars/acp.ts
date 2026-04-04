/**
 * acp.ts - ACP (Agent Client Protocol) sidecar for Meow
 *
 * Implements JSON-RPC 2.0 over stdio for programmatic control of Meow.
 * Methods: initialize, newSession, loadSession, prompt, cancel
 *
 * Usage: bun run cli/index.ts --acp
 * ACP clients send JSON-RPC requests on stdin and read responses from stdout.
 */
import { runLeanAgent } from "../core/lean-agent.ts";
import { initializeToolRegistry, getAllTools } from "../sidecars/tool-registry.ts";
import { createSession, appendToSession, loadSession } from "../core/session-store.ts";

// ============================================================================
// Types
// ============================================================================
