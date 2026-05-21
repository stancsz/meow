// meow-swarm MCP Server
// Priority 3: Expose meow-swarm as an MCP server
// Other MCP clients (Claude Desktop, Cursor, etc.) can connect and use meow tools
// Run: node dist/mcp-server.js

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { MeowKernel } from "../kernel/kernel";
import { MeowDatabase } from "../kernel/database";
import { AuditLogger } from "../kernel/audit";
import { Agent } from "../agent/agent";
import { config } from "../config/env";
import pc from "picocolors";

// ── Tool definitions ─────────────────────────────────────────────────────────

const MEOW_TOOLS = [
  {
    name: "meow_chat",
    description: "Send a task to meow-swarm and get a response. This is the primary interface.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "The coding task to execute" },
        runTests: { type: "boolean", description: "Run tests after making changes", default: false },
        seed: { type: "number", description: "Random seed for reproducibility" },
      },
      required: ["task"],
    },
  },
  {
    name: "meow_checkpoint",
    description: "Save the current agent state as a named checkpoint.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Checkpoint name" },
      },
      required: ["name"],
    },
  },
  {
    name: "meow_recall",
    description: "Query cross-session memory for relevant past sessions.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query for memory" },
        limit: { type: "number", description: "Max results", default: 5 },
      },
      required: ["query"],
    },
  },
  {
    name: "meow_cost_report",
    description: "Get the current cost and budget status for the active run.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "meow_audit_log",
    description: "Query the structured audit log for a run.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string", description: "Run ID (defaults to current)" },
        actionType: { type: "string", description: "Filter by action type" },
        limit: { type: "number", description: "Max entries", default: 50 },
      },
    },
  },
  {
    name: "meow_continue",
    description: "Resume an incomplete previous run.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string", description: "Run ID to resume (default: most recent)" },
      },
    },
  },
  {
    name: "meow_list_runs",
    description: "List recent mission runs with status and cost.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results", default: 10 },
        status: { type: "string", description: "Filter by status (running/completed/failed)" },
      },
    },
  },
];

// ── Server class ─────────────────────────────────────────────────────────────

export class MeowMcpServer {
  private server: Server;
  private agent: Agent;
  private db: MeowDatabase;
  private audit: AuditLogger;
  private currentRunId: string;

  constructor() {
    this.server = new Server(
      { name: "meow-swarm", version: "0.2.0" },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    // Initialize the agent subsystem
    this.db = new MeowDatabase();
    const kernel = new MeowKernel(this.db);
    kernel.start();

    this.agent = new Agent({
      model: config.model,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      db: this.db,
      kernel,
    });

    this.currentRunId = this.agent.runId;
    this.audit = new AuditLogger(this.currentRunId);

    this.setupHandlers();
    console.log(pc.dim("[meow-mcp] Server initialized"));
  }

  private setupHandlers() {
    // ── List tools ──────────────────────────────────────────────────────────
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: MEOW_TOOLS,
    }));

    // ── List resources ───────────────────────────────────────────────────────
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: "meow://run/current",
          name: "Current Run",
          mimeType: "application/json",
          description: "Status of the current meow-swarm run",
        },
        {
          uri: "meow://cost/current",
          name: "Current Cost",
          mimeType: "application/json",
          description: "Cost breakdown for current run",
        },
        {
          uri: "meow://memory/recent",
          name: "Recent Memory",
          mimeType: "application/json",
          description: "Recent cross-session memory entries",
        },
      ],
    }));

    // ── List prompts ─────────────────────────────────────────────────────────
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [
        {
          name: "meow-default-task",
          description: "A standard coding task for meow-swarm",
          arguments: [
            { name: "task", description: "The coding task to execute", required: true },
          ],
        },
        {
          name: "meow-debug-task",
          description: "Debug a specific error or issue",
          arguments: [
            { name: "error", description: "Error message or log output", required: true },
            { name: "file", description: "File path (optional)", required: false },
          ],
        },
      ],
    }));

    // ── Call tool ─────────────────────────────────────────────────────────────
    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;
      this.audit.log({ level: "info", actionType: "mcp_tool_call", detail: `${name} → ${JSON.stringify(args || {})}` });

      try {
        switch (name) {
          case "meow_chat": {
            const { task, runTests, seed } = args as { task: string; runTests?: boolean; seed?: number };
            this.audit.log({ level: "info", actionType: "mcp_chat_start", detail: task.slice(0, 100) });

            const response = await this.agent.chat(
              task,
              runTests ?? false
            );

            const cost = this.db.getTotalCost(this.agent.runId);
            const budgetInfo = config.budgetCents ? ` | Budget: ${cost.toFixed(4)}¢ / ${config.budgetCents}¢` : "";

            this.audit.log({ level: "info", actionType: "mcp_chat_end", detail: `cost: ${cost.toFixed(4)}¢` });

            return {
              content: [
                { type: "text", text: response },
                { type: "text", text: pc.dim(`\n💰 Cost: ${cost.toFixed(4)}¢${budgetInfo}\nRun ID: ${this.agent.runId}`) },
              ],
            };
          }

          case "meow_checkpoint": {
            const { name: checkpointName } = args as { name: string };
            this.db.checkpoint(this.agent.runId, checkpointName);
            return {
              content: [{ type: "text", text: `✓ Checkpoint saved: ${checkpointName} (run: ${this.agent.runId})` }],
            };
          }

          case "meow_recall": {
            const { query, limit = 5 } = args as { query: string; limit?: number };
            const memories = this.db.getRecentEpisodic(limit);
            const relevant = memories.filter(m =>
              m.summary.toLowerCase().includes(query.toLowerCase())
            );

            if (relevant.length === 0) {
              return { content: [{ type: "text", text: `No memory entries match: "${query}"` }] };
            }

            const text = relevant.map(m =>
              `[${new Date(m.created_at).toISOString().slice(0, 10)}] ${m.summary}`
            ).join("\n\n");

            return { content: [{ type: "text", text }] };
          }

          case "meow_cost_report": {
            const totalCost = this.db.getTotalCost(this.agent.runId);
            const budget = config.budgetCents;
            const budgetPct = budget ? ((totalCost / budget) * 100).toFixed(1) : "N/A";
            const remaining = budget ? (budget - totalCost).toFixed(4) : null;

            const report = budget
              ? `Current run: ${this.agent.runId}\nTotal cost: ${totalCost.toFixed(4)}¢\nBudget: ${budget}¢ (${budgetPct}% used)\nRemaining: ${remaining}¢`
              : `Current run: ${this.agent.runId}\nTotal cost: ${totalCost.toFixed(4)}¢\nNo budget set`;

            return { content: [{ type: "text", text: report }] };
          }

          case "meow_audit_log": {
            const { runId, actionType, limit = 50 } = args as { runId?: string; actionType?: string; limit?: number };
            const targetRunId = runId || this.agent.runId;
            const logPath = this.audit.getLogPath();

            // Read from audit log
            try {
              const { readFileSync } = await import("fs");
              const content = readFileSync(logPath, "utf-8");
              const entries = content.split("\n")
                .filter(Boolean)
                .map(l => { try { return JSON.parse(l); } catch { return null; } })
                .filter(e => e && e.runId === targetRunId)
                .filter(e => !actionType || e.actionType === actionType)
                .slice(-(limit ?? 50));

              return {
                content: [{
                  type: "text",
                  text: entries.map(e =>
                    `[${e.timestamp}] ${e.actionType}: ${e.detail}`
                  ).join("\n") || "No audit entries found",
                }],
              };
            } catch {
              return { content: [{ type: "text", text: "No audit log found" }] };
            }
          }

          case "meow_continue": {
            const { runId } = args as { runId?: string };
            const targetRunId = runId || this.agent.runId;
            // Mark previous run as continued
            this.db.getRawDb().prepare(`
              UPDATE mission_runs SET status = 'continued' WHERE run_id = ?
            `).run(targetRunId);

            // Start new run that references the old one
            const newAgent = new Agent({
              model: config.model,
              baseUrl: config.baseUrl,
              apiKey: config.apiKey,
              db: this.db,
              kernel: new MeowKernel(this.db),
            });
            this.agent = newAgent;
            this.currentRunId = this.agent.runId;

            return {
              content: [{
                type: "text",
                text: `✓ Resumed run ${targetRunId} → new run ${this.agent.runId}`,
              }],
            };
          }

          case "meow_list_runs": {
            const { limit = 10, status } = args as { limit?: number; status?: string };
            const rows = this.db.getRawDb().prepare(`
              SELECT run_id, status, created_at, model, total_cost
              FROM mission_runs
              ${status ? "WHERE status = ?" : ""}
              ORDER BY created_at DESC
              LIMIT ?
            `).all(...(status ? [status, limit ?? 10] : [limit ?? 10])) as any[];

            if (rows.length === 0) {
              return { content: [{ type: "text", text: "No runs found" }] };
            }

            const table = rows.map(r =>
              `${r.status.padEnd(12)} ${r.run_id.slice(0, 8)}  ${r.created_at}  ${r.total_cost?.toFixed(4) || "?"}¢  ${r.model}`
            ).join("\n");

            return { content: [{ type: "text", text: `STATUS        RUN_ID    CREATED_AT  COST      MODEL\n${"─".repeat(70)}\n${table}` }] };
          }

          default:
            return {
              content: [{ type: "text", text: `Unknown tool: ${name}` }],
              isError: true,
            };
        }
      } catch (e: any) {
        this.audit.log({ level: "error", actionType: "mcp_tool_error", detail: `${name}: ${e.message}` });
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          isError: true,
        };
      }
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log(pc.dim("[meow-mcp] Connected via stdio, ready for requests"));
  }
}

// ── CLI entry point ──────────────────────────────────────────────────────────

if (require.main === module) {
  const server = new MeowMcpServer();
  server.start().catch(e => {
    console.error(`[meow-mcp] Fatal: ${e.message}`);
    process.exit(1);
  });
}