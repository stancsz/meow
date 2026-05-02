#!/usr/bin/env node
// MEOW - Lightweight AI Coding Agent

import { config } from "./config/env";
import { Agent } from "./agent/agent";
import { createRepl } from "./cli/repl";
import { MeowDatabase } from "./kernel/database";
import { MeowKernel } from "./kernel/kernel";

async function main() {
  const db = new MeowDatabase();
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