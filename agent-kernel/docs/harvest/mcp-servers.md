---
name: mcp-servers
repo: https://github.com/modelcontextprotocol/servers
why: MCP servers provide tool integrations - filesystem, git, slack, etc.
minimalSlice: "Implement mcp.ts that can connect to MCP servers via --mcp-config"
fit: sidecar
complexity: 3
status: pending
---

# MCP Servers Capability

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
