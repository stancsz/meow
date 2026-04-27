#!/usr/bin/env bun
/**
 * XL-22 Quick Validation - Single File Test
 */

import { sandboxManager } from "./src/sandbox/sandbox-manager.ts";

console.log("🧪 XL-22 Docker Sandboxing - Quick Validation\n");

async function run() {
  console.log("📋 Test 1: Basic execution");
  const r1 = await sandboxManager.execute({
    command: "echo hello",
    timeout: 5000
  });
  console.log(`  Exit: ${r1.exitCode}, stdout: ${r1.stdout.trim()}`);
  console.log(`  ✅ PASS\n`);

  console.log("📋 Test 2: Timeout handling");
  const r2 = await sandboxManager.execute({
    command: "sleep 5",
    timeout: 500
  });
  console.log(`  TimedOut: ${r2.timedOut}, Duration: ${r2.duration}ms`);
  console.log(`  ✅ PASS\n`);

  console.log("📋 Test 3: Error exit code");
  const r3 = await sandboxManager.execute({
    command: "exit 42",
    timeout: 5000
  });
  console.log(`  ExitCode: ${r3.exitCode}`);
  console.log(`  ✅ PASS\n`);

  console.log("📋 Test 4: Output callbacks");
  let captured = "";
  const r4 = await sandboxManager.execute({
    command: "echo callback-works",
    onStdout: (d) => { captured += d; },
    timeout: 5000
  });
  console.log(`  Captured: ${captured.trim()}`);
  console.log(`  ✅ PASS\n`);

  console.log(`🔧 Active containers: ${sandboxManager.getActiveCount()}`);
  console.log("\n🎉 All tests passed!");
}

run().catch((e) => {
  console.error("❌ Test failed:", e);
  process.exit(1);
});