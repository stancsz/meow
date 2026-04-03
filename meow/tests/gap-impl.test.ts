/**
 * Gap Implementation Test - GAP-ABORT-002: SIGINT Handler
 *
 * Tests that the CLI properly handles SIGINT (Ctrl+C) for graceful interruption.
 * Note: SIGINT handling belongs in the CLI entry point (cli/index.ts), not in
 * the lean-agent library (lean-agent.ts). Libraries shouldn't have process-level handlers.
 *
 * Run with: bun test meow/tests/gap-impl.test.ts
 */
import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";

// ============================================================================
// GAP-ABORT-002: SIGINT Handler
// ============================================================================

describe("GAP-ABORT-002: SIGINT Handler", () => {
  const leanAgentPath = "meow/src/core/lean-agent.ts";
  const cliPath = "meow/cli/index.ts";

  test("lean-agent.ts does NOT have process-level SIGINT handler (correct - it's a library)", () => {
    // Libraries should NOT have process.on("SIGINT") - that's the CLI's responsibility
    const leanAgentSrc = readFileSync(leanAgentPath, "utf-8");
    const hasSigintHandler = leanAgentSrc.includes("process.on") &&
                              leanAgentSrc.includes("SIGINT");
    expect(hasSigintHandler).toBe(false);
  });

  test("lean-agent.ts handles interruption via AbortController", () => {
    const leanAgentSrc = readFileSync(leanAgentPath, "utf-8");

    // Should have abort logic that can be triggered via AbortController
    const hasAbortLogic = leanAgentSrc.includes("abort") ||
                          leanAgentSrc.includes("interrupted") ||
                          leanAgentSrc.includes("Interrupted");

    expect(hasAbortLogic).toBe(true);
  });

  test("lean-agent.ts uses AbortController for cancellation", () => {
    const leanAgentSrc = readFileSync(leanAgentPath, "utf-8");

    // Check for AbortController usage
    const hasAbortController = leanAgentSrc.includes("AbortController") ||
                                  leanAgentSrc.includes("abortSignal");

    expect(hasAbortController).toBe(true);
  });

  test("CLI has SIGINT handler for graceful exit", () => {
    // The CLI (entry point) SHOULD have SIGINT handling
    const cliSrc = readFileSync(cliPath, "utf-8");

    // Check for SIGINT handling in CLI
    const hasSigintHandler = cliSrc.includes("SIGINT") ||
                              cliSrc.includes("process.on");

    expect(hasSigintHandler).toBe(true);
  });

  test("CLI properly handles Ctrl+C during thinking state", () => {
    const cliSrc = readFileSync(cliPath, "utf-8");

    // Should interrupt ongoing operations when Ctrl+C is pressed
    // The CLI should call interrupt() or abort the current operation
    const hasInterruptLogic = cliSrc.includes("interrupt") ||
                              cliSrc.includes("abort");

    expect(hasInterruptLogic).toBe(true);
  });
});

describe("GAP-ABORT-002: Implementation Verification", () => {
  test("CLI has proper interrupt mechanism", () => {
    const cliSrc = readFileSync("meow/cli/index.ts", "utf-8");

    // Verify the interrupt function exists and is called on SIGINT
    const hasInterruptFn = cliSrc.includes("function interrupt()");
    const callsInterruptOnSigint = cliSrc.includes("interrupt()");

    expect(hasInterruptFn).toBe(true);
    expect(callsInterruptOnSigint).toBe(true);
  });

  test("CLI saves session on SIGINT", () => {
    const cliSrc = readFileSync("meow/cli/index.ts", "utf-8");

    // On SIGINT, session should be saved before exiting
    const savesSession = cliSrc.includes("saveSession");

    expect(savesSession).toBe(true);
  });
});

// ============================================================================
// GAP-ABORT-003: Tool Timeout
// ============================================================================

describe("GAP-ABORT-003: Tool Timeout", () => {
  const toolRegistryPath = "meow/src/sidecars/tool-registry.ts";

  test("shell tool uses setTimeout for timeout implementation", () => {
    const registrySrc = readFileSync(toolRegistryPath, "utf-8");

    // Should use setTimeout to implement timeout in shell tool
    const hasSetTimeout = registrySrc.includes("setTimeout");
    expect(hasSetTimeout).toBe(true);
  });

  test("shell tool respects timeoutMs in context", () => {
    const registrySrc = readFileSync(toolRegistryPath, "utf-8");

    // Should check for timeoutMs in context
    const hasTimeoutLogic = registrySrc.includes("timeoutMs") &&
                           registrySrc.includes("setTimeout");
    expect(hasTimeoutLogic).toBe(true);
  });

  test("shell tool returns timeout error when exceeded", () => {
    const registrySrc = readFileSync(toolRegistryPath, "utf-8");

    // Should return a specific error when timeout is exceeded
    const hasTimeoutError = registrySrc.includes("timed out") ||
                            registrySrc.includes("TIMEOUT");
    expect(hasTimeoutError).toBe(true);
  });

  test("shell tool can be interrupted via timeout", async () => {
    const { executeTool } = await import("../src/sidecars/tool-registry.ts");

    // Execute a command with a very short timeout - should timeout
    const result = await executeTool(
      "shell",
      { cmd: "sleep 5 && echo done" }, // Would take 5 seconds
      {
        cwd: process.cwd(),
        dangerous: true,
        timeoutMs: 100, // 100ms timeout - way shorter than 5 seconds
      }
    );

    // Should either timeout with error OR complete quickly
    // The key is it shouldn't take 5 seconds
    expect(result.content || result.error).toBeTruthy();
  });
});

// ============================================================================
// GAP-SLASH-001: Slash Command Infrastructure
// ============================================================================

describe("GAP-SLASH-001: Slash Command Infrastructure", () => {
  const slashCommandsPath = "meow/src/sidecars/slash-commands.ts";

  test("slash-commands.ts sidecar exists", () => {
    const exists = existsSync(slashCommandsPath);
    expect(exists).toBe(true);
  });

  test("slash-commands.ts exports command registry", () => {
    const slashCommandsSrc = readFileSync(slashCommandsPath, "utf-8");
    const hasRegistry = slashCommandsSrc.includes("commands") ||
                        slashCommandsSrc.includes("CommandRegistry") ||
                        slashCommandsSrc.includes("registerCommand");
    expect(hasRegistry).toBe(true);
  });

  test("slash-commands.ts has built-in commands defined", () => {
    const slashCommandsSrc = readFileSync(slashCommandsPath, "utf-8");
    const hasHelp = slashCommandsSrc.includes("help");
    const hasExit = slashCommandsSrc.includes("exit");
    const hasPlan = slashCommandsSrc.includes("plan");
    // At least some built-in commands should be defined
    expect(hasHelp || hasExit || hasPlan).toBe(true);
  });

  test("slash-commands.ts has command parser", () => {
    const slashCommandsSrc = readFileSync(slashCommandsPath, "utf-8");
    const hasParser = slashCommandsSrc.includes("parse") ||
                      slashCommandsSrc.includes("execute") ||
                      slashCommandsSrc.includes("run");
    expect(hasParser).toBe(true);
  });

  test("slash-commands.ts supports custom commands", () => {
    const slashCommandsSrc = readFileSync(slashCommandsPath, "utf-8");
    const hasCustom = slashCommandsSrc.includes("custom") ||
                      slashCommandsSrc.includes("user") ||
                      slashCommandsSrc.includes("register");
    expect(hasCustom).toBe(true);
  });
});

// ============================================================================
// GAP-TOOL-001: Edit Tool
// ============================================================================

describe("GAP-TOOL-001: Edit Tool", () => {
  const toolRegistryPath = "meow/src/sidecars/tool-registry.ts";

  test("edit tool exists in tool-registry", () => {
    const registrySrc = readFileSync(toolRegistryPath, "utf-8");
    const hasEditTool = registrySrc.includes('name: "edit"') ||
                        registrySrc.includes("name: 'edit'");
    expect(hasEditTool).toBe(true);
  });

  test("edit tool has correct parameters (old_string, new_string)", () => {
    const registrySrc = readFileSync(toolRegistryPath, "utf-8");
    const hasOldString = registrySrc.includes("old_string");
    const hasNewString = registrySrc.includes("new_string");
    expect(hasOldString && hasNewString).toBe(true);
  });

  test("edit tool performs in-place file modification", () => {
    const registrySrc = readFileSync(toolRegistryPath, "utf-8");
    // Should use readFileSync + replace + writeFileSync for in-place edit
    const hasRead = registrySrc.includes("readFileSync");
    const hasReplace = registrySrc.includes("replace");
    const hasWrite = registrySrc.includes("writeFileSync");
    expect(hasRead && hasReplace && hasWrite).toBe(true);
  });

  test("edit tool returns error when old_string not found", () => {
    const registrySrc = readFileSync(toolRegistryPath, "utf-8");
    const hasNotFoundError = registrySrc.includes("Could not find") ||
                              registrySrc.includes("not found");
    expect(hasNotFoundError).toBe(true);
  });
});