# meow-swarm

> **IMPORTANT**: Before working in this project, read `.meow/skills/meow-setup/SKILL.md` and remember how to use meow-swarm.
> **For autonomous agent loops**: read `docs/loop.md` — it is the operating procedure for extended unattended runs.

## meow -p (the primary interface)

`meow -p` is how you dispatch tasks to meow-swarm. It is a background daemon harness — you fire it and come back later.

```bash
# Primary: headless mode (no TTY required) — use this
meow -p "fix the auth bug in src/auth.ts"

# Interactive REPL
meow

# Interactive TUI
meow --tui
```

## MEOW-3-RULE (never violate this)

```
Task arrives → meow -p "task" (meow-swarm gets 3 retry attempts)
  ↓ fails × 3
claude -p "fix meow-swarm" (fixes meow-swarm's own code, NOT the task)
  ↓
User re-invokes same task → meow -p → succeeds
```

**claude -p is a meow-swarm mechanic.** It only runs when meow-swarm's own code/prompts/tools are broken. Never use it to complete the original task.

## How meow-swarm Works

meow-swarm is a **background daemon-style coding harness**. Think `nohup ./worker.sh &`:
- You fire `meow -p` → it runs in background → check back later via TUI or state files
- It is NOT a synchronous chat partner
- Progress is written to `~/.meow/` state files
- Checkpointing persists every task state to SQLite

## Requirements

- Node.js 18+ (Bun NOT supported — better-sqlite3 native addons require Node.js)
- LLM provider env vars — **preferred: Anthropic**:

Set credentials and model in `.env` (copy from `.env.example`). `src/config/env.ts` reads `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, and `ANTHROPIC_MODEL` from the environment. Never hardcode keys or model names.

## Architecture

- `src/index.ts` — CLI entry: `meow -p` headless, `meow` REPL, `meow --tui` TUI
- `src/agent/agent.ts` — MEOW-3-RULE: 3-retry loop + fixMeow() + suggestUpstreamContribution()
- `src/cli/tui.ts` — 4-panel blessed TUI
- `src/orchestrator/Orchestrator.ts` — L1 task orchestration
- `src/kernel/kernel.ts` — Heartbeat loop, watchdog, respawn
- `src/kernel/database.ts` — SQLite + sqlite-vec for task persistence and checkpointing

## Agent loop

to run meow as a continuous self-improving loop, follow `docs/loop.md`. the loop:
1. checks env vars (Anthropic first)
2. reads `docs/STATUS.md` — picks the top open bug or roadmap item
3. runs live tests, does the work, commits
4. uses `meow -p` to find the next item
5. never stops — decisions are logged in `docs/loop-decisions.md`

**docs reading rule**: only read `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/loop.md`, and `docs/loop-decisions.md` unless a specific task requires something from `docs/rfc/`. Never read `docs/archive/`. Do not browse or read the docs folder beyond these files.

## Known Failure Modes — Read Before Touching Docs or Files

### Duplicate roadmap drift (HIGH RISK)

`docs/STATUS.md` and `docs/ROADMAP.md` both list the same bugs. They are intentionally separate — STATUS.md is the live ground truth (prose, root causes, current phase), ROADMAP.md is the historical wave plan (checkboxes, CLI reference). **When you close a bug or unimplemented item, you MUST update both:**

1. `docs/STATUS.md` — move the bug out of "Open Bugs" into "Completed"
2. `docs/ROADMAP.md` — check the `- [ ]` checkbox to `- [x]`

If only one is updated, the other becomes stale and future agents will re-work already-closed items. Also check `docs/rfc/architectural-decisions.md` — it has a gap status table that must be kept consistent with STATUS.md.

**Trust order when docs contradict:** STATUS.md > ROADMAP.md > everything else.

### Write verification (HIGH RISK)

A confirmed failure mode (see `docs/FEEDBACK.md`): `meow -p` tasks have completed, reported success, and written a file — but the file on disk contained only a stub title line with no body content.

**Rule: after any significant `write` or file creation, immediately read the file back and verify it is not a stub.** If the read returns fewer than 10 lines for a document that should have content, treat it as a failed write and retry. Do not commit until verified.

