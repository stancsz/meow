/**
 * Validation test for Epoch 7: Permission Rule Integration for Shell Tool
 * 
 * Tests the promise criteria:
 * 1. Rule matching: git allowed, rm denied
 * 2. CLI integration: --permission-rules parsing
 * 3. Dangerous fallback: --dangerous bypasses rules
 * 4. Default deny: non-matching commands DENIED (not ask)
 * 5. No regression: existing dangerous:false + allowed shell commands work
 */
import { checkPermissionSimple, checkPermission, addRule, loadPermissions } from "./src/sidecars/permissions.ts";

console.log("=== EPOCH 7 VALIDATION TESTS ===\n");

let allPassed = true;
const results = [];

// ============================================================================
// Test 1: Rule matching
// ============================================================================
// Given rule cmd:git  → ALLOW and cmd:rm  → DENY
// shell tool must pass `git status` and block `rm -rf /`

console.log("TEST 1: Rule matching");
console.log("----------------------");

// Test git - should be ALLOW
const gitPerm = checkPermissionSimple("shell", "git status");
console.log(`  checkPermissionSimple("shell", "git status") = ${gitPerm.action}`);
console.log(`  Expected: allow, Got: ${gitPerm.action}`);
const test1aPass = gitPerm.action === "allow";
results.push({ name: "git status → ALLOW", result: test1aPass ? "PASS" : "FAIL", evidence: gitPerm.action });

// Test rm -rf / - should be DENY
const rmPerm = checkPermissionSimple("shell", "rm -rf /");
console.log(`  checkPermissionSimple("shell", "rm -rf /") = ${rmPerm.action}`);
console.log(`  Expected: deny, Got: ${rmPerm.action}`);
const test1bPass = rmPerm.action === "deny";
results.push({ name: "rm -rf / → DENY", result: test1bPass ? "PASS" : "FAIL", evidence: rmPerm.action });

if (!test1aPass || !test1bPass) allPassed = false;

// ============================================================================
// Test 2: CLI integration
// ============================================================================
// meow --permission-rules "git *,npm *" -- ls should work

console.log("\nTEST 2: CLI integration (--permission-rules)");
console.log("----------------------------------------------");
// Check if lean-agent.ts parses --permission-rules
const fs = await import("fs");
const leanAgentCode = fs.readFileSync("./src/core/lean-agent.ts", "utf-8");
const hasPermissionRulesCLI = leanAgentCode.includes("--permission-rules");
console.log(`  lean-agent.ts parses --permission-rules: ${hasPermissionRulesCLI}`);
console.log(`  Expected: true, Got: ${hasPermissionRulesCLI}`);
results.push({ name: "--permission-rules CLI argument", result: hasPermissionRulesCLI ? "PASS" : "FAIL", evidence: "grep for --permission-rules in lean-agent.ts" });
if (!hasPermissionRulesCLI) allPassed = false;

// ============================================================================
// Test 3: Dangerous fallback
// ============================================================================
// When --dangerous is set, shell commands bypass permission rules

console.log("\nTEST 3: Dangerous fallback");
console.log("--------------------------");
// This test is about runtime behavior - check that dangerous flag is recognized
// We can't fully test this without running the shell tool, but we can check the logic exists
const toolRegistryCode = fs.readFileSync("./src/sidecars/tool-registry.ts", "utf-8");
// The shell tool SHOULD check dangerous BEFORE permission, OR executeTool handles it
// Currently shell tool blocks ALL non-dangerous calls before permission system
const shellToolCode = toolRegistryCode.match(/name: "shell"[\s\S]*?execute: async[\s\S]*?\{[\s\S]*?\}/)?.[0] || "";
const hasDangerousBypass = shellToolCode.includes("dangerous") && shellToolCode.indexOf("if (!context.dangerous)") >= 0;
console.log(`  Shell tool has dangerous check: ${hasDangerousBypass}`);
console.log(`  Note: Shell blocks all non-dangerous calls before permission check`);
results.push({ name: "dangerous flag recognized", result: hasDangerousBypass ? "PASS" : "FAIL", evidence: "shell tool contains 'if (!context.dangerous)'" });
// This passes but reveals the bug - dangerous bypass exists but bypasses permission system too

// ============================================================================
// Test 4: Default deny
// ============================================================================
// Commands not matching any rule default to DENIED (not ask)

console.log("\nTEST 4: Default deny");
console.log("-------------------");
// Clear any custom rules and test an unknown command
const unknownPerm = checkPermissionSimple("shell", "python3 -c 'print(1)'");
console.log(`  checkPermissionSimple("shell", "python3 -c 'print(1)'") = ${unknownPerm.action}`);
console.log(`  Expected: ask OR deny, Got: ${unknownPerm.action}`);
console.log(`  Note: Promise says default should be DENY, but permissions.ts defaults to ASK`);

// Check what DEFAULT_RULES says about unmatched
const defaultIsAsk = unknownPerm.action === "ask";
results.push({ name: "default action for unknown command", result: defaultIsAsk ? "FAIL (is ask, should be deny)" : "PASS", evidence: `Default action: ${unknownPerm.action}` });
console.log(`  *** PROMISE SAYS: Default should be DENY but actual is ASK ***`);
if (defaultIsAsk) allPassed = false; // This is a FAIL per the promise

// ============================================================================
// Test 5: No regression - git works with dangerous:false
// ============================================================================
// Testing the actual integration - the shell tool bypasses permission system

console.log("\nTEST 5: No regression check");
console.log("--------------------------");
// Check if executeTool would allow git
const gitExecPerm = checkPermission("shell", { cmd: "git status" });
console.log(`  executeTool permission for git: ${gitExecPerm.action}`);
// But the shell tool execute() has its own blocking logic
console.log(`  ISSUE: shell tool execute() blocks dangerous:false BEFORE permission check`);
console.log(`  shell tool lines 161-167: if (!context.dangerous) return BLOCKED`);
results.push({ name: "shell tool uses permission system", result: "FAIL", evidence: "shell execute() bypasses executeTool's permission check" });
allPassed = false;

// ============================================================================
// Summary
// ============================================================================

console.log("\n=== VALIDATION SUMMARY ===");
console.log(`Overall: ${allPassed ? "VALIDATED" : "SLOPPY"}`);
console.log("\nDetailed Results:");
for (const r of results) {
  console.log(`  ${r.result}: ${r.name} (${r.evidence})`);
}

// ============================================================================
// The Core Issue
// ============================================================================
console.log("\n=== ROOT CAUSE ===");
console.log("The shell tool in tool-registry.ts (lines 156-168) has hardcoded:");
console.log("  if (!context.dangerous) { return BLOCKED; }");
console.log("This bypasses the permission system entirely.");
console.log("");
console.log("The executeTool function (lines 476+) DOES call checkPermission,");
console.log("but the shell tool's execute() is inline and doesn't go through executeTool.");
console.log("");
console.log("When you call executeTool('shell', {cmd:'git status'}, {dangerous:false}):");
console.log("  1. executeTool calls checkPermission → returns ALLOW");
console.log("  2. executeTool calls shell.execute()");
console.log("  3. shell.execute() returns BLOCKED because dangerous is false");
console.log("");
console.log("EXPECTED FIX per promise.md:");
console.log("  - Replace 'if (!context.dangerous)' with 'checkPermissionSimple(\"shell\", cmd)'");
console.log("  - When dangerous=true, skip permission check (bypass)");
console.log("  - When no matching rule, DEFAULT to DENY (not ASK)");
console.log("  - Add --permission-rules CLI argument parsing");

process.exit(allPassed ? 0 : 1);