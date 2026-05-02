#!/usr/bin/env node
// MEOW - Lightweight AI Coding Agent

import { config } from "./config/env";
import { Agent } from "./agent/agent";
import { createRepl } from "./cli/repl";
import { MeowDatabase } from "./kernel/database";
import { MeowKernel } from "./kernel/kernel";
import { DatabasePort } from "./extensions/database/manifest";

/**
 * Detects whether we're running under Bun or Node.
 * Bun has a global `Bun` object; Node does not.
 */
function isBun(): boolean {
  return typeof (globalThis as any).Bun !== "undefined";
}

async function main() {
  let db: DatabasePort;

  if (isBun()) {
    // Bun: load database as an out-of-process extension via Node
    const { DatabaseExtension } = await import("./extensions/database/extension");
    db = new DatabaseExtension({
      dbPath: "meow.db",
      embeddingDimension: config.embeddingDimension,
    });
    console.log("✓ Database: Bun + Node subprocess mode");
  } else {
    // Node/tsx: use MeowDatabase directly
    db = new MeowDatabase();
    console.log("✓ Database: Node.js direct mode");
  }

  const kernel = new MeowKernel(db);
  kernel.start();

  const agent = new Agent({
    model: config.model,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    db,
    kernel
  });

  // Support for non-interactive command mode
  const command = process.argv.slice(2).join(" ");
  if (command) {
    console.log(`🤖 [MEOW] Executing command: ${command}`);
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