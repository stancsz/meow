/**
 * mcp.ts
 *
 * MCP (Model Context Protocol) skill for Meow.
 * Delegates to the mcp-client sidecar for connection management.
 */
import type { Skill, SkillContext, SkillResult } from "./loader.ts";
import {
  connectMCPServer,
  disconnectMCPServer,
  getAllMCPTools,
  callMCPTool,
  loadMCPConfig,
  type MCPServerConfig,
} from "../sidecars/mcp-client.ts";

export const mcp: Skill = {
  name: "mcp",
  description: "Connect to and use MCP (Model Context Protocol) servers",
  aliases: ["mcp-client", "modelcontextprotocol"],

  async execute(args: string, _ctx: SkillContext): Promise<SkillResult> {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0]?.toLowerCase();

    if (!sub || sub === "help" || sub === "--help") {
      return {
        content: `MCP commands:
  /mcp connect <name> <cmd> [args...]  Connect to an MCP server
  /mcp disconnect <name>               Disconnect from an MCP server
  /mcp list                            List connected servers and their tools
  /mcp call <server> <tool> [k=v...]   Call an MCP tool
  /mcp servers                         List connected servers
  /mcp load                            Load servers from ~/.agent-kernel/mcp.json

Examples:
  /mcp connect test bun run scripts/mock-mcp-server.ts
  /mcp call test echo text="Hello, MCP!"
  /mcp list`,
      };
    }

    switch (sub) {
      case "connect": {
        const name = parts[1], cmd = parts[2], args2 = parts.slice(3);
        if (!name || !cmd) return { content: "", error: "Usage: /mcp connect <name> <cmd> [args...]" };
        return handleConnect(name, cmd, args2);
      }
      case "disconnect": {
        const name = parts[1];
        if (!name) return { content: "", error: "Usage: /mcp disconnect <name>" };
        return handleDisconnect(name);
      }
      case "list": return handleList();
      case "call": {
        const server = parts[1], tool = parts[2], rawArgs = parts.slice(3);
        if (!server || !tool) return { content: "", error: "Usage: /mcp call <server> <tool> [k=v]" };
        return handleCall(server, tool, rawArgs);
      }
      case "servers": return handleServers();
      case "load": return handleLoad();
      default: return { content: "", error: "Unknown command. Run /mcp help." };
    }
  },
};

function parseArgs(args: string[]): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const a of args) {
    const ei = a.indexOf("=");
    if (ei >= 0) { const k = a.slice(0, ei), v = a.slice(ei + 1); try { r[k] = JSON.parse(v); } catch { r[k] = v; } }
  }
  return r;
}

async function handleConnect(name: string, cmd: string, cmdArgs: string[]): Promise<SkillResult> {
  try {
    const config: MCPServerConfig = { name, command: cmd, args: cmdArgs };
    await connectMCPServer(config);
    const tools = getAllMCPTools().filter(t => t.server === name);
    return { content: `Connected to "${name}". ${tools.length} tools available.\n\nTools:\n${tools.map(t => `  - mcp__${name}__${t.tool.name}`).join("\n")}\n\nUse /mcp list to see all tools.` };
  } catch (err: any) {
    return { content: "", error: `Connection failed: ${err.message}` };
  }
}

function handleDisconnect(name: string): SkillResult {
  try {
    disconnectMCPServer(name);
    return { content: `Disconnected from "${name}".` };
  } catch (err: any) {
    return { content: "", error: err.message };
  }
}

function handleList(): SkillResult {
  const allTools = getAllMCPTools();
  if (allTools.length === 0) {
    return { content: "No MCP servers connected.\n\nLoad servers from ~/.agent-kernel/mcp.json with /mcp load,\nor connect manually with /mcp connect <name> <cmd> [args]." };
  }

  // Group tools by server
  const byServer = new Map<string, typeof allTools>();
  for (const entry of allTools) {
    if (!byServer.has(entry.server)) byServer.set(entry.server, []);
    byServer.get(entry.server)!.push(entry);
  }

  let out = "## Connected MCP Servers\n\n";
  for (const [server, tools] of byServer) {
    out += `### ${server}\n`;
    if (tools.length === 0) {
      out += "  No tools.\n";
    } else {
      for (const { tool } of tools) {
        out += `  - mcp__${server}__${tool.name}`;
        if (tool.description) out += ` — ${tool.description}`;
        out += "\n";
      }
    }
    out += "\n";
  }
  return { content: out };
}

async function handleCall(server: string, tool: string, rawArgs: string[]): Promise<SkillResult> {
  const args = parseArgs(rawArgs);
  const result = await callMCPTool(server, tool, args);
  if (result.error) {
    return { content: "", error: result.error };
  }
  return { content: result.content };
}

function handleServers(): SkillResult {
  const allTools = getAllMCPTools();
  if (allTools.length === 0) {
    return { content: "No MCP servers connected." };
  }

  const servers = [...new Set(allTools.map(t => t.server))];
  let out = "## MCP Servers\n\n";
  for (const s of servers) {
    const count = allTools.filter(t => t.server === s).length;
    out += `- ${s}: ${count} tool(s)\n`;
  }
  return { content: out };
}

async function handleLoad(): Promise<SkillResult> {
  const result = await loadMCPConfig();
  if (result.servers.length === 0 && result.failed.length === 0) {
    return { content: "No ~/.agent-kernel/mcp.json found. Create one with:\n  {\"servers\": [{\"name\": \"...\", \"command\": \"...\", \"args\": [...]}]}" };
  }
  let out = "";
  if (result.servers.length > 0) {
    out += `Connected: ${result.servers.join(", ")}\n`;
  }
  if (result.failed.length > 0) {
    out += `Failed: ${result.failed.join(", ")}\n`;
  }
  return { content: out };
}

