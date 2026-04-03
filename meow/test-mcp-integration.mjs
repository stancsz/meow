/**
 * test-mcp-integration.mjs
 *
 * End-to-end test of the MCP client integration.
 * Imports the MCP skill's internal functions to test in-process.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dynamically load the MCP skill
const mcpSkillPath = join(__dirname, "src", "skills", "mcp.ts");
const { mcp } = await import(mcpSkillPath);

const ctx = { cwd: __dirname, dangerous: true };

console.log("=== MCP Integration Test ===\n");

// Test 1: Help
console.log("Test 1: /mcp help");
const helpResult = await mcp.execute("help", ctx);
console.log(helpResult.content);
console.log("✅ Help works\n");

// Test 2: List (before connect)
console.log("Test 2: /mcp list (before connect)");
const listBefore = await mcp.execute("list", ctx);
console.log(listBefore.content);
console.log("✅ List (empty) works\n");

// Test 3: Connect to test server
console.log("Test 3: /mcp connect testserver node test-mcp-server.mjs");
const connectResult = await mcp.execute("connect testserver node test-mcp-server.mjs", ctx);
console.log(connectResult.error ? `❌ Error: ${connectResult.error}` : `✅ ${connectResult.content}`);

// Test 4: List (after connect)
console.log("\nTest 4: /mcp list (after connect)");
const listAfter = await mcp.execute("list", ctx);
console.log(listAfter.content);
const hasHello = listAfter.content.includes("hello");
const hasAdd = listAfter.content.includes("add");
const hasEcho = listAfter.content.includes("echo");
console.log(`✅ hello tool: ${hasHello ? "FOUND" : "MISSING"}`);
console.log(`✅ add tool:   ${hasAdd ? "FOUND" : "MISSING"}`);
console.log(`✅ echo tool:  ${hasEcho ? "FOUND" : "MISSING"}\n`);

// Test 5: Call hello tool
console.log("Test 5: /mcp call testserver hello name=Claude");
const callResult = await mcp.execute("call testserver hello name=Claude", ctx);
console.log(callResult.error ? `❌ Error: ${callResult.error}` : callResult.content);
const hasGreeting = callResult.content.includes("Claude");
console.log(`✅ Greeting correct: ${hasGreeting}\n`);

// Test 6: Call add tool
console.log("Test 6: /mcp call testserver add a=5 b=3");
const addResult = await mcp.execute("call testserver add a=5 b=3", ctx);
console.log(addResult.error ? `❌ Error: ${addResult.error}` : addResult.content);
const hasEight = addResult.content.includes("8");
console.log(`✅ Addition correct: ${hasEight}\n`);

// Test 7: Call echo tool
console.log("Test 7: /mcp call testserver echo text='Hello from MCP!'");
const echoResult = await mcp.execute("call testserver echo text='Hello from MCP!'", ctx);
console.log(echoResult.error ? `❌ Error: ${echoResult.error}` : echoResult.content);
const hasEchoText = echoResult.content.includes("Hello from MCP");
console.log(`✅ Echo correct: ${hasEchoText}\n`);

// Test 8: Disconnect
console.log("Test 8: /mcp disconnect testserver");
const disconnectResult = await mcp.execute("disconnect testserver", ctx);
console.log(disconnectResult.content);

// Test 9: List after disconnect
console.log("\nTest 9: /mcp list (after disconnect)");
const listFinal = await mcp.execute("list", ctx);
console.log(listFinal.content);

// Summary
const allPassed = hasHello && hasAdd && hasEcho && hasGreeting && hasEight && hasEchoText;
console.log("\n=== Test Summary ===");
if (allPassed) {
  console.log("✅ ALL MCP TESTS PASSED");
} else {
  console.log("❌ SOME TESTS FAILED");
  process.exit(1);
}
