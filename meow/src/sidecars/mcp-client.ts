/**
 * mcp-client.ts
 *
 * MCP (Model Context Protocol) client sidecar.
 * Connects to MCP servers and exposes their tools to the agent.
 *
 * Supports stdio transport for local MCP servers.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPToolResult {
  content: string;
  error?: string;
}

interface MCPMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// Global registry of connected MCP servers
const connectedServers: Map<string, MCPConnection> = new Map();

class MCPConnection {
  private process: ChildProcess | null = null;
  private pendingRequests: Map<number | string, { resolve: (v: unknown) => void; reject: (e: Error) => void }> = new Map();
  private tools: Map<string, MCPTool> = new Map();
  private messageId = 0;
  private serverName: string;
  private initialized = false;

  constructor(serverName: string) {
    this.serverName = serverName;
  }

  async connect(config: MCPServerConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      this.process = spawn(config.command, config.args || [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...config.env },
      });

      this.process.stdout?.on("data", (data) => {
        this.handleMessage(data.toString());
      });

      this.process.stderr?.on("data", (data) => {
        console.error(`[MCP ${this.serverName} stderr]:`, data.toString());
      });

      this.process.on("error", (err) => {
        reject(err);
      });

      this.process.on("close", (code) => {
        console.log(`[MCP ${this.serverName}] exited with code ${code}`);
        this.cleanup();
      });

      // Initialize and wait for tools
      this.initialize().then(() => {
        this.initialized = true;
        resolve();
      }).catch(reject);

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!this.initialized) {
          reject(new Error(`MCP server ${this.serverName} initialization timed out`));
        }
      }, 10000);
    });
  }

  private async initialize(): Promise<void> {
    // Send initialize request
    await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      clientInfo: { name: "meow", version: "0.1.0" },
    });

    // Send initialized notification (no response expected)
    this.sendNotification("initialized", {});
  }

  private handleMessage(data: string): void {
    const lines = data.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const msg: MCPMessage = JSON.parse(line);
        if (msg.id !== undefined) {
          const pending = this.pendingRequests.get(msg.id);
          if (pending) {
            if (msg.error) {
              pending.reject(new Error(msg.error.message));
            } else {
              pending.resolve(msg.result);
            }
            this.pendingRequests.delete(msg.id);
          }
        } else if (msg.method?.endsWith("/list_tools")) {
          // Handle tool listing
          const result = msg.params;
          if (result && typeof result === "object") {
            // tools listed in result
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  private sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const msg: MCPMessage = { jsonrpc: "2.0", id, method, params };
      this.pendingRequests.set(id, { resolve, reject });
      this.process?.stdin?.write(JSON.stringify(msg) + "\n");
    });
  }

  private sendNotification(method: string, params?: Record<string, unknown>): void {
    const msg: MCPMessage = { jsonrpc: "2.0", method, params };
    this.process?.stdin?.write(JSON.stringify(msg) + "\n");
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.initialized) return [];

    try {
      const result = await this.sendRequest("tools/list") as { tools?: MCPTool[] };
      if (result?.tools) {
        for (const tool of result.tools) {
          this.tools.set(tool.name, tool);
        }
        return result.tools;
      }
    } catch (err) {
      console.error(`[MCP ${this.serverName}] listTools error:`, err);
    }
    return [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    if (!this.initialized) {
      return { content: "", error: "MCP server not initialized" };
    }

    try {
      const result = await this.sendRequest("tools/call", { name, arguments: args }) as { content?: unknown };
      const content = Array.isArray(result?.content) ? result.content.map((c: any) => c.text || JSON.stringify(c)).join("\n") : String(result?.content || "");
      return { content };
    } catch (err: any) {
      return { content: "", error: err.message };
    }
  }

  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  isConnected(): boolean {
    return this.initialized && this.process !== null && !this.process.killed;
  }

  disconnect(): void {
    this.cleanup();
  }

  private cleanup(): void {
    this.pendingRequests.clear();
    this.tools.clear();
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    connectedServers.delete(this.serverName);
  }
}

// ============================================================================
// MCP Client API
// ============================================================================

/**
 * Connect to an MCP server
 */
export async function connectMCPServer(config: MCPServerConfig): Promise<void> {
  const connection = new MCPConnection(config.name);
  await connection.connect(config);
  connectedServers.set(config.name, connection);
}

/**
 * Disconnect from an MCP server
 */
export function disconnectMCPServer(name: string): void {
  const connection = connectedServers.get(name);
  if (connection) {
    connection.disconnect();
  }
}

/**
 * Get tools from a specific MCP server
 */
export function getMCPTools(serverName: string): MCPTool[] {
  const connection = connectedServers.get(serverName);
  return connection?.getAllTools() || [];
}

/**
 * Get all tools from all connected MCP servers
 */
export function getAllMCPTools(): { server: string; tool: MCPTool }[] {
  const result: { server: string; tool: MCPTool }[] = [];
  for (const [name, connection] of connectedServers) {
    for (const tool of connection.getAllTools()) {
      result.push({ server: name, tool });
    }
  }
  return result;
}

/**
 * Call an MCP tool from a specific server
 */
export async function callMCPTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
  const connection = connectedServers.get(serverName);
  if (!connection) {
    return { content: "", error: `MCP server ${serverName} not connected` };
  }
  return connection.callTool(toolName, args);
}

/**
 * Load MCP servers from configuration file (~/.meow/mcp.json)
 */
export async function loadMCPConfig(): Promise<void> {
  try {
    const configPath = join(process.env.HOME || process.env.USERPROFILE || "", ".meow", "mcp.json");
    const content = readFileSync(configPath, "utf-8");
    const config = JSON.parse(content) as { servers?: MCPServerConfig[] };

    if (config.servers) {
      for (const server of config.servers) {
        try {
          await connectMCPServer(server);
          console.log(`[MCP] Connected to ${server.name}`);
        } catch (err) {
          console.error(`[MCP] Failed to connect to ${server.name}:`, err);
        }
      }
    }
  } catch {
    // Config file doesn't exist - that's fine
  }
}

/**
 * Format MCP tools for the agent's system prompt
 */
export function formatMCPToolsForPrompt(): string {
  const tools = getAllMCPTools();
  if (tools.length === 0) return "";

  let output = "\n\n## MCP Tools (external)\n";
  for (const { server, tool } of tools) {
    output += `- mcp__${server}__${tool.name} - ${tool.description || "MCP tool from " + server}\n`;
  }
  return output;
}
