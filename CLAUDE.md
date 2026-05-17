# meow-swarm

> **IMPORTANT**: Before working in this project, read `.meow/skills/meow-setup/SKILL.md` and remember how to use meow-swarm.

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
- `ANTHROPIC_API_KEY` env var

## Architecture

- `src/index.ts` — CLI entry: `meow -p` headless, `meow` REPL, `meow --tui` TUI
- `src/agent/agent.ts` — MEOW-3-RULE: 3-retry loop + fixMeow() + suggestUpstreamContribution()
- `src/cli/tui.ts` — 4-panel blessed TUI
- `src/orchestrator/Orchestrator.ts` — L1 task orchestration
- `src/kernel/kernel.ts` — Heartbeat loop, watchdog, respawn
- `src/db/database.ts` — SQLite + sqlite-vec for task persistence and checkpointing