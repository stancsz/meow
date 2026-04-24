# Kernel Audit: Meow vs Claude Code

**Reference:** Claude Code v2.1.88
**Source:** `agent-kernel/tests/gaps.test.ts`
**Run with:** `bun test agent-kernel/tests/gaps.test.ts`

---

## Capability Categories Validated

The test suite validates 13 subsystems, each tracking a distinct runtime capability:

| Category | What It Covers |
|---|---|
| **CORE** | Streaming, message accumulation, budget tracking |
| **TOOL** | Edit tool, input validation, result/file size limits, overwrite confirmation |
| **PERM** | Pattern-matching rules, interactive prompts, dangerous command heuristics |
| **TASK** | Kill/lifecycle, typed tasks, file-based output, background monitoring |
| **SESS** | Auto resume, compaction, multi-session, metadata, parent tracking |
| **SKILL** | Dynamic loading, input schema, user-defined skills, usage tracking |
| **HOOK** | Hooks infrastructure, hooks configuration |
| **MCP** | MCP client, MCP configuration file |
| **AGENT** | Sub-agent spawning, multi-agent teams, remote agent support |
| **SLASH** | Slash command parser, plan mode, runtime toggles, custom commands |
| **ABORT** | Mid-stream abort, SIGINT handling, tool timeouts, force kill |
| **UI** | Rich rendering, REPL mode, progress indicators, status bar, confirmation |
| **LLM** | Anthropic API headers, response streaming, model-specific params |

Each gap has an ID (`GAP-{CATEGORY}-{NUMBER}`) and one of four priorities:

| Priority | Meaning |
|---|---|
| P0 | Must have — breaks core functionality |
| P1 | Should have — missing major feature |
| P2 | Nice to have — improves UX |
| P3 | Future — long-term enhancement |

---

## Top Gaps Identified

### P0 — Critical (6 gaps)

| ID | Gap | Impact |
|---|---|---|
| GAP-CORE-001 | No async generator streaming | Real-time token display broken; tested as **IMPLEMENTED** via `runLeanAgentStream` + `generateStream` |
| GAP-CORE-002 | No multi-turn message accumulation | Conversation history drops after first turn; tested as **IMPLEMENTED** via `messages` option |
| GAP-PERM-001 | No pattern-matching permission rules | `--dangerous` is all-or-nothing; can't allow safe `git` without permitting all shell |
| GAP-SESS-001 | No auto session resume | Tested as **IMPLEMENTED** via `resume`/`lastSession`/`autoResume` in session-store |
| GAP-SESS-002 | No session compaction | Tested as **IMPLEMENTED** via `compact`/`summarize` in session-store |
| GAP-LLM-002 | No LLM response streaming | Tested as **IMPLEMENTED** via `stream: true` + `generateStream` |

> Despite being IMPLEMENTED, these six still appear in the test's summary array at the bottom of the file — the gap tracking is the source of truth for the gap count regardless of test outcome.

### P1 — High (21 gaps)

| ID | Gap |
|---|---|
| GAP-CORE-003 | No budget tracking — IMPLEMENTED (`maxBudgetUSD`, `totalCost`) |
| GAP-TOOL-001 | No Edit tool — only full-file write |
| GAP-TOOL-002 | No tool input validation |
| GAP-TOOL-003 | No tool result size limit |
| GAP-TOOL-004 | No file read size limit |
| GAP-PERM-002 | No interactive permission prompts |
| GAP-TASK-001 | No task kill support |
| GAP-TASK-003 | No file-based task output |
| GAP-SESS-004 | Incomplete session metadata (no cost/token tracking) |
| GAP-SKILL-001 | No dynamic skill loading |
| GAP-SKILL-003 | No user-defined skills |
| GAP-MCP-001 | No MCP client |
| GAP-AGENT-001 | No sub-agent spawning |
| GAP-SLASH-001 | No slash command infrastructure |
| GAP-SLASH-002 | No plan mode |
| GAP-SLASH-004 | No `/resume` command |
| GAP-ABORT-001 | Mid-stream abort — IMPLEMENTED (`generateStream` + `abort` signal) |
| GAP-ABORT-002 | No SIGINT handler — Ctrl+C doesn't work gracefully |
| GAP-UI-002 | No REPL mode — single-shot only |
| GAP-UI-005 | No interactive confirmation |

### P2 — Medium (16 gaps)

| ID | Gap |
|---|---|
| GAP-TOOL-005 | No overwrite confirmation — silent data loss risk |
| GAP-PERM-003 | No dangerous command heuristics |
| GAP-TASK-002 | No typed task system |
| GAP-TASK-004 | No background task monitoring |
| GAP-SESS-003 | No multi-session support |
| GAP-SKILL-002 | No skill input schema |
| GAP-HOOK-001 | No hooks infrastructure |
| GAP-MCP-002 | No MCP configuration file |
| GAP-SLASH-003 | No runtime dangerous toggle |
| GAP-SLASH-005 | No `/exit` command — Ctrl+C only |
| GAP-SLASH-006 | No custom slash commands |
| GAP-ABORT-003 | Tool timeout — IMPLEMENTED (`timeoutMs` via `ToolContext`) |
| GAP-UI-001 | No rich terminal rendering |
| GAP-UI-003 | No progress indicators |
| GAP-LLM-001 | Anthropic API headers — IMPLEMENTED (`anthropic-version`) |
| GAP-LLM-003 | No model-specific parameter mapping |

### P3 — Future (6 gaps)

| ID | Gap |
|---|---|
| GAP-SESS-005 | No parent session tracking |
| GAP-SKILL-004 | No skill usage tracking |
| GAP-HOOK-002 | No hooks configuration |
| GAP-AGENT-002 | No multi-agent teams |
| GAP-AGENT-003 | No remote agent support |
| GAP-ABORT-004 | No force kill |
| GAP-UI-004 | No status bar |

---

## Aggregate Count

| Priority | Count |
|---|---|
| P0 | 6 |
| P1 | 21 |
| P2 | 16 |
| P3 | 6 |
| **Total** | **49** |

---

## Gaps by Category

| Category | Count |
|---|---|
| ABORT | 4 |
| AGENT | 3 |
| CORE | 3 |
| HOOK | 2 |
| LLM | 3 |
| MCP | 2 |
| PERM | 3 |
| SESS | 5 |
| SKILL | 4 |
| SLASH | 6 |
| TASK | 4 |
| TOOL | 5 |
| UI | 5 |
| **Total** | **49** |

---

## Already Implemented (verified by test assertions)

| ID | Feature | Evidence |
|---|---|---|
| GAP-CORE-001 | Async generator streaming | `runLeanAgentStream`, `generateStream`, `stream: true` in `lean-agent.ts` |
| GAP-CORE-002 | Multi-turn message accumulation | `messages?: any[]` + `options.messages` in `LeanAgentOptions` |
| GAP-CORE-003 | Budget tracking | `maxBudgetUSD` / `budget` / `totalCost` in `lean-agent.ts` |
| GAP-SESS-001 | Auto session resume | `resume` / `lastSession` / `autoResume` in `session-store.ts` |
| GAP-SESS-002 | Session compaction | `compact` / `summarize` / `truncate` in `session-store.ts` |
| GAP-ABORT-001 | Mid-stream abort | `generateStream` + `abort` signal in streaming loop |
| GAP-ABORT-003 | Tool timeout | `timeoutMs` per call via `ToolContext` |
| GAP-LLM-001 | Anthropic API headers | `anthropic-version` / `anthropic` in `lean-agent.ts` |
| GAP-LLM-002 | LLM response streaming | `stream: true` + `generateStream` in `lean-agent.ts` |

---

## Recommended Priority Order

1. **GAP-PERM-001** — Permission rules: enables regex `alwaysAllow`/`alwaysDeny` so safe git commands work without `--dangerous`
2. **GAP-ABORT-002** — SIGINT handler: enables graceful Ctrl+C interrupt
3. **GAP-UI-002** — REPL mode: replaces single-shot with interactive session loop
4. **GAP-SLASH-001 + GAP-SLASH-002** — Slash command infra + plan mode: enables `/help`, `/plan`, `/resume`
5. **GAP-TOOL-001** — Edit tool: enables targeted in-place file changes without full rewrite
6. **GAP-MCP-001** — MCP client: unlocks 40+ external service integrations (filesystem, git, etc.)
7. **GAP-TASK-001** — Task kill: enables cancelling long-running operations
8. **GAP-SKILL-001** — Dynamic skill loading: enables user extensibility via `.skills/`
