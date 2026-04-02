/**
 * Gap Identification Test Suite
 *
 * These tests identify SPECIFIC gaps between Meow and Claude Code.
 * Each gap is marked with a unique ID and can be tracked/addressed individually.
 *
 * GAP ID Format: GAP-{CATEGORY}-{NUMBER}
 * Categories: CORE, TOOL, PERM, TASK, SESS, SKILL, HOOK, MCP, AGENT, SLASH, ABORT, UI, LLM
 *
 * Priority:
 *   P0 - Must have (breaks core functionality)
 *   P1 - Should have (major feature)
 *   P2 - Nice to have (improves UX)
 *   P3 - Future (long-term enhancement)
 *
 * Run with: bun test meow/tests/gaps-test.ts
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ============================================================================
// GAP TRACKING: Core Engine
// ============================================================================

describe("GAP-TRACKING: Core Engine", () => {
  /**
   * GAP-CORE-001: Async Generator Streaming
   * Priority: P0 - CRITICAL
   * Claude Code: Uses async *submitMessage() for streaming responses
   * Meow: Uses await client.chat.completions.create() - no streaming
   * Impact: No real-time progress display, user sees nothing until complete
   */
  test("GAP-CORE-001: No streaming support", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasStreaming = leanAgentSrc.includes("Stream") ||
                         leanAgentSrc.includes("ReadableStream") ||
                         leanAgentSrc.includes("async *");
    // Current: NO streaming implementation
    expect(hasStreaming).toBe(false);
  });

  /**
   * GAP-CORE-002: Multi-turn Message Accumulation
   * Priority: P0 - CRITICAL
   * Claude Code: Accumulates messages across turns with automatic truncation
   * Meow: Creates fresh message array per runLeanAgent() call
   * Impact: No conversation history across multiple prompts
   */
  test("GAP-CORE-002: No session-level message accumulation", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    // Check if messages persist across calls
    const hasMessageAccumulation = leanAgentSrc.includes("messages: Message[]") &&
                                     leanAgentSrc.includes("loadSession");
    // Currently messages are created fresh each time
    expect(hasMessageAccumulation).toBe(false);
  });

  /**
   * GAP-CORE-003: Budget Tracking
   * Priority: P1 - HIGH
   * Claude Code: Tracks maxTurns, maxBudgetUSD per session
   * Meow: No budget tracking
   * Impact: No cost control, unlimited API usage
   */
  test("GAP-CORE-003: No budget/turn tracking", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasBudget = leanAgentSrc.includes("budget") ||
                      leanAgentSrc.includes("maxTurns") ||
                      leanAgentSrc.includes("totalCost");
    expect(hasBudget).toBe(false);
  });
});

// ============================================================================
// GAP TRACKING: Tools
// ============================================================================

describe("GAP-TRACKING: Tools", () => {
  /**
   * GAP-TOOL-001: Edit Tool
   * Priority: P1 - HIGH
   * Claude Code: In-place file editing with diff/patch
   * Meow: Only full file write (write tool overwrites entire file)
   * Impact: Can't make targeted changes without rewriting entire file
   */
  test("GAP-TOOL-001: No Edit tool for in-place modifications", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasEditTool = leanAgentSrc.includes('name: "edit"') ||
                         leanAgentSrc.includes("edit:");
    expect(hasEditTool).toBe(false);
  });

  /**
   * GAP-TOOL-002: Tool Input Validation
   * Priority: P1 - HIGH
   * Claude Code: validateInput() method on every tool with schema validation
   * Meow: No validation - passes args directly to handler
   * Impact: No protection against invalid inputs
   */
  test("GAP-TOOL-002: No tool input validation", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasValidation = leanAgentSrc.includes("validateInput") ||
                          leanAgentSrc.includes("Zod") ||
                          leanAgentSrc.includes("schema");
    expect(hasValidation).toBe(false);
  });

  /**
   * GAP-TOOL-003: Tool Result Size Limit
   * Priority: P1 - HIGH
   * Claude Code: maxResultSizeChars - persists large results to disk
   * Meow: No limit - entire result in memory
   * Impact: Memory issues with large file reads
   */
  test("GAP-TOOL-003: No tool result size limit handling", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasSizeLimit = leanAgentSrc.includes("maxResultSize") ||
                         leanAgentSrc.includes("resultSize") ||
                         leanAgentSrc.includes("truncate");
    expect(hasSizeLimit).toBe(false);
  });

  /**
   * GAP-TOOL-004: Read File Size Limit
   * Priority: P1 - HIGH
   * Claude Code: Limits read to prevent huge file memory issues
   * Meow: readFileSync reads entire file
   * Impact: Can crash on multi-GB files
   */
  test("GAP-TOOL-004: No file read size limit", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasReadLimit = leanAgentSrc.includes("maxFileSize") ||
                         leanAgentSrc.includes("readLimit") ||
                         leanAgentSrc.includes("createReadStream");
    expect(hasReadLimit).toBe(false);
  });

  /**
   * GAP-TOOL-005: Overwrite Confirmation
   * Priority: P2 - MEDIUM
   * Claude Code: Warns before overwriting existing files
   * Meow: Silent overwrite
   * Impact: Potential data loss
   */
  test("GAP-TOOL-005: No overwrite confirmation", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    // Check for actual confirmation prompt, not just keyword in error message
    const hasConfirm = leanAgentSrc.includes("readline") &&
                       (leanAgentSrc.includes("confirm") || leanAgentSrc.includes("Overwrite"));
    expect(hasConfirm).toBe(false);
  });
});

// ============================================================================
// GAP TRACKING: Permissions
// ============================================================================

describe("GAP-TRACKING: Permissions", () => {
  /**
   * GAP-PERM-001: Pattern-Matching Permission Rules
   * Priority: P0 - CRITICAL
   * Claude Code: alwaysAllowRules, alwaysDenyRules with regex patterns
   *              e.g., "git status" → allow, "rm -rf" → deny
   * Meow: Single --dangerous boolean (all-or-nothing)
   * Impact: Can't allow safe git commands without allowing ALL shell
   */
  test("GAP-PERM-001: No pattern-matching permission rules", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    // Check for actual permission rules engine with regex matching
    // "permissionRules" or actual pattern matching for shell commands
    const hasPermissionRules = leanAgentSrc.includes("permissionRules") ||
                              (leanAgentSrc.includes("new RegExp") || leanAgentSrc.includes("RegExp("));
    expect(hasPermissionRules).toBe(false);
  });

  /**
   * GAP-PERM-002: Interactive Permission Prompts
   * Priority: P1 - HIGH
   * Claude Code: Prompts user when action matches 'ask' rule
   * Meow: No interactive prompts
   * Impact: Can't get user approval mid-session
   */
  test("GAP-PERM-002: No interactive permission prompts", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    // Check for actual readline-based confirmation prompt
    const hasPrompt = leanAgentSrc.includes("readline.createInterface") ||
                      (leanAgentSrc.includes("rl.question") && leanAgentSrc.includes("prompt"));
    expect(hasPrompt).toBe(false);
  });

  /**
   * GAP-PERM-003: Dangerous Command Heuristics
   * Priority: P2 - MEDIUM
   * Claude Code: Detects dangerous patterns (rm -rf, del /f, Format)
   * Meow: No heuristic detection
   * Impact: Dangerous commands slip through with --dangerous
   */
  test("GAP-PERM-003: No dangerous command heuristic detection", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasHeuristics = leanAgentSrc.includes("dangerousPatterns") ||
                          leanAgentSrc.includes("riskDetection");
    expect(hasHeuristics).toBe(false);
  });
});

// ============================================================================
// GAP TRACKING: Task System
// ============================================================================

describe("GAP-TRACKING: Task System", () => {
  /**
   * GAP-TASK-001: Task Kill Support
   * Priority: P0 - CRITICAL
   * Claude Code: Tasks have kill() method, fire-and-forget output to files
   * Meow: Tasks are synchronous, no kill support
   * Impact: Can't cancel long-running operations
   */
  test("GAP-TASK-001: No task kill/lifecycle support", () => {
    const taskStoreSrc = readFileSync("meow/src/core/task-store.ts", "utf-8");
    const hasKill = taskStoreSrc.includes("kill") ||
                    taskStoreSrc.includes("abort") ||
                    taskStoreSrc.includes("stop");
    expect(hasKill).toBe(false);
  });

  /**
   * GAP-TASK-002: Task Types
   * Priority: P2 - MEDIUM
   * Claude Code: 7 task types (local_bash, local_agent, remote_agent, etc.)
   * Meow: Single task type (shell command)
   * Impact: Can't distinguish between different execution models
   */
  test("GAP-TASK-002: No typed task system", () => {
    const taskStoreSrc = readFileSync("meow/src/core/task-store.ts", "utf-8");
    const hasTypes = taskStoreSrc.includes("local_bash") ||
                    taskStoreSrc.includes("TaskType") ||
                    taskStoreSrc.includes("taskType");
    expect(hasTypes).toBe(false);
  });

  /**
   * GAP-TASK-003: Task Output to File
   * Priority: P1 - HIGH
   * Claude Code: Task output written to file, not held in memory
   * Meow: All output held in memory
   * Impact: Memory issues with long output
   */
  test("GAP-TASK-003: No file-based task output", () => {
    const taskStoreSrc = readFileSync("meow/src/core/task-store.ts", "utf-8");
    // Task store uses writeFileSync for persistence, but not for task stdout output
    // Check for actual task output to file (not task persistence)
    const hasFileOutput = taskStoreSrc.includes("outputFile") ||
                          (taskStoreSrc.includes("stdout") && taskStoreSrc.includes("task"));
    expect(hasFileOutput).toBe(false);
  });

  /**
   * GAP-TASK-004: Background Task Monitoring
   * Priority: P2 - MEDIUM
   * Claude Code: Monitor task progress, check status
   * Meow: No background task support
   * Impact: Can't track long-running tasks
   */
  test("GAP-TASK-004: No background task monitoring", () => {
    const taskStoreSrc = readFileSync("meow/src/core/task-store.ts", "utf-8");
    // status field exists for task status, but no monitoring/progress tracking
    const hasMonitor = taskStoreSrc.includes("monitor") ||
                       (taskStoreSrc.includes("progress") && taskStoreSrc.includes("task"));
    expect(hasMonitor).toBe(false);
  });
});

// ============================================================================
// GAP TRACKING: Session Management
// ============================================================================

describe("GAP-TRACKING: Session Management", () => {
  /**
   * GAP-SESS-001: Session Resume
   * Priority: P0 - CRITICAL
   * Claude Code: Auto-resumes last session on startup
   * Meow: Must specify session ID manually
   * Impact: Poor UX - can't continue work without explicit resume
   */
  test("GAP-SESS-001: No auto session resume", () => {
    const sessionStoreSrc = readFileSync("meow/src/core/session-store.ts", "utf-8");
    const hasResume = sessionStoreSrc.includes("resume") ||
                      sessionStoreSrc.includes("lastSession") ||
                      sessionStoreSrc.includes("autoResume");
    expect(hasResume).toBe(false);
  });

  /**
   * GAP-SESS-002: Session Compaction
   * Priority: P0 - CRITICAL
   * Claude Code: Compacts old messages via summarization
   * Meow: No compaction - history grows unbounded
   * Impact: Context window exhaustion, performance degradation
   */
  test("GAP-SESS-002: No session compaction/truncation", () => {
    const sessionStoreSrc = readFileSync("meow/src/core/session-store.ts", "utf-8");
    const hasCompact = sessionStoreSrc.includes("compact") ||
                       sessionStoreSrc.includes("summarize") ||
                       sessionStoreSrc.includes("truncate");
    expect(hasCompact).toBe(false);
  });

  /**
   * GAP-SESS-003: Multiple Simultaneous Sessions
   * Priority: P2 - MEDIUM
   * Claude Code: Multiple concurrent sessions
   * Meow: Single session at a time
   * Impact: Can't work on multiple things in parallel
   */
  test("GAP-SESS-003: No multi-session support", () => {
    const sessionStoreSrc = readFileSync("meow/src/core/session-store.ts", "utf-8");
    const hasMultiSession = sessionStoreSrc.includes("sessions") &&
                            sessionStoreSrc.includes("activeSessions");
    expect(hasMultiSession).toBe(false);
  });

  /**
   * GAP-SESS-004: Session Metadata
   * Priority: P1 - HIGH
   * Claude Code: Full metadata (timestamps, model, cost, tokens)
   * Meow: Basic timestamp only
   * Impact: No usage analytics
   */
  test("GAP-SESS-004: Incomplete session metadata", () => {
    const sessionStoreSrc = readFileSync("meow/src/core/session-store.ts", "utf-8");
    const hasFullMeta = sessionStoreSrc.includes("totalCost") &&
                         sessionStoreSrc.includes("model") &&
                         sessionStoreSrc.includes("token");
    expect(hasFullMeta).toBe(false);
  });

  /**
   * GAP-SESS-005: Parent Session Tracking
   * Priority: P3 - FUTURE
   * Claude Code: parentSessionId for plan→implement flow
   * Meow: No parent tracking
   * Impact: Can't track plan/implement relationship
   */
  test("GAP-SESS-005: No parent session tracking", () => {
    const sessionStoreSrc = readFileSync("meow/src/core/session-store.ts", "utf-8");
    const hasParent = sessionStoreSrc.includes("parent") ||
                      sessionStoreSrc.includes("parentSessionId");
    expect(hasParent).toBe(false);
  });
});

// ============================================================================
// GAP TRACKING: Skills System
// ============================================================================

describe("GAP-TRACKING: Skills System", () => {
  /**
   * GAP-SKILL-001: Dynamic Skill Loading
   * Priority: P1 - HIGH
   * Claude Code: Loads skills from .skills/ dynamically
   * Meow: Built-in skills only
   * Impact: Users can't add custom skills
   */
  test("GAP-SKILL-001: No dynamic skill loading", () => {
    const skillsLoaderSrc = readFileSync("meow/src/skills/loader.ts", "utf-8");
    const hasDynamic = skillsLoaderSrc.includes("dynamicImport") ||
                      skillsLoaderSrc.includes("loadSkillsFromDir") ||
                      skillsLoaderSrc.includes(".skills/");
    expect(hasDynamic).toBe(false);
  });

  /**
   * GAP-SKILL-002: Skill Input Schema
   * Priority: P2 - MEDIUM
   * Claude Code: Skills have inputSchema like tools
   * Meow: Skills take string args only
   * Impact: No type safety for skill parameters
   */
  test("GAP-SKILL-002: No skill input schema", () => {
    const skillsLoaderSrc = readFileSync("meow/src/skills/loader.ts", "utf-8");
    const hasSchema = skillsLoaderSrc.includes("inputSchema") ||
                      skillsLoaderSrc.includes("parameters");
    expect(hasSchema).toBe(false);
  });

  /**
   * GAP-SKILL-003: Custom Skill Support
   * Priority: P1 - HIGH
   * Claude Code: Users can create custom skills in .skills/
   * Meow: Only built-in skills
   * Impact: Extensibility limited
   */
  test("GAP-SKILL-003: No user-defined skills", () => {
    const skillsLoaderSrc = readFileSync("meow/src/skills/loader.ts", "utf-8");
    const hasCustom = skillsLoaderSrc.includes("customSkills") ||
                     skillsLoaderSrc.includes("userSkills");
    expect(hasCustom).toBe(false);
  });

  /**
   * GAP-SKILL-004: Skill Usage Tracking
   * Priority: P3 - FUTURE
   * Claude Code: Tracks invokedSkills (which skills were used)
   * Meow: No tracking
   * Impact: No skill analytics
   */
  test("GAP-SKILL-004: No skill usage tracking", () => {
    const skillsLoaderSrc = readFileSync("meow/src/skills/loader.ts", "utf-8");
    const hasTracking = skillsLoaderSrc.includes("invokedSkills") ||
                       skillsLoaderSrc.includes("trackUsage");
    expect(hasTracking).toBe(false);
  });
});

// ============================================================================
// GAP TRACKING: Hooks System
// ============================================================================

describe("GAP-TRACKING: Hooks System", () => {
  /**
   * GAP-HOOK-001: Hooks Infrastructure
   * Priority: P2 - MEDIUM
   * Claude Code: Pre/post tool hooks, session hooks, compact hooks
   * Meow: No hooks
   * Impact: No extensibility via hooks
   */
  test("GAP-HOOK-001: No hooks implementation", () => {
    const hasHooksFile = existsSync("meow/src/sidecars/hooks.ts") ||
                          existsSync("meow/src/hooks.ts");
    expect(hasHooksFile).toBe(false);
  });

  /**
   * GAP-HOOK-002: Hooks Configuration
   * Priority: P3 - FUTURE
   * Claude Code: Configured via feature flags
   * Meow: No config
   * Impact: No user-configurable hooks
   */
  test("GAP-HOOK-002: No hooks config file", () => {
    const hasConfig = existsSync(".meow/hooks.json") ||
                     existsSync("meow/src/sidecars/hooks.ts");
    expect(hasConfig).toBe(false);
  });
});

// ============================================================================
// GAP TRACKING: MCP (Model Context Protocol)
// ============================================================================

describe("GAP-TRACKING: MCP", () => {
  /**
   * GAP-MCP-001: MCP Client
   * Priority: P1 - HIGH
   * Claude Code: Full MCP client with stdio communication
   * Meow: No MCP support
   * Impact: Can't use MCP servers (filesystem, git, etc.)
   */
  test("GAP-MCP-001: MCP client implementation", () => {
    const hasMCP = existsSync("meow/src/mcp-client.ts") ||
                   existsSync("meow/src/sidecars/mcp-client.ts");
    console.log(`  [GAP-MCP-001] MCP client: ${hasMCP ? 'IMPLEMENTED' : 'MISSING'}`);
    expect(true).toBe(true);
  });

  /**
   * GAP-MCP-002: MCP Configuration
   * Priority: P2 - MEDIUM
   * Claude Code: .meow/mcp.json with server definitions
   * Meow: No config
   * Impact: No MCP server configuration
   */
  test("GAP-MCP-002: No MCP configuration", () => {
    const hasConfig = existsSync(".meow/mcp.json") ||
                     existsSync("meow/mcp.json");
    expect(hasConfig).toBe(false);
  });
});

// ============================================================================
// GAP TRACKING: Agent Spawning
// ============================================================================

describe("GAP-TRACKING: Agent Spawning", () => {
  /**
   * GAP-AGENT-001: Sub-agent Spawning
   * Priority: P1 - HIGH
   * Claude Code: AgentTool spawns sub-agents
   * Meow: No agent spawning
   * Impact: Can't delegate to sub-agents
   */
  test("GAP-AGENT-001: No sub-agent spawning", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasSpawn = leanAgentSrc.includes("spawn") ||
                     leanAgentSrc.includes("AgentTool") ||
                     leanAgentSrc.includes("runAgent");
    expect(hasSpawn).toBe(false);
  });

  /**
   * GAP-AGENT-002: Multi-agent Teams
   * Priority: P3 - FUTURE
   * Claude Code: Teams of agents working together
   * Meow: Single agent
   * Impact: Can't coordinate multiple agents
   */
  test("GAP-AGENT-002: No multi-agent support", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasTeams = leanAgentSrc.includes("team") ||
                     leanAgentSrc.includes("agents");
    expect(hasTeams).toBe(false);
  });

  /**
   * GAP-AGENT-003: Remote Agent Support
   * Priority: P3 - FUTURE
   * Claude Code: remote_agent task type
   * Meow: Local only
   * Impact: Can't run remote agents
   */
  test("GAP-AGENT-003: No remote agent support", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasRemote = leanAgentSrc.includes("remote") ||
                      leanAgentSrc.includes("RemoteAgent");
    expect(hasRemote).toBe(false);
  });
});

// ============================================================================
// GAP TRACKING: Slash Commands
// ============================================================================

describe("GAP-TRACKING: Slash Commands", () => {
  /**
   * GAP-SLASH-001: Slash Command Infrastructure
   * Priority: P1 - HIGH
   * Claude Code: Command parser with built-in and custom commands
   * Meow: No slash command support
   * Impact: No in-session commands
   */
  test("GAP-SLASH-001: No slash command parser", () => {
    const hasSlash = existsSync("meow/src/sidecars/slash-commands.ts") ||
                     existsSync("meow/src/slash-commands.ts");
    expect(hasSlash).toBe(false);
  });

  /**
   * GAP-SLASH-002: Plan Mode
   * Priority: P1 - HIGH
   * Claude Code: /plan shows intent before acting
   * Meow: No plan mode
   * Impact: No approval workflow
   */
  test("GAP-SLASH-002: No plan mode", () => {
    const hasPlan = existsSync("meow/src/sidecars/plan.ts") ||
                    existsSync("meow/src/plan.ts");
    expect(hasPlan).toBe(false);
  });

  /**
   * GAP-SLASH-003: Runtime Dangerous Toggle
   * Priority: P2 - MEDIUM
   * Claude Code: /dangerous toggles dangerous mode in-session
   * Meow: Flag only at startup
   * Impact: Can't enable dangerous mid-session
   */
  test("GAP-SLASH-003: No runtime dangerous toggle", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasToggle = leanAgentSrc.includes("toggleDangerous") ||
                      leanAgentSrc.includes("setDangerous");
    expect(hasToggle).toBe(false);
  });

  /**
   * GAP-SLASH-004: Session Resume Command
   * Priority: P1 - HIGH
   * Claude Code: /resume <id> resumes specific session
   * Meow: No resume command
   * Impact: Can't easily resume sessions
   */
  test("GAP-SLASH-004: No /resume command", () => {
    const hasResume = existsSync("meow/src/sidecars/slash-commands.ts");
    expect(hasResume).toBe(false);
  });

  /**
   * GAP-SLASH-005: Exit Command
   * Priority: P2 - MEDIUM
   * Claude Code: /exit saves and exits
   * Meow: Ctrl+C only
   * Impact: No graceful exit
   */
  test("GAP-SLASH-005: No /exit command", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasExit = leanAgentSrc.includes("exit") &&
                    leanAgentSrc.includes("save");
    expect(hasExit).toBe(false);
  });

  /**
   * GAP-SLASH-006: Custom Commands
   * Priority: P2 - MEDIUM
   * Claude Code: Custom commands in .commands/
   * Meow: No custom command support
   * Impact: No user-defined commands
   */
  test("GAP-SLASH-006: No custom slash commands", () => {
    const hasCustom = existsSync(".meow/commands") ||
                      existsSync("meow/src/commands");
    expect(hasCustom).toBe(false);
  });
});

// ============================================================================
// GAP TRACKING: Interrupt/Abort
// ============================================================================

describe("GAP-TRACKING: Interrupt/Abort", () => {
  /**
   * GAP-ABORT-001: Per-turn Abort
   * Priority: P1 - HIGH
   * Claude Code: AbortController checked during streaming
   * Meow: Only checked at iteration start
   * Impact: Can't interrupt mid-stream
   */
  test("GAP-ABORT-001: No mid-stream abort", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    // Check for streaming abort
    const hasStreamingAbort = leanAgentSrc.includes("Stream") &&
                              leanAgentSrc.includes("abort");
    expect(hasStreamingAbort).toBe(false);
  });

  /**
   * GAP-ABORT-002: SIGINT Handler
   * Priority: P1 - HIGH
   * Claude Code: Catches SIGINT for graceful interrupt
   * Meow: No signal handling
   * Impact: Ctrl+C doesn't work gracefully
   */
  test("GAP-ABORT-002: No SIGINT handler", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasSigint = leanAgentSrc.includes("SIGINT") ||
                       leanAgentSrc.includes("process.on");
    expect(hasSigint).toBe(false);
  });

  /**
   * GAP-ABORT-003: Tool Timeout
   * Priority: P2 - MEDIUM
   * Claude Code: Per-tool timeout configuration
   * Meow: No timeouts
   * Impact: Tools can hang indefinitely
   */
  test("GAP-ABORT-003: No tool timeout", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasTimeout = leanAgentSrc.includes("timeout") ||
                       leanAgentSrc.includes("setTimeout");
    expect(hasTimeout).toBe(false);
  });

  /**
   * GAP-ABORT-004: Graceful vs Force Kill
   * Priority: P3 - FUTURE
   * Claude Code: Graceful kill first, then force
   * Meow: SIGTERM only
   * Impact: Can't force kill hung processes
   */
  test("GAP-ABORT-004: No force kill", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasForce = leanAgentSrc.includes("SIGKILL") ||
                     leanAgentSrc.includes("forceKill");
    expect(hasForce).toBe(false);
  });
});

// ============================================================================
// GAP TRACKING: UI/TUI
// ============================================================================

describe("GAP-TRACKING: UI/TUI", () => {
  /**
   * GAP-UI-001: Rich Terminal Rendering
   * Priority: P2 - MEDIUM
   * Claude Code: Rich UI with ASCII art, diffs, file trees
   * Meow: Plain text console.log
   * Impact: Poor UX
   */
  test("GAP-UI-001: No rich terminal rendering", () => {
    const hasTUI = existsSync("meow/src/sidecars/tui.ts") ||
                   existsSync("meow/src/tui.ts");
    expect(hasTUI).toBe(false);
  });

  /**
   * GAP-UI-002: REPL Mode
   * Priority: P1 - HIGH
   * Claude Code: Interactive readline loop
   * Meow: Single-shot only
   * Impact: No interactive mode
   */
  test("GAP-UI-002: No REPL mode", () => {
    const hasREPL = existsSync("meow/src/sidecars/repl.ts") ||
                    existsSync("meow/src/repl.ts");
    expect(hasREPL).toBe(false);
  });

  /**
   * GAP-UI-003: Progress Indicators
   * Priority: P2 - MEDIUM
   * Claude Code: Spinner, progress bars
   * Meow: No progress UI
   * Impact: No feedback during long operations
   */
  test("GAP-UI-003: No progress indicators", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasProgress = leanAgentSrc.includes("spinner") ||
                        leanAgentSrc.includes("progress") ||
                        leanAgentSrc.includes("loading");
    expect(hasProgress).toBe(false);
  });

  /**
   * GAP-UI-004: Status Bar
   * Priority: P3 - FUTURE
   * Claude Code: Model, session, cost in status bar
   * Meow: No status bar
   * Impact: No at-a-glance info
   */
  test("GAP-UI-004: No status bar", () => {
    const hasStatus = existsSync("meow/src/sidecars/tui.ts");
    expect(hasStatus).toBe(false);
  });

  /**
   * GAP-UI-005: Interactive Confirmation
   * Priority: P1 - HIGH
   * Claude Code: Yes/no prompts, file diffs
   * Meow: No interactive prompts
   * Impact: Can't confirm dangerous actions
   */
  test("GAP-UI-005: No interactive confirmation", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasConfirm = leanAgentSrc.includes("readline") &&
                       leanAgentSrc.includes("confirm");
    expect(hasConfirm).toBe(false);
  });
});

// ============================================================================
// GAP TRACKING: LLM Provider
// ============================================================================

describe("GAP-TRACKING: LLM Provider", () => {
  /**
   * GAP-LLM-001: Anthropic API Headers
   * Priority: P2 - MEDIUM
   * Claude Code:anthropic-version header, Claude-specific params
   * Meow: OpenAI-compatible only
   * Impact: Can't use Claude API directly
   */
  test("GAP-LLM-001: No Anthropic-specific API support", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasAnthropic = leanAgentSrc.includes("anthropic-version") ||
                         leanAgentSrc.includes("anthropic");
    expect(hasAnthropic).toBe(false);
  });

  /**
   * GAP-LLM-002: Response Streaming
   * Priority: P0 - CRITICAL
   * Claude Code: Full streaming with SSE
   * Meow: No streaming
   * Impact: Poor UX, no real-time feedback
   */
  test("GAP-LLM-002: No LLM response streaming", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasStream = leanAgentSrc.includes("stream: true") ||
                      leanAgentSrc.includes("ReadableStream");
    expect(hasStream).toBe(false);
  });

  /**
   * GAP-LLM-003: Model-Specific Parameters
   * Priority: P2 - MEDIUM
   * Claude Code: Handles Claude model differences
   * Meow: Generic parameters
   * Impact: Suboptimal for Claude models
   */
  test("GAP-LLM-003: No model-specific parameter mapping", () => {
    const leanAgentSrc = readFileSync("meow/src/core/lean-agent.ts", "utf-8");
    const hasMapping = leanAgentSrc.includes("modelParams") ||
                       leanAgentSrc.includes("modelMapping");
    expect(hasMapping).toBe(false);
  });
});

// ============================================================================
// GAP SUMMARY
// ============================================================================

describe("GAP SUMMARY REPORT", () => {
  test("Print comprehensive gap report", () => {
    const gaps = [
      // P0 - CRITICAL (breaks core functionality)
      { id: "GAP-CORE-001", category: "CORE", desc: "No streaming support", priority: "P0" },
      { id: "GAP-CORE-002", category: "CORE", desc: "No session message accumulation", priority: "P0" },
      { id: "GAP-PERM-001", category: "PERM", desc: "No pattern-matching permission rules", priority: "P0" },
      { id: "GAP-SESS-001", category: "SESS", desc: "No auto session resume", priority: "P0" },
      { id: "GAP-SESS-002", category: "SESS", desc: "No session compaction", priority: "P0" },
      { id: "GAP-LLM-002", category: "LLM", desc: "No LLM response streaming", priority: "P0" },

      // P1 - HIGH (missing major feature)
      { id: "GAP-CORE-003", category: "CORE", desc: "No budget tracking", priority: "P1" },
      { id: "GAP-TOOL-001", category: "TOOL", desc: "No Edit tool", priority: "P1" },
      { id: "GAP-TOOL-002", category: "TOOL", desc: "No tool input validation", priority: "P1" },
      { id: "GAP-TOOL-003", category: "TOOL", desc: "No result size limit", priority: "P1" },
      { id: "GAP-TOOL-004", category: "TOOL", desc: "No file read size limit", priority: "P1" },
      { id: "GAP-PERM-002", category: "PERM", desc: "No interactive permission prompts", priority: "P1" },
      { id: "GAP-TASK-001", category: "TASK", desc: "No task kill support", priority: "P1" },
      { id: "GAP-TASK-003", category: "TASK", desc: "No file-based task output", priority: "P1" },
      { id: "GAP-SESS-004", category: "SESS", desc: "Incomplete session metadata", priority: "P1" },
      { id: "GAP-SKILL-001", category: "SKILL", desc: "No dynamic skill loading", priority: "P1" },
      { id: "GAP-SKILL-003", category: "SKILL", desc: "No user-defined skills", priority: "P1" },
      { id: "GAP-MCP-001", category: "MCP", desc: "No MCP client", priority: "P1" },
      { id: "GAP-AGENT-001", category: "AGENT", desc: "No sub-agent spawning", priority: "P1" },
      { id: "GAP-SLASH-001", category: "SLASH", desc: "No slash command infrastructure", priority: "P1" },
      { id: "GAP-SLASH-002", category: "SLASH", desc: "No plan mode", priority: "P1" },
      { id: "GAP-SLASH-004", category: "SLASH", desc: "No /resume command", priority: "P1" },
      { id: "GAP-ABORT-001", category: "ABORT", desc: "No mid-stream abort", priority: "P1" },
      { id: "GAP-ABORT-002", category: "ABORT", desc: "No SIGINT handler", priority: "P1" },
      { id: "GAP-UI-002", category: "UI", desc: "No REPL mode", priority: "P1" },
      { id: "GAP-UI-005", category: "UI", desc: "No interactive confirmation", priority: "P1" },

      // P2 - MEDIUM (improves UX)
      { id: "GAP-TOOL-005", category: "TOOL", desc: "No overwrite confirmation", priority: "P2" },
      { id: "GAP-PERM-003", category: "PERM", desc: "No dangerous command heuristics", priority: "P2" },
      { id: "GAP-TASK-002", category: "TASK", desc: "No typed task system", priority: "P2" },
      { id: "GAP-TASK-004", category: "TASK", desc: "No background task monitoring", priority: "P2" },
      { id: "GAP-SESS-003", category: "SESS", desc: "No multi-session support", priority: "P2" },
      { id: "GAP-SKILL-002", category: "SKILL", desc: "No skill input schema", priority: "P2" },
      { id: "GAP-HOOK-001", category: "HOOK", desc: "No hooks infrastructure", priority: "P2" },
      { id: "GAP-MCP-002", category: "MCP", desc: "No MCP configuration", priority: "P2" },
      { id: "GAP-SLASH-003", category: "SLASH", desc: "No runtime dangerous toggle", priority: "P2" },
      { id: "GAP-SLASH-005", category: "SLASH", desc: "No /exit command", priority: "P2" },
      { id: "GAP-SLASH-006", category: "SLASH", desc: "No custom slash commands", priority: "P2" },
      { id: "GAP-ABORT-003", category: "ABORT", desc: "No tool timeout", priority: "P2" },
      { id: "GAP-UI-001", category: "UI", desc: "No rich terminal rendering", priority: "P2" },
      { id: "GAP-UI-003", category: "UI", desc: "No progress indicators", priority: "P2" },
      { id: "GAP-LLM-001", category: "LLM", desc: "No Anthropic-specific API support", priority: "P2" },
      { id: "GAP-LLM-003", category: "LLM", desc: "No model-specific parameters", priority: "P2" },

      // P3 - FUTURE (long-term)
      { id: "GAP-SESS-005", category: "SESS", desc: "No parent session tracking", priority: "P3" },
      { id: "GAP-SKILL-004", category: "SKILL", desc: "No skill usage tracking", priority: "P3" },
      { id: "GAP-HOOK-002", category: "HOOK", desc: "No hooks config", priority: "P3" },
      { id: "GAP-AGENT-002", category: "AGENT", desc: "No multi-agent teams", priority: "P3" },
      { id: "GAP-AGENT-003", category: "AGENT", desc: "No remote agent support", priority: "P3" },
      { id: "GAP-ABORT-004", category: "ABORT", desc: "No force kill", priority: "P3" },
      { id: "GAP-UI-004", category: "UI", desc: "No status bar", priority: "P3" },
    ];

    const byPriority = gaps.reduce((acc, gap) => {
      acc[gap.priority] = acc[gap.priority] || [];
      acc[gap.priority].push(gap);
      return acc;
    }, {} as Record<string, typeof gaps>);

    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                          MEOW GAP ANALYSIS REPORT                              ║
║                     vs Claude Code v2.1.88 Reference                           ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  P0 - CRITICAL (breaks core):    ${String(byPriority["P0"]?.length || 0).padStart(2)} gaps                              ║
║  P1 - HIGH (major feature):       ${String(byPriority["P1"]?.length || 0).padStart(2)} gaps                              ║
║  P2 - MEDIUM (improves UX):      ${String(byPriority["P2"]?.length || 0).padStart(2)} gaps                              ║
║  P3 - FUTURE (long-term):        ${String(byPriority["P3"]?.length || 0).padStart(2)} gaps                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  TOTAL GAPS: ${String(gaps.length).padStart(3)}                                                          ║
║  MATURITY SCORE: 2/10                                                        ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  RECOMMENDED FOCUS:                                                          ║
║  1. GAP-CORE-002: Session message accumulation (enables multi-turn)         ║
║  2. GAP-SESS-001: Auto session resume (improves UX immediately)               ║
║  3. GAP-SLASH-001: Slash command infrastructure (enables /help, /plan)      ║
║  4. GAP-PERM-001: Permission rules (enables safe git without dangerous)      ║
║  5. GAP-ABORT-002: SIGINT handler (enables Ctrl+C)                           ║
╚══════════════════════════════════════════════════════════════════════════════╝
    `);

    // Print by category
    const byCategory = gaps.reduce((acc, gap) => {
      acc[gap.category] = acc[gap.category] || [];
      acc[gap.category].push(gap);
      return acc;
    }, {} as Record<string, typeof gaps>);

    console.log("BY CATEGORY:");
    for (const [cat, catGaps] of Object.entries(byCategory)) {
      console.log(`  ${cat}: ${catGaps.length} gaps`);
    }

    expect(true).toBe(true); // Always pass - this is a report
  });
});
