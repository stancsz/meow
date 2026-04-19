/**
 * mcp-servers.ts
 * # MCP Servers Capability

Connect to Model Context Protocol servers for extended tooling.

## Core Features

1. **MCP Config** - Load server configs from JSON
2. **Server Connection** - stdio-based MCP communication
3. **Tool Proxy** - Expose MCP tools as Meow tools
4. **Resource Access** - MCP resources and prompts

## Minimal Slice

```typescript
// src/sidecars/mcp.ts
export async function connectMCPServer(config: MCPConfig) {
  // Spawn MCP server process
  // Send JSON-RPC initialize
  // Handle tool calls via stdio
}
```
 *
 * Harvested from: https://github.com/modelcontextprotocol/servers
 * Why: MCP servers provide tool integrations - filesystem, git, slack, etc.
 * Minimal slice: Implement mcp.ts that can connect to MCP servers via --mcp-config
 */

import { type Skill } from "./loader.ts";

export const mcp_servers: Skill = {
  name: "mcp-servers",
  description: "# MCP Servers Capability

Connect to Model Context Protocol servers for extended tooling.

## Core Features

1. **MCP Config** - Load server configs from JSON
2. **Server Connection** - stdio-based MCP communication
3. **Tool Proxy** - Expose MCP tools as Meow tools
4. **Resource Access** - MCP resources and prompts

## Minimal Slice

```typescript
// src/sidecars/mcp.ts
export async function connectMCPServer(config: MCPConfig) {
  // Spawn MCP server process
  // Send JSON-RPC initialize
  // Handle tool calls via stdio
}
```",
  async execute(context) {
    // TODO: Implement mcp-servers capability from https://github.com/modelcontextprotocol/servers
    // Implement mcp.ts that can connect to MCP servers via --mcp-config
    return { success: true, message: "mcp-servers capability" };
  },
};
