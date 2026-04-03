/**
 * mcp.ts
 *
 * MCP (Model Context Protocol) skill for Meow.
 * Connects to MCP servers and exposes their tools.
 */
import { spawn } from "node:child_process";
import type { Skill, SkillContext, SkillResult } from "./loader.ts";

export const mcp: Skill = {
  name: "mcp",
  description: "Connect to and use MCP (Model Context Protocol) servers",
  aliases: ["mcp-client", "modelcontextprotocol"],

  async execute(args: string, _ctx: SkillContext): Promise<SkillResult> {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0]?.toLowerCase();

    if (!sub || sub === "help" || sub === "--help") {
      return { content: "MCP commands:\n  /mcp connect <name> <cmd> [args]\n  /mcp disconnect <name>\n  /mcp list\n  /mcp call <server> <tool> [k=v]\n  /mcp servers" };
    }

    switch (sub) {
      case "connect": {
        const name = parts[1], cmd = parts[2], args2 = parts.slice(3);
        if (!name || !cmd) return { content: "", error: "Usage: /mcp connect <name> <cmd> [args]" };
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
      default: return { content: "", error: "Unknown command. Run /mcp help." };
    }
  },
};

interface MCPToolInfo { description?: string; inputSchema: Record<string, unknown>; }

interface MCPConn {
  name: string;
  proc: ReturnType<typeof spawn>;
  tools: Map<string, MCPToolInfo>;
  msgId: number;
  pending: Map<number, { res: (v: unknown) => void; rej: (e: Error) => void }>;
  init: boolean;
}

const conns = new Map<string, MCPConn>();

function parseArgs(args: string[]): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const a of args) {
    const ei = a.indexOf("=");
    if (ei >= 0) { const k = a.slice(0, ei), v = a.slice(ei + 1); try { r[k] = JSON.parse(v); } catch { r[k] = v; } }
  }
  return r;
}

function parseLines(buf: string): { msg: unknown; rest: string } | null {
  const ls = buf.split("\n");
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i].trim();
    if (!l) continue;
    try { return { msg: JSON.parse(l), rest: ls.slice(i + 1).join("\n") }; } catch {}
  }
  return null;
}

async function sendReq(conn: MCPConn, method: string, params?: Record<string, unknown>): Promise<unknown> {
  return new Promise((res, rej) => {
    const id = ++conn.msgId;
    conn.pending.set(id, { res, rej });
    conn.proc.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => { if (conn.pending.has(id)) { conn.pending.delete(id); rej(new Error("Request timeout")); } }, 10000);
  });
}

async function handleConnect(name: string, cmd: string, cmdArgs: string[]): Promise<SkillResult> {
  if (conns.has(name)) return { content: "", error: "Server already connected." };
  return new Promise((resolve) => {
    let buf = "";
    const proc = spawn(cmd, cmdArgs, { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env } });
    const conn: MCPConn = { name, proc, tools: new Map(), msgId: 0, pending: new Map(), init: false };
    conns.set(name, conn);
    proc.stdout?.on("data", (d: Buffer) => {
      buf += d.toString();
      while (true) { const p = parseLines(buf); if (!p) break; buf = p.rest; const m = p.msg as { id?: number; result?: unknown; error?: { message: string } }; if (m.id !== undefined) { const pen = conn.pending.get(m.id); if (pen) { if (m.error) pen.rej(new Error(m.error.message)); else pen.res(m.result); conn.pending.delete(m.id); } } }
    });
    proc.stderr?.on("data", (d: Buffer) => console.error("[MCP " + name + " stderr]:", d.toString()));
    proc.on("error", (e) => { conns.delete(name); resolve({ content: "", error: "Failed: " + e.message }); });
    proc.on("close", () => conns.delete(name));
    (async () => {
      try {
        await sendReq(conn, "initialize", { protocolVersion: "2024-11-05", capabilities: { tools: {} }, clientInfo: { name: "meow", version: "0.1.0" } });
        proc.stdin?.write(JSON.stringify({ jsonrpc: "2.0", method: "initialized", params: {} }) + "\n");
        conn.init = true;
        try { const tr = await sendReq(conn, "tools/list") as { tools?: Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }> }; if (tr?.tools) for (const t of tr.tools) conn.tools.set(t.name, { description: t.description, inputSchema: t.inputSchema || {} }); } catch {}
        resolve({ content: "Connected to \"" + name + "\". " + conn.tools.size + " tools. Run /mcp list." });
      } catch (err: any) { conns.delete(name); proc.kill(); resolve({ content: "", error: "Init failed: " + err.message }); }
    })();
  });
}

function handleDisconnect(name: string): SkillResult {
  const c = conns.get(name);
  if (!c) return { content: "", error: "Server not connected." };
  c.proc.kill(); conns.delete(name);
  return { content: "Disconnected from \"" + name + "\"." };
}

function handleList(): SkillResult {
  if (conns.size === 0) return { content: "No MCP servers connected. Run /mcp connect." };
  let out = "## Connected MCP Servers\n\n";
  for (const [n, c] of conns) {
    out += "### " + n + (c.init ? "" : " (init...)") + "\n";
    if (c.tools.size === 0) out += "  No tools.\n";
    else for (const [tn, ti] of c.tools) out += "  - " + tn + (ti.description ? " -- " + ti.description : "") + "\n";
    out += "\n";
  }
  return { content: out };
}

function handleCall(server: string, tool: string, rawArgs: string[]): SkillResult {
  const c = conns.get(server);
  if (!c) return { content: "", error: "Server not connected." };
  if (!c.init) return { content: "", error: "Server still initializing." };
  const args = parseArgs(rawArgs);
  return new Promise((resolve) => {
    const id = ++c.msgId;
    c.pending.set(id, {
      res: (r: unknown) => { c.pending.delete(id); const res2 = r as { content?: Array<{ text?: string }> }; resolve({ content: res2?.content ? res2.content.map((x) => x.text || JSON.stringify(x)).join("\n") : JSON.stringify(r, null, 2) }); },
      rej: (e: Error) => { c.pending.delete(id); resolve({ content: "", error: e.message }); },
    });
    c.proc.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: tool, arguments: args } }) + "\n");
    setTimeout(() => { if (c.pending.get(id)) { c.pending.delete(id); resolve({ content: "", error: "Call timed out." }); } }, 30000);
  }) as SkillResult;
}

function handleServers(): SkillResult {
  if (conns.size === 0) return { content: "No MCP servers connected." };
  let out = "## MCP Servers\n\n";
  for (const [n, c] of conns) out += "- " + n + ": " + c.tools.size + " tools (" + (c.init ? "connected" : "init") + ")\n";
  return { content: out };
}
