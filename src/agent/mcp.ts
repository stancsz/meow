import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

export interface McpConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export class McpManager {
  private clients: Map<string, Client> = new Map();
  private configs: Map<string, McpConfig> = new Map();

  constructor() {}

  getClients(): Map<string, Client> {
    return this.clients;
  }

  async addServer(config: McpConfig) {
    this.configs.set(config.name, config);
  }

  getConfigs(): Map<string, McpConfig> {
    return this.configs;
  }

  async connect(name: string) {
    const config = this.configs.get(name);
    if (!config) throw new Error(`MCP Server ${name} not found in config`);

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...process.env, ...config.env } as Record<string, string>,
    });

    const client = new Client(
      { name: "meow-agent", version: "0.1.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
    this.clients.set(name, client);
    console.log(`✓ Connected to MCP Server: ${name}`);
  }

  async listAllTools() {
    const allTools = [];
    for (const [name, client] of this.clients) {
      const results = await client.listTools();
      for (const tool of results.tools) {
        allTools.push({
          server: name,
          ...tool,
        });
      }
    }
    return allTools;
  }

  async callTool(serverName: string, toolName: string, args: any) {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`Not connected to MCP Server: ${serverName}`);

    return await client.callTool(
      { name: toolName, arguments: args },
      CallToolResultSchema
    );
  }

  async callToolParallel(
    calls: Array<{ serverName: string; toolName: string; args: any }>
  ): Promise<Array<{ serverName: string; toolName: string; result?: any; error?: string }>> {
    return Promise.all(
      calls.map(async ({ serverName, toolName, args }) => {
        try {
          const result = await this.callTool(serverName, toolName, args);
          return { serverName, toolName, result };
        } catch (e: any) {
          return { serverName, toolName, result: undefined, error: e.message };
        }
      })
    );
  }

  async disconnectAll() {
    for (const client of this.clients.values()) {
      await client.close();
    }
  }
}
