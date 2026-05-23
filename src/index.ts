#!/usr/bin/env node
// meow-swarm — Autonomous multi-agent coding harness
import "dotenv/config";

import * as fs from "fs";
import * as path from "path";
import { config } from "./config/env";
import { Agent } from "./agent/agent";
import { createRepl } from "./cli/repl";
import { MeowKernel } from "./kernel/kernel";
import { DatabasePort } from "./extensions/database/manifest";
import { MeowDatabase } from "./kernel/database";

/**
 * Resolve a prompt string that may be a file reference.
 * Supports:  meow -p {path/to/file.md}
 * The braces are stripped and the file is read relative to cwd.
 */
function resolvePrompt(raw: string): string {
  const match = raw.match(/^\{(.+)\}$/);
  if (!match) return raw;
  const filePath = path.resolve(process.cwd(), match[1]);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Prompt file not found: ${filePath}`);
    process.exit(1);
  }
  const contents = fs.readFileSync(filePath, "utf8").trim();
  console.log(`📄 [meow] Loaded prompt from: ${path.relative(process.cwd(), filePath)}`);
  return contents;
}

function isBun(): boolean {
  return typeof (globalThis as any).Bun !== "undefined";
}

async function main() {
  let db: DatabasePort;

  if (isBun()) {
    const { DatabaseExtension } = await import("./extensions/database/extension");
    db = new DatabaseExtension({
      dbPath: "meow.db",
      embeddingDimension: config.embeddingDimension,
    });
    console.log("✓ Database: Bun + Node subprocess mode");
  } else {
    const { MeowDatabase } = await import("./kernel/database");
    db = new MeowDatabase();
    console.log("✓ Database: Node.js direct mode");
  }

  const kernel = new MeowKernel(db);
  kernel.start();

  // ── Priority 2: --continue flag (cross-session replay) ─────────────────────
  const continueMode = process.argv.includes("--continue") || process.argv.includes("-c");
  if (continueMode) {
    const meowDb = db as any;
    // Find most recent incomplete run
    if (typeof meowDb.getRawDb === "function") {
      const recent = meowDb.getRawDb().prepare(`
        SELECT run_id FROM mission_runs
        WHERE status = 'running'
        ORDER BY created_at DESC LIMIT 1
      `).get() as { run_id: string } | undefined;

      if (recent) {
        console.log(`↻ Continuing run: ${recent.run_id}`);
        // Inject run_id into process.argv for agent to pick up
        process.env.MEOW_RUN_ID = recent.run_id;
      } else {
        console.log("↻ No previous run found. Starting fresh.");
      }
    } else {
      console.log("↻ Running in proxy mode. Continue mode will look up state from server.");
    }
  }

  // Stranded task/run reclamation startup sequence
  try {
    await db.exec(`
      UPDATE task_claims 
      SET status = 'failed' 
      WHERE status = 'claimed' OR status = 'running';
    `);
    if (!continueMode) {
      await db.exec(`
        UPDATE mission_runs 
        SET status = 'failed', completed_at = CURRENT_TIMESTAMP 
        WHERE status = 'running';
      `);
    }
    console.log("✓ Stranded task reclamation completed: all orphaned runs/claims set to failed.");
  } catch (err) {
    // Ignore error if database tables are not initialized yet
  }

  const agent = new Agent({
    model: config.model,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    db,
    kernel
  });

  // Support for -p (plan/non-interactive) mode — the primary headless interface
  const planMode = process.argv.includes("-p") || process.argv.includes("--plan");
  if (planMode) {
    const rawCommand = process.argv.filter(arg => !arg.startsWith("--") && arg !== "-p" && arg !== "--plan").slice(2).join(" ");
    if (!rawCommand) {
      console.error("Usage: meow -p \"<task description>\"");
      console.error("       meow -p {path/to/prompt.md}");
      process.exit(1);
    }
    const command = resolvePrompt(rawCommand);

    // Print seed/budget info if set
    if (config.deterministic || config.seed !== undefined) {
      const seedInfo = config.seed !== undefined ? ` seed=${config.seed}` : " deterministic";
      console.log(`🤖 [meow] Plan mode${seedInfo}: ${command}`);
    } else {
      console.log(`🤖 [meow] Plan mode: ${command}`);
    }

    const response = await agent.chat(command, false, undefined, (status) => {
      process.stdout.write(`\r${status}`);
    });
    console.log("\n" + response);

    const meowDb = db as any;
    if (meowDb && typeof meowDb.getTotalCost === "function") {
      const totalCost = meowDb.getTotalCost(agent.runId);
      if (totalCost > 0) {
        const budgetInfo = config.budgetCents ? ` (budget: ${config.budgetCents}¢)` : "";
        console.log(`\n💰 Total cost: ${totalCost.toFixed(4)}¢${budgetInfo}`);
      }
    }

    if (meowDb && typeof meowDb.endRun === "function") {
      meowDb.endRun(agent.runId, "completed");
    }
    await kernel.shutdown();
    process.exit(0);
    return;
  }

  // Support for --tui flag
  if (process.argv.includes("--tui")) {
    const { MeowTUI } = await import("./cli/tui");
    const tui = new MeowTUI(agent);
    tui.start();
    return;
  }

  // AI-Native Phase 2.4: Monitoring agent mode
  if (process.argv.includes("--monitor")) {
    const { MonitoringAgent } = await import("./agent/monitor");
    const monitor = new MonitoringAgent(db as MeowDatabase);
    const report = await monitor.run();
    console.log("\n📊 Monitoring Report:");
    console.log(`  Clusters found:  ${report.clusters.length}`);
    console.log(`  Patches generated: ${report.patches.length}`);
    console.log(`  Deployed:        ${report.deploys.length}`);
    console.log(`  Flagged for review: ${report.flaggedForReview.length}`);
    await kernel.shutdown();
    process.exit(0);
  }

  // AI-Native Phase 3.1: Knowledge synthesis mode
  if (process.argv.includes("--synthesize")) {
    const { KnowledgeSynthesizer } = await import("./agent/synthesizer");
    const synthesizer = new KnowledgeSynthesizer(db as MeowDatabase);
    await synthesizer.synthesize();
    await kernel.shutdown();
    process.exit(0);
  }

  // Non-interactive command mode (legacy)
  const command = process.argv.filter(arg => !arg.startsWith("--")).slice(2).join(" ");
  if (command) {
    console.log(`🤖 [meow] Executing command: ${command}`);
    const response = await agent.chat(command, false, undefined, (status) => {
      process.stdout.write(`\r${status}`);
    });
    console.log("\n" + response);
    console.log("\n✅ Command completed.");
    await kernel.shutdown();
    process.exit(0);
  }

  const repl = createRepl(agent);
  await repl.start();
}

main().catch(console.error);