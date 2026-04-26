#!/usr/bin/env bun
/**
 * MeowGateway - Standalone WebSocket Server
 * 
 * Platform sovereignty achievement: Replaces Discord-coupled relay
 * with a universal WebSocket interface for Meow access.
 */

import {
  type GatewayMessage,
  type PromptPayload,
  type ResultPayload,
  type StatusPayload,
  type HeartbeatPayload,
  createMessage,
  serializeMessage,
  parseMessage,
  generateMessageId,
} from "./protocol";

// ============================================================================
// Configuration
// ============================================================================

const PORT = parseInt(process.env.GATEWAY_PORT || "8080");
const HOST = process.env.GATEWAY_HOST || "0.0.0.0";
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || "dev-token-change-me";
const HEARTBEAT_INTERVAL_MS = 30000;
const CLIENT_TIMEOUT_MS = 120000;

// ============================================================================
// Client Management
// ============================================================================

interface ConnectedClient {
  id: string;
  ws: WebSocket;
  authenticated: boolean;
  connectedAt: number;
  lastHeartbeat: number;
  name?: string;
}

const clients = new Map<string, ConnectedClient>();

function generateClientId(): string {
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function broadcastToAuthenticated(message: GatewayMessage, excludeId?: string) {
  const data = serializeMessage(message);
  for (const [id, client] of clients) {
    if (id !== excludeId && client.authenticated && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  }
}

function sendToClient(clientId: string, message: GatewayMessage): boolean {
  const client = clients.get(clientId);
  if (client && client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(serializeMessage(message));
    return true;
  }
  return false;
}

// ============================================================================
// Agent Integration
// ============================================================================

async function routePrompt(prompt: PromptPayload, sourceClientId: string): Promise<void> {
  const messageId = generateMessageId();
  
  sendToClient(sourceClientId, createMessage("STATUS", {
    agent: "meow",
    state: "thinking",
    message: "Processing prompt...",
    progress: 10,
  } as StatusPayload, { id: messageId }));

  try {
    // TODO: Integrate with MeowAgentClient
    const response = await simulateAgentResponse(prompt.text);
    
    sendToClient(sourceClientId, createMessage("RESULT", {
      messageId,
      content: response,
      success: true,
      agentResult: { iterations: 1, toolCalls: 0 },
    } as ResultPayload));
  } catch (error: any) {
    sendToClient(sourceClientId, createMessage("ERROR", {
      code: "AGENT_ERROR",
      message: error.message || "Unknown error",
      originalMessageId: messageId,
    }));
  }
}

async function simulateAgentResponse(prompt: string): Promise<string> {
  await new Promise(resolve => setTimeout(resolve, 500));
  return `[MeowGateway] Received: "${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}"\n\nGateway operational! 🚀`;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ============================================================================
// WebSocket Server
// ============================================================================

console.log(`[gateway] Starting MeowGateway on ${HOST}:${PORT}...`);

const server = Bun.serve<{ clientId: string }>({
  port: PORT,
  hostname: HOST,
  
  fetch(req, server) {
    const url = new URL(req.url);
    const upgrade = req.headers.get("upgrade");
    
    if (upgrade === "websocket") {
      const token = req.headers.get("x-gateway-token") || url.searchParams.get("token");
      
      if (!token || token !== GATEWAY_TOKEN) {
        return new Response("Unauthorized", { status: 401 });
      }

      const clientId = generateClientId();
      const success = server.upgrade(req, {
        data: { clientId },
        headers: { "X-Gateway-Client-Id": clientId },
      });

      return success ? undefined : new Response("WebSocket upgrade failed", { status: 500 });
    }

    // HTTP endpoints
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", clients: clients.size, uptime: process.uptime() });
    }

    if (url.pathname === "/" || url.pathname === "/dashboard") {
      const token = url.searchParams.get("token");
      return new Response(getDashboardHTML(token), {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("MeowGateway WebSocket Server", { headers: { "Content-Type": "text/plain" } });
  },

  websocket: {
    open(ws) {
      const { clientId } = ws.data;
      console.log(`[gateway] Client ${clientId} connected`);
      
      clients.set(clientId, {
        id: clientId, ws, authenticated: false,
        connectedAt: Date.now(), lastHeartbeat: Date.now(),
      });

      ws.send(serializeMessage(createMessage("AUTH_REQUEST", {
        message: "Welcome to MeowGateway! Please authenticate.",
        tokenLength: GATEWAY_TOKEN.length,
      })));
    },

    message(ws, message) {
      const { clientId } = ws.data;
      const client = clients.get(clientId);
      if (!client) return;

      const msg = parseMessage(message.toString());
      if (!msg) {
        ws.send(serializeMessage(createMessage("ERROR", { code: "INVALID_MESSAGE", message: "Failed to parse message" })));
        return;
      }

      client.lastHeartbeat = Date.now();

      switch (msg.type) {
        case "AUTH_REQUEST":
          handleAuth(clientId, msg.payload as { token: string });
          break;
        case "PROMPT":
          if (!client.authenticated) {
            ws.send(serializeMessage(createMessage("ERROR", { code: "NOT_AUTHENTICATED", message: "Please authenticate first" })));
            return;
          }
          routePrompt(msg.payload as PromptPayload, clientId);
          break;
        case "HEARTBEAT":
        case "SWARM_REPORT":
          broadcastToAuthenticated(msg, clientId);
          break;
      }
    },

    close(ws, code, reason) {
      const { clientId } = ws.data;
      const client = clients.get(clientId);
      if (client) {
        console.log(`[gateway] Client ${clientId} disconnected`);
        clients.delete(clientId);
      }
    },

    perMessageDeflate: true,
  },
});

console.log(`[gateway] MeowGateway listening on ws://${HOST}:${PORT}`);

function handleAuth(clientId: string, payload: { token: string }): void {
  const client = clients.get(clientId);
  if (!client) return;

  if (payload.token === GATEWAY_TOKEN) {
    client.authenticated = true;
    client.ws.send(serializeMessage(createMessage("AUTH_RESPONSE", {
      success: true, message: "Authenticated!", clientId,
    })));
    console.log(`[gateway] Client ${clientId} authenticated`);
  } else {
    client.ws.send(serializeMessage(createMessage("AUTH_RESPONSE", { success: false, message: "Invalid token" })));
    client.ws.close(4003, "Invalid token");
  }
}

// ============================================================================
// Dashboard HTML
// ============================================================================

function getDashboardHTML(token: string | null): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MeowGateway</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #eee; min-height: 100vh; padding: 20px; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { color: #ff6b9d; margin-bottom: 20px; }
    .status { display: flex; gap: 20px; margin-bottom: 20px; }
    .stat { background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; }
    .stat-label { font-size: 12px; color: #888; }
    .stat-value { font-size: 20px; font-weight: bold; }
    .connected { color: #4ade80; }
    .chat { background: rgba(255,255,255,0.05); border-radius: 12px; height: 400px; display: flex; flex-direction: column; }
    .messages { flex: 1; overflow-y: auto; padding: 15px; }
    .msg { background: rgba(255,255,255,0.1); border-radius: 8px; padding: 10px; margin-bottom: 10px; max-width: 80%; }
    .msg.user { margin-left: auto; background: rgba(99,102,241,0.3); }
    .msg.system { text-align: center; color: #888; max-width: 100%; }
    .msg.meow { background: rgba(255,107,157,0.2); }
    .input-area { padding: 15px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; gap: 10px; }
    input { flex: 1; background: rgba(255,255,255,0.1); border: none; border-radius: 8px; padding: 12px; color: #fff; }
    button { background: linear-gradient(135deg, #ff6b9d, #c44569); border: none; border-radius: 8px; padding: 12px 25px; color: #fff; font-weight: bold; cursor: pointer; }
    button:disabled { opacity: 0.5; }
    pre { white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🐱 MeowGateway Dashboard</h1>
    <div class="status">
      <div class="stat"><div class="stat-label">Connection</div><div id="status" class="stat-value" style="color:#f87171">Disconnected</div></div>
      <div class="stat"><div class="stat-label">Uptime</div><div id="uptime" class="stat-value">-</div></div>
      <div class="stat"><div class="stat-label">Messages</div><div id="count" class="stat-value">0</div></div>
    </div>
    <div class="chat">
      <div id="messages" class="messages"><div class="msg system">Connecting...</div></div>
      <div class="input-area">
        <input id="input" placeholder="Send a prompt..." disabled>
        <button id="send" disabled>Send</button>
      </div>
    </div>
  </div>
  <script>
    const token = "${token || ''}";
    const wsUrl = token ? \`ws://\${location.host}?token=\${token}\` : null;
    const msgs = document.getElementById('messages');
    const input = document.getElementById('input');
    const send = document.getElementById('send');
    const status = document.getElementById('status');
    const uptime = document.getElementById('uptime');
    const count = document.getElementById('count');
    let countVal = 0;
    let ws;

    function add(type, html) {
      const d = document.createElement('div');
      d.className = 'msg ' + type;
      d.innerHTML = html;
      msgs.appendChild(d);
      msgs.scrollTop = msgs.scrollHeight;
    }

    function connect() {
      if (!wsUrl) { add('system', 'No token - add ?token=YOUR_TOKEN'); return; }
      ws = new WebSocket(wsUrl);
      ws.onopen = () => { status.textContent = 'Connected'; status.className = 'stat-value connected'; input.disabled = false; send.disabled = false; add('system', 'Connected!'); };
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === 'AUTH_RESPONSE') add('system', m.payload.success ? '✓ Authenticated' : '✗ Auth failed');
        else if (m.type === 'STATUS' && m.payload.agent === 'system') uptime.textContent = m.payload.message.replace('Gateway uptime: ', '');
        else if (m.type === 'RESULT') { countVal++; count.textContent = countVal; add('meow', '<pre>' + m.payload.content + '</pre>'); }
        else if (m.type === 'ERROR') add('system', '<span style="color:#f87171">Error: ' + m.payload.message + '</span>');
      };
      ws.onclose = () => { status.textContent = 'Disconnected'; status.className = 'stat-value'; input.disabled = true; send.disabled = true; add('system', 'Reconnecting...'); setTimeout(connect, 3000); };
    }

    send.onclick = () => {
      const t = input.value.trim();
      if (!t || !ws || ws.readyState !== 1) return;
      add('user', '<pre>' + t + '</pre>');
      ws.send(JSON.stringify({ type: 'PROMPT', id: 'p-' + Date.now(), timestamp: Date.now(), payload: { text: t } }));
      input.value = '';
    };
    input.onkeypress = (e) => { if (e.key === 'Enter') send.click(); };
    connect();
  </script>
</body>
</html>`;
}

// Graceful shutdown
process.on("SIGINT", () => { console.log("\n[gateway] Shutting down..."); server.stop(); process.exit(0); });
process.on("SIGTERM", () => { console.log("\n[gateway] Shutting down..."); server.stop(); process.exit(0); });
