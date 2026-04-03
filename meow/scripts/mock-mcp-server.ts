/**
 * mock-mcp-server.ts
 *
 * A minimal MCP server for testing. Implements the MCP stdio protocol.
 * Run with: bun run scripts/mock-mcp-server.ts
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";

// Track initialized state
let initialized = false;
const tools = [
  {
    name: "echo",
    description: "Echo back the input text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to echo back" }
      },
      required: ["text"]
    }
  },
  {
    name: "get_time",
    description: "Get the current server time",
    inputSchema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "read_dir",
    description: "List files in a directory",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path" }
      },
      required: ["path"]
    }
  }
];

// Read lines from stdin
let buf = "";
process.stdin.on("data", (chunk: Buffer) => {
  buf += chunk.toString();
  processLines();
});

function processLines() {
  const lines = buf.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      handleMessage(JSON.parse(line));
    } catch (e) {
      // ignore
    }
  }
  buf = lines[lines.length - 1];
}

function send(id: number | string | undefined, result: unknown) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function sendError(id: number | string | undefined, code: number, message: string) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

function handleMessage(msg: any) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize": {
      initialized = true;
      send(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "mock-mcp-server", version: "1.0.0" }
      });
      break;
    }
    case "initialized": {
      // Client is done initializing
      break;
    }
    case "tools/list": {
      if (!initialized) {
        sendError(id, -32602, "Server not initialized");
        return;
      }
      send(id, { tools });
      break;
    }
    case "tools/call": {
      if (!initialized) {
        sendError(id, -32602, "Server not initialized");
        return;
      }
      const { name, arguments: args = {} } = params || {};
      switch (name) {
        case "echo": {
          const text = args.text || "";
          send(id, { content: [{ type: "text", text: `Echo: ${text}` }] });
          break;
        }
        case "get_time": {
          send(id, { content: [{ type: "text", text: new Date().toISOString() }] });
          break;
        }
        case "read_dir": {
          const path = args.path || ".";
          try {
            const entries = readdirSync(path);
            send(id, { content: [{ type: "text", text: entries.join("\n") }] });
          } catch (e: any) {
            sendError(id, -32603, `Cannot read directory: ${e.message}`);
          }
          break;
        }
        default:
          sendError(id, -32601, `Unknown tool: ${name}`);
      }
      break;
    }
    default:
      // Ignore unknown methods (for future compatibility)
      if (id !== undefined) {
        sendError(id, -32601, `Unknown method: ${method}`);
      }
  }
}
