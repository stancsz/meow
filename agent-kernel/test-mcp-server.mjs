#!/usr/bin/env node
/**
 * test-mcp-server.mjs
 *
 * A simple MCP (Model Context Protocol) test server.
 * Implements a minimal subset of the MCP stdio protocol.
 */
import { createInterface } from "node:readline";

let msgId = 0;
const tools = [
  {
    name: "hello",
    description: "Returns a greeting",
    inputSchema: { type: "object", properties: { name: { type: "string", description: "Name to greet" } }, required: ["name"] },
  },
  {
    name: "add",
    description: "Adds two numbers",
    inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"] },
  },
  {
    name: "echo",
    description: "Echoes the input back",
    inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
];

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

let initialized = false;

const rl = createInterface({ input: process.stdin });
let buf = "";

rl.on("line", (line) => {
  buf += line + "\n";
  // Try to parse complete JSON lines
  const lines = buf.split("\n");
  buf = "";
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    try {
      const msg = JSON.parse(l);
      handleMessage(msg);
    } catch {
      buf += raw + "\n";
    }
  }
});

function handleMessage(msg) {
  if (msg.method === "initialize") {
    initialized = true;
    send({ jsonrpc: "2.0", id: msg.id, result: {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "test-mcp-server", version: "1.0.0" },
    }});
  } else if (msg.method === "initialized") {
    // Notification - no response
  } else if (msg.method === "tools/list") {
    send({ jsonrpc: "2.0", id: msg.id, result: { tools }});
  } else if (msg.method === "tools/call") {
    const { name, arguments: args = {} } = msg.params || {};
    let content;
    if (name === "hello") {
      content = `Hello, ${args.name || "World"}!`;
    } else if (name === "add") {
      content = `Result: ${(args.a || 0) + (args.b || 0)}`;
    } else if (name === "echo") {
      content = `Echo: ${args.text || ""}`;
    } else {
      content = `Unknown tool: ${name}`;
    }
    send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: content }] }});
  } else if (msg.id !== undefined) {
    send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not found" }});
  }
}
