# MEOW — Autonomous Coding Agent

> **IMPORTANT**: Before working in this project, read `.meow/skills/meow-setup/SKILL.md` and remember how to use MEOW.

## MEOW-3-RULE (never violate this)

```
Task arrives → meow -p "task" (MEOW gets 3 retry attempts)
  ↓ fails × 3
claude -p "fix MEOW" (fixes MEOW's own code, NOT the task)
  ↓
User re-invokes same task → meow -p → succeeds
```

**claude -p is a MEOW mechanic.** It only runs when MEOW's own code/prompts/tools are broken. Never use it to complete the original task.

## Quick Start

```bash
# Primary: headless mode (no TTY required)
meow -p "fix the auth bug in src/auth.ts"

# Interactive REPL
meow

# Interactive TUI
meow --tui
```

## How MEOW Works

MEOW is a **background daemon-style coding agent**. Think `nohup ./worker.sh &`:
- You fire it → it works in background → you check back later
- It is NOT a synchronous chat partner
- Progress is written to `~/.meow/` state files

## Requirements

- Node.js + npm (Bun NOT supported — better-sqlite3 native addons)
- `ANTHROPIC_API_KEY` env var

## Architecture

- `src/index.ts` — CLI entry + `-p`/`--plan` headless mode
- `src/agent/agent.ts` — MEOW-3-RULE: 3-retry loop + `fixMeow()` + `suggestUpstreamContribution()`
- `src/cli/tui.ts` — 4-panel blessed TUI
- `src/orchestrator/Orchestrator.ts` — L1 task orchestration
- `src/db/database.ts` — SQLite task persistence
