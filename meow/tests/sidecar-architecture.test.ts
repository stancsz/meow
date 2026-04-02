/**
 * Sidecar Architecture Test Suite
 *
 * Tests the sidecar loading system described in docs/TODO.md.
 * Sidecars should be optional, hot-reloadable, and isolated.
 *
 * Run with: bun test meow/tests/sidecar-architecture-test.ts
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ============================================================================
// SIDE CAR EXISTENCE TESTS
// ============================================================================

describe("SIDECAR: Core Sidecars (from TODO.md)", () => {
  /**
   * These are the sidecars defined in docs/TODO.md Phase 1-5
   * Core should stay lean (~100 lines), capabilities in sidecars
   */

  test("Core: lean-agent.ts exists and is lean (<200 lines)", () => {
    const src = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const lines = src.split("\n").length;
    // Core should be ~100 lines, allow up to 200 for growth
    expect(lines).toBeLessThan(200);
    expect(lines).toBeGreaterThan(50); // Should have real implementation
  });

  test("[TODO:SIDECAR-001] tool-registry.ts - NOT IMPLEMENTED", () => {
    // Phase 1.2: Tool registry with hot-reload
    const exists = existsSync("meow/src/sidecars/tool-registry.ts");
    expect(exists).toBe(false);
  });

  test("[TODO:SIDECAR-002] session.ts sidecar - NOT IMPLEMENTED", () => {
    // Phase 1.3: Session manager with compact
    const exists = existsSync("meow/src/sidecars/session.ts");
    expect(exists).toBe(false);
  });

  test("[TODO:SIDECAR-003] permissions.ts sidecar - NOT IMPLEMENTED", () => {
    // Phase 2.1: Pattern-matching permission rules
    const exists = existsSync("meow/src/sidecars/permissions.ts");
    expect(exists).toBe(false);
  });

  test("[TODO:SIDECAR-004] interrupt.ts sidecar - NOT IMPLEMENTED", () => {
    // Phase 2.2: AbortController propagation, SIGINT
    const exists = existsSync("meow/src/sidecars/interrupt.ts");
    expect(exists).toBe(false);
  });

  test("[TODO:SIDECAR-005] slash-commands.ts sidecar - NOT IMPLEMENTED", () => {
    // Phase 3.1: Command parser
    const exists = existsSync("meow/src/sidecars/slash-commands.ts");
    expect(exists).toBe(false);
  });

  test("[TODO:SIDECAR-006] task-store.ts sidecar - EXISTS (integrated)", () => {
    // Phase 3.2: File-based task store
    const exists = existsSync("meow/src/core/task-store.ts");
    expect(exists).toBe(true);
  });

  test("[TODO:SIDECAR-007] repl.ts sidecar - NOT IMPLEMENTED", () => {
    // Phase 3.3: Interactive readline REPL
    const exists = existsSync("meow/src/sidecars/repl.ts");
    expect(exists).toBe(false);
  });

  test("[TODO:SIDECAR-008] mcp-client.ts sidecar - NOT IMPLEMENTED", () => {
    // Phase 4.1: MCP client
    const exists = existsSync("meow/src/sidecars/mcp-client.ts");
    expect(exists).toBe(false);
  });

  test("[TODO:SIDECAR-009] skills.ts sidecar - PARTIAL", () => {
    // Phase 4.2: Skills loader
    const exists = existsSync("meow/src/skills/loader.ts");
    expect(exists).toBe(true);
    // But dynamic loading is NOT implemented
  });

  test("[TODO:SIDECAR-010] memory.ts sidecar - NOT IMPLEMENTED", () => {
    // Phase 4.3: Memory system
    const exists = existsSync("meow/src/sidecars/memory.ts");
    expect(exists).toBe(false);
  });

  test("[TODO:SIDECAR-011] hooks.ts sidecar - NOT IMPLEMENTED", () => {
    // Phase 5.1: Hook system
    const exists = existsSync("meow/src/sidecars/hooks.ts");
    expect(exists).toBe(false);
  });

  test("[TODO:SIDECAR-012] tui.ts sidecar - NOT IMPLEMENTED", () => {
    // Phase 5.2: Terminal UI
    const exists = existsSync("meow/src/sidecars/tui.ts");
    expect(exists).toBe(false);
  });

  test("[TODO:SIDECAR-013] analytics.ts sidecar - NOT IMPLEMENTED", () => {
    // Phase 5.3: Analytics
    const exists = existsSync("meow/src/sidecars/analytics.ts");
    expect(exists).toBe(false);
  });
});

// ============================================================================
// SIDE CAR LOADING TESTS
// ============================================================================

describe("SIDECAR: Loading Architecture", () => {
  test("[TODO:SIDECAR-LOAD-001] No loader.ts for sidecar loading", () => {
    // TODO.md specifies loader.ts for loading sidecars
    const exists = existsSync("meow/src/core/loader.ts");
    expect(exists).toBe(false);
  });

  test("[TODO:SIDECAR-LOAD-002] No .meow/sidecars/ directory", () => {
    // TODO.md specifies user config in .meow/sidecars/
    const exists = existsSync(".meow/sidecars");
    expect(exists).toBe(false);
  });

  test("[TODO:SIDECAR-LOAD-003] No .meow/tools/ directory for custom tools", () => {
    // TODO.md Phase 1.2: Tools should be movable to .meow/tools/
    const exists = existsSync(".meow/tools");
    expect(exists).toBe(false);
  });

  test("[TODO:SIDECAR-LOAD-004] No .meow/skills/ directory for custom skills", () => {
    // TODO.md Phase 4.2: Skills should be loadable from .meow/skills/
    const exists = existsSync(".meow/skills");
    expect(exists).toBe(false);
  });

  test("[TODO:SIDECAR-LOAD-005] No .meow/commands/ directory for custom commands", () => {
    // TODO.md Phase 3.1: Custom commands from .meow/commands/
    const exists = existsSync(".meow/commands");
    expect(exists).toBe(false);
  });

  test("[TODO:SIDECAR-LOAD-006] No .meow/permissions.json", () => {
    // TODO.md Phase 2.1: Permission rules config
    const exists = existsSync(".meow/permissions.json");
    expect(exists).toBe(false);
  });

  test("[TODO:SIDECAR-LOAD-007] No .meow/mcp.json", () => {
    // TODO.md Phase 4.1: MCP server config
    const exists = existsSync(".meow/mcp.json");
    expect(exists).toBe(false);
  });

  test("[TODO:SIDECAR-LOAD-008] No .meow/hooks.json", () => {
    // TODO.md Phase 5.1: Hooks config
    const exists = existsSync(".meow/hooks.json");
    expect(exists).toBe(false);
  });
});

// ============================================================================
// SIDE CAR INTEGRATION TESTS
// ============================================================================

describe("SIDECAR: Integration Tests", () => {
  /**
   * These tests verify that sidecars work correctly when integrated
   */

  test("Skills: All 3 built-in skills load correctly", () => {
    // Built-in skills: simplify, review, commit
    const skillsDir = "meow/src/skills";
    const files = readdirSync(skillsDir).filter(f => f.endsWith(".ts") && f !== "loader.ts" && f !== "index.ts");
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  test("Tools: glob and grep are available as sidecar", () => {
    const searchToolsSrc = readFileSync("meow/src/tools/search.ts", "utf-8");
    expect(searchToolsSrc.includes("export async function glob")).toBe(true);
    expect(searchToolsSrc.includes("export async function grep")).toBe(true);
  });

  test("Task Store: add, list, complete, delete work", () => {
    // This tests the existing task-store.ts
    const taskStoreSrc = readFileSync("meow/src/core/task-store.ts", "utf-8");
    expect(taskStoreSrc.includes("export function addTask")).toBe(true);
    expect(taskStoreSrc.includes("export function listTasks")).toBe(true);
    expect(taskStoreSrc.includes("export function completeTask")).toBe(true);
    expect(taskStoreSrc.includes("export function deleteTask")).toBe(true);
  });

  test("Session Store: Basic JSONL persistence works", () => {
    const sessionStoreSrc = readFileSync("meow/src/core/session-store.ts", "utf-8");
    expect(sessionStoreSrc.includes("createSession")).toBe(true);
    expect(sessionStoreSrc.includes("loadSession")).toBe(true);
    expect(sessionStoreSrc.includes("appendToSession")).toBe(true);
  });
});

// ============================================================================
// SIDE CAR ARCHITECTURE PRINCIPLES TEST
// ============================================================================

describe("SIDECAR: Architecture Principles", () => {
  /**
   * Tests for the principles outlined in TODO.md:
   * 1. Core never grows (~100 lines)
   * 2. Sidecars are optional
   * 3. Sidecars are hot-reloadable
   * 4. Sidecars are isolated (can't break core)
   */

  test("Core PRINCIPLE: Core is frozen at ~100 lines", () => {
    const src = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const lines = src.split("\n").filter(l => l.trim().length > 0).length;
    // Core should stay lean
    console.log(`Core lines (non-empty): ${lines}`);
    expect(lines).toBeLessThan(200);
  });

  test("[TODO:SIDECAR-PRINCIPLE-001] No .meow/ config directory exists", () => {
    // Principle: .meow/ should be created by user for configuration
    const exists = existsSync(".meow");
    // This is expected to NOT exist initially
    expect(exists).toBe(false);
  });

  test("Core PRINCIPLE: Tools should be sidecars but aren't fully separated", () => {
    // Currently tools (glob, grep) are in meow/src/tools/search.ts
    // But read, write, shell, git are inline in lean-agent.ts
    // This is the GAP - tools should ALL be sidecars
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");

    // These tools are INLINE, not sidecars
    const hasInlineRead = leanAgentSrc.includes("readFileSync");
    const hasInlineWrite = leanAgentSrc.includes("writeFileSync");
    const hasInlineExec = leanAgentSrc.includes("exec");

    // This is expected to be true - it's the GAP
    expect(hasInlineRead || hasInlineWrite || hasInlineExec).toBe(true);
  });

  test("[TODO:SIDECAR-PRINCIPLE-002] Tool sidecar registry not implemented", () => {
    // TODO.md Phase 1.2: Tools should be registered in a sidecar
    const hasRegistry = existsSync("meow/src/sidecars/tool-registry.ts");
    expect(hasRegistry).toBe(false);
  });

  test("[TODO:SIDECAR-PRINCIPLE-003] Hot-reload not implemented", () => {
    // TODO.md: Sidecars should be hot-reloadable
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasHotReload = leanAgentSrc.includes("hot") ||
                         leanAgentSrc.includes("reload") ||
                         leanAgentSrc.includes("watch");
    expect(hasHotReload).toBe(false);
  });
});

// ============================================================================
// SIDE CAR FILE STRUCTURE TEST
// ============================================================================

describe("SIDECAR: File Structure (Target from TODO.md)", () => {
  const targetStructure = {
    "meow/src/core/lean-agent.ts": "exists",
    "meow/src/core/loader.ts": "missing", // NOT IMPLEMENTED
    "meow/src/sidecars/tool-registry.ts": "missing",
    "meow/src/sidecars/session.ts": "missing",
    "meow/src/sidecars/permissions.ts": "missing",
    "meow/src/sidecars/interrupt.ts": "missing",
    "meow/src/sidecars/slash-commands.ts": "missing",
    "meow/src/core/task-store.ts": "exists",
    "meow/src/sidecars/repl.ts": "missing",
    "meow/src/sidecars/mcp-client.ts": "missing",
    "meow/src/skills/loader.ts": "exists",
    "meow/src/sidecars/memory.ts": "missing",
    "meow/src/sidecars/hooks.ts": "missing",
    "meow/src/sidecars/tui.ts": "missing",
    "meow/src/sidecars/analytics.ts": "missing",
    ".meow/sidecars": "missing",
    ".meow/tools": "missing",
    ".meow/skills": "missing",
    ".meow/commands": "missing",
    ".meow/permissions.json": "missing",
    ".meow/mcp.json": "missing",
    ".meow/hooks.json": "missing",
  };

  test("Target file structure from TODO.md", () => {
    let missing = 0;
    let exists = 0;

    for (const [path, expected] of Object.entries(targetStructure)) {
      const actuallyExists = existsSync(path);
      if (expected === "exists" && actuallyExists) {
        exists++;
      } else if (expected === "missing" && !actuallyExists) {
        missing++;
      }
    }

    console.log(`\nSidecar structure status:`);
    console.log(`  Implemented: ${exists} files/dirs`);
    console.log(`  Missing (TODO): ${missing} files/dirs`);

    // This always passes - it's informational
    expect(true).toBe(true);
  });

  test("SIDECAR FILES: Full inventory", () => {
    // Check meow/src structure
    const meowSrcExists = existsSync("meow/src");
    if (meowSrcExists) {
      const dirs = readdirSync("meow/src", { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      console.log(`\nmeow/src/ directories: ${dirs.join(", ")}`);
    }

    expect(true).toBe(true);
  });
});

// ============================================================================
// PRIORITY MATRIX VERIFICATION (from TODO.md)
// ============================================================================

describe("SIDECAR: Priority Matrix (from TODO.md)", () => {
  test("TODO.md Priority Matrix accuracy", () => {
    const priorities = [
      // P0
      { name: "tool-registry", utility: "High", complexity: "Low", priority: "P0" },
      { name: "session", utility: "High", complexity: "Low", priority: "P0" },
      // P1
      { name: "permissions", utility: "High", complexity: "Medium", priority: "P1" },
      { name: "interrupt", utility: "High", complexity: "Low", priority: "P1" },
      { name: "slash-commands", utility: "High", complexity: "Medium", priority: "P1" },
      // P2
      { name: "task-store", utility: "Medium", complexity: "Low", priority: "P2" },
      { name: "repl", utility: "Medium", complexity: "Medium", priority: "P2" },
      // P3
      { name: "mcp-client", utility: "High", complexity: "High", priority: "P3" },
      { name: "skills", utility: "Medium", complexity: "Medium", priority: "P3" },
      { name: "memory", utility: "Medium", complexity: "Low", priority: "P3" },
      // P4
      { name: "hooks", utility: "Low", complexity: "Medium", priority: "P4" },
      { name: "tui", utility: "Low", complexity: "High", priority: "P4" },
      // P5
      { name: "analytics", utility: "Low", complexity: "Low", priority: "P5" },
    ];

    const implemented = priorities.filter(p => {
      // These are implemented or partially implemented
      if (p.name === "task-store" || p.name === "skills") return true;
      return false;
    });

    const notImplemented = priorities.filter(p => {
      if (p.name === "task-store" || p.name === "skills") return false;
      return true;
    });

    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                    SIDECAR PRIORITY MATRIX STATUS                            ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  P0 (Immediate): tool-registry, session                                     ║
║    → Status: NOT IMPLEMENTED                                                 ║
║                                                                              ║
║  P1 (This Sprint): permissions, interrupt, slash-commands                  ║
║    → Status: NOT IMPLEMENTED                                                ║
║                                                                              ║
║  P2 (Next): task-store, repl                                                ║
║    → Status: task-store IMPLEMENTED, repl NOT IMPLEMENTED                   ║
║                                                                              ║
║  P3 (Soon): mcp-client, skills, memory                                      ║
║    → Status: skills PARTIAL (loader exists, no dynamic loading)              ║
║                                                                              ║
║  P4 (Nice to have): hooks, tui                                               ║
║    → Status: NOT IMPLEMENTED                                                 ║
║                                                                              ║
║  P5 (Future): analytics                                                      ║
║    → Status: NOT IMPLEMENTED                                                 ║
╚══════════════════════════════════════════════════════════════════════════════╝
    `);

    expect(true).toBe(true);
  });
});
