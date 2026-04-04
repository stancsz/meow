/// <reference types="node" />
/**
 * acp.ts - ACP (Agent Client Protocol) sidecar for Meow
 *
 * GAP-HARVEST-ACPMODE-01: Implement acp-mode capability
 *
 * ACP is a JSON-RPC 2.0 protocol over stdio.
 *
 * Supported methods:
 *   initialize   - Handshake: set up agent config and optional MCP servers
 *   newSession   - Create a new session
 *   loadSession  - Load an existing session by ID
 *   prompt       - Run a single prompt through the agent
 *   cancel       - Abort the current in-flight prompt
 */
import { runLeanAgent } from "../core/lean-agent.ts";
import { initializeToolRegistry } from "./tool-registry.ts";
import { setMCPToolRegistrar, loadMCPConfig } from "./mcp-client.ts";
