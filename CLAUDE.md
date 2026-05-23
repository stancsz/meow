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
- LLM provider env vars — **preferred: MiniMax** (falls back to Anthropic):

```bash
# Preferred — MiniMax (set in system env)
export LLM_API_KEY=$MINIMAX_API_KEY
export LLM_BASE_URL=$MINIMAX_BASE_URL
export MEOW_MODEL="MiniMax-M1"

# Fallback — Anthropic
export LLM_API_KEY=$ANTHROPIC_API_KEY
# LLM_BASE_URL defaults to https://api.anthropic.com
```

`src/config/env.ts` reads `LLM_API_KEY` and `LLM_BASE_URL` first, then falls back to `ANTHROPIC_API_KEY`. Never hardcode keys.

## Architecture

- `src/index.ts` — CLI entry: `meow -p` headless, `meow` REPL, `meow --tui` TUI
- `src/agent/agent.ts` — MEOW-3-RULE: 3-retry loop + fixMeow() + suggestUpstreamContribution()
- `src/cli/tui.ts` — 4-panel blessed TUI
- `src/orchestrator/Orchestrator.ts` — L1 task orchestration
- `src/kernel/kernel.ts` — Heartbeat loop, watchdog, respawn
- `src/kernel/database.ts` — SQLite + sqlite-vec for task persistence and checkpointing

## Agent loop

to run meow as a continuous self-improving loop, follow `docs/loop.md`. the loop:
1. checks env vars (MiniMax first)
2. reads `docs/STATUS.md` — picks the top open bug or roadmap item
3. runs live tests, does the work, commits
4. uses `meow -p` to find the next item
5. never stops — decisions are logged in `docs/loop-decisions.md`

**docs reading rule**: only read `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/loop.md`, and `docs/loop-decisions.md` unless a specific task requires something from `docs/rfc/`. Never read `docs/archive/`. Do not browse or read the docs folder beyond these files.