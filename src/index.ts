#!/usr/bin/env node
// meow-swarm — Autonomous multi-agent coding harness

import { config } from "./config/env";
import { Agent } from "./agent/agent";
import { createRepl } from "./cli/repl";
import { MeowKernel } from "./kernel/kernel";
import { DatabasePort } from "./extensions/database/manifest";

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
    const command = process.argv.filter(arg => !arg.startsWith("--") && arg !== "-p" && arg !== "--plan").slice(2).join(" ");
    if (!command) {
      console.error("Usage: meow -p \"<task description>\"");
      process.exit(1);
    }

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