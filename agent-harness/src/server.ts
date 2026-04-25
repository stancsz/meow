/**
 * server.ts
 * 
 * The Meowju Coworker Bridge Server.
 * Inspired by Different AI OpenWork.
 */

import { watch } from "node:fs";
import { join } from "node:path";
import { GovernanceEngine } from "./sidecars/governance-engine.ts";

const PORT = process.env.PORT || 3001;
const DATA_DIR = join(process.cwd(), "data");
const ORCHESTRATOR_JSON = join(DATA_DIR, "orchestrator.json");

const gov = new GovernanceEngine(process.cwd());
const clients = new Set<ReadableStreamDefaultController>();

function broadcast(event: string, data: any) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoder = new TextEncoder();
  clients.forEach(controller => {
    try {
      controller.enqueue(encoder.encode(message));
    } catch {
      clients.delete(controller);
    }
  });
}

// Watch orchestrator logs
watch(DATA_DIR, (event, filename) => {
  if (filename === "orchestrator.json") {
    try {
      const data = JSON.parse(Bun.file(ORCHESTRATOR_JSON).toString());
      broadcast("orchestrator_update", data);
    } catch (e) {}
  }
});

console.log(`🚀 Meowju Coworker Server starting on port ${PORT}`);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // CORS
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // SSE Endpoint
    if (url.pathname === "/stream") {
      return new Response(
        new ReadableStream({
          start(controller) {
            clients.add(controller);
            const initialData = JSON.parse(Bun.file(ORCHESTRATOR_JSON).toString() || "{}");
            controller.enqueue(new TextEncoder().encode(`event: orchestrator_update\ndata: ${JSON.stringify(initialData)}\n\n`));
          },
          cancel(controller) { clients.delete(controller); },
        }),
        { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } }
      );
    }

    // Governance: Get Pending Approvals
    if (url.pathname === "/approvals" && req.method === "GET") {
      return Response.json(gov.getPendingApprovals(), { headers: corsHeaders });
    }

    // Governance: Resolve Approval
    if (url.pathname === "/approvals/resolve" && req.method === "POST") {
      const body = await req.json();
      gov.resolveApproval(body.id, body.approved);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // Broadcast Endpoint (for Orchestrator)
    if (url.pathname === "/broadcast" && req.method === "POST") {
      const body = await req.json();
      broadcast(body.event, body.data);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // Workspace Stats
    if (url.pathname === "/stats") {
      return Response.json({
        workspace: process.cwd(),
        active_sessions: 1,
        engine: "Meowju-V3",
      }, { headers: corsHeaders });
    }

    return new Response("Meowju Coworker Server Active", { status: 200 });
  },
});
