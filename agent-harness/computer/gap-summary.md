# Gap Summary: Meow vs Claude Code

This document summarizes the gap analysis from `agent-kernel/tests/gaps.test.ts`, which tracks specific differences between Meow and Claude Code v2.1.88.

## Priority Totals

| Priority | Count | Meaning |
|----------|-------|---------|
| P0       | 6     | Breaks core functionality |
| P1       | 21    | Missing major feature |
| P2       | 16    | Improves UX |
| P3       | 7     | Long-term enhancement |
| **Total**| **50**| |

Maturity score: **2/10**

---

## What Is Implemented (tests pass)

These gaps are already closed in Meow:

- **GAP-CORE-001** — Async generator streaming (`runLeanAgentStream`, `generateStream`, `stream: true`)
- **GAP-CORE-002** — Multi-turn message accumulation (`messages` option in `LeanAgentOptions`)
- **GAP-CORE-003** — Budget tracking (`maxBudgetUSD`, `totalCost`)
- **GAP-SESS-001** — Auto session resume
- **GAP-SESS-002** — Session compaction (summarization)
- **GAP-ABORT-001** — Mid-stream abort via `AbortController`
- **GAP-ABORT-003** — Tool timeout via `timeoutMs`
- **GAP-LLM-001** — Anthropic API headers (`anthropic-version`)
- **GAP-LLM-002** — LLM response streaming (`stream: true`, `generateStream`)

---

## P0 — Critical (6 gaps)

| ID | Category | Gap |
|----|----------|-----|
| GAP-CORE-001 | CORE | No streaming support |
| GAP-CORE-002 | CORE | No session message accumulation |
| GAP-PERM-001 | PERM | No pattern-matching permission rules (all-or-nothing `--dangerous` only) |
| GAP-SESS-001 | SESS | No auto session resume |
| GAP-SESS-002 | SESS | No session compaction |
| GAP-LLM-002 | LLM | No LLM response streaming |

---

## P1 — High (21 gaps)

**Tools:**
- No Edit tool (only full file write)
- No tool input validation (no `validateInput`, Zod, or schema)
- No tool result size limit (`maxResultSizeChars`)
- No file read size limit (`createReadStream` vs `readFileSync`)

**Permissions:**
- No interactive permission prompts (no `readline` confirmations)

**Tasks:**
- No task kill/lifecycle support (`kill()`, `abort()`)
- No file-based task output (all stdout held in memory)

**Session:**
- Incomplete session metadata (no `totalCost`, `model`, token tracking)

**Skills:**
- No dynamic skill loading from `.skills/`
- No user-defined/custom skills

**MCP:**
- No MCP client (stdio communication)

**Agent:**
- No sub-agent spawning (`AgentTool`)

**Slash Commands:**
- No slash command infrastructure
- No plan mode (`/plan`)
- No `/resume <id>` command

**Abort:**
- No mid-stream abort (partially addressed — streaming loop with abort signal)
- No SIGINT handler (Ctrl+C doesn't work gracefully)

**UI:**
- No REPL mode (single-shot only)
- No interactive confirmation (yes/no prompts)

---

## P2 — Medium (16 gaps)

- No overwrite confirmation before file write
- No dangerous command heuristic detection
- No typed task system (7 types vs single shell command)
- No background task monitoring
- No multi-session support
- No skill input schema (`inputSchema`)
- No hooks infrastructure
- No MCP configuration file
- No runtime dangerous toggle (`/dangerous`)
- No `/exit` command
- No custom slash commands
- No tool timeout (partially addressed — `timeoutMs` present)
- No rich terminal rendering (plain `console.log`)
- No progress indicators (spinner, progress bar)
- No Anthropic-specific API support (partially addressed — `anthropic-version` header)
- No model-specific parameter mapping

---

## P3 — Future (7 gaps)

- No parent session tracking (`parentSessionId`)
- No skill usage tracking (`invokedSkills`)
- No hooks config file
- No multi-agent teams
- No remote agent support
- No force kill (`SIGKILL`)
- No status bar

---

## Recommended Focus Order

1. **GAP-CORE-002** — Session message accumulation (enables multi-turn conversations)
2. **GAP-SESS-001** — Auto session resume (improves UX immediately)
3. **GAP-SLASH-001** — Slash command infrastructure (enables `/help`, `/plan`)
4. **GAP-PERM-001** — Permission rules (enables safe git without full `--dangerous`)
5. **GAP-ABORT-002** — SIGINT handler (enables graceful Ctrl+C)

---

## By Category

| Category | Gaps |
|----------|------|
| CORE     | 3    |
| TOOL     | 5    |
| PERM     | 3    |
| TASK     | 4    |
| SESS     | 5    |
| SKILL    | 4    |
| HOOK     | 2    |
| MCP      | 2    |
| AGENT    | 3    |
| SLASH    | 6    |
| ABORT    | 4    |
| UI       | 5    |
| LLM      | 3    |
