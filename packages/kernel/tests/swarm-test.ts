/**
 * swarm-test.ts - Verifying Multi-Agent Coordination
 * 
 * This test simulates a main agent pouncing on a sub-kitten
 * and verifies that the results are reported to the shared memory bus.
 */

import { MemoryStore } from "../src/core/memory";
import { executeTool } from "../src/sidecars/tool-registry";
import { join } from "node:path";
import { existsSync, rmSync } from "node:fs";

const TEST_DATA_DIR = join(process.cwd(), "data_test");
process.env.MEOW_DATA_DIR = TEST_DATA_DIR;

if (existsSync(TEST_DATA_DIR)) rmSync(TEST_DATA_DIR, { recursive: true });

async function runTest() {
  console.log("🧪 Starting Swarm Integration Test...");
  
  const memory = new MemoryStore(TEST_DATA_DIR);
  
  // 1. Verify the pounce tool is registered and functional
  console.log("1. Spawning a Sub-Kitten via 'pounce' tool...");
  const result = await executeTool("pounce", {
    task: "Write a short poem about Maine Coon kittens in a file named meow.txt",
    role: "Poet-Kitten"
  }, {
    dangerous: true,
    cwd: process.cwd()
  });
  
  console.log(`Tool Result: ${result.content}`);
  
  if (!result.content.includes("Sub-Kitten sparked")) {
    throw new Error("Failed to spawn sub-kitten");
  }

  // 2. Poll the memory bus for the report
  console.log("2. Waiting for the sub-kitten to report back to the memory bus...");
  let attempts = 0;
  let reportFound = false;
  
  while (attempts < 30) { // Wait up to 60 seconds
    const events = memory.consumeEvents(0);
    const report = events.find(e => e.type === "SWARM_REPORT");
    
    if (report) {
      const payload = JSON.parse(report.payload);
      console.log("\n✅ SUCCESS! Sub-kitten reported back:");
      console.log(`Role: ${payload.role}`);
      console.log(`Task: ${payload.task}`);
      console.log(`Result: ${payload.result.slice(0, 100)}...`);
      reportFound = true;
      break;
    }
    
    process.stdout.write(".");
    await new Promise(r => setTimeout(r, 2000));
    attempts++;
  }

  if (!reportFound) {
    throw new Error("Sub-kitten failed to report back within timeout.");
  }
}

runTest().catch(e => {
  console.error(`\n❌ Test Failed: ${e.message}`);
  process.exit(1);
});
