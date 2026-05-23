# Meow-Swarm

A background coding harness that runs autonomous coding tasks while you sleep. You dispatch a task, it runs in the background, and you check back later via TUI or state files.

```
meow -p "fix the auth bug in src/auth.ts"
# → background task dispatched, check back later with `meow --tui`
```

## How it works

Meow-Swarm is a **background daemon** for coding tasks — think `nohup ./worker.sh &` but for AI coding agents:

1. **Dispatch** — Run `meow -p "your task"` and it immediately returns
2. **Work** — The swarm picks tasks from a queue, runs them, checkpoints progress to SQLite
3. **Monitor** — Watch progress via `meow --tui` (real-time dashboard) or `meow` (REPL)
4. **Recover** — Crashes and restarts don't lose work; interrupted tasks resume from the last checkpoint

## Quick start

```bash
# Install (Node.js 18+ required)
npm install -g meow-swarm

# Configure API key (MiniMax preferred, falls back to Anthropic)
export ANTHROPIC_API_KEY="sk-ant-..."

# Dispatch a task (runs in background)
meow -p "add user registration to the API"

# Monitor progress
meow --tui
```

## Architecture

```
meow -p "task"          # CLI entry → task queued in SQLite
       ↓
[L1 Liaison]            # Validates and decomposes task
       ↓
[L2 Architect]          # Breaks into subtasks, resolves dependencies
       ↓
[L3 SwarmManager]       # Spawns specialist agents (Claude Code subprocesses)
       ↓
[Sandbox Gate]          # Blocks dangerous shell commands (rm -rf, etc.)
       ↓
[Mission Reviewer]      # Scores result against 7 quality criteria
       ↓
[L4 Auditor]            # Final verification, checkpoints to SQLite
```

- **Specialist agents** are Claude Code subprocesses that work on subtasks
- **Checkpointing** means crashes are recoverable — tasks resume where they left off
- **Safety sandbox** blocks destructive operations before they run
- **Multi-agent coordination** via SQLite-backed task claims (no two agents work on the same task)

## Key features

- **Crash-safe** — SQLite checkpointing survives power failures and restarts
- **Process cleanup** — Stuck subprocesses are killed (Windows `taskkill /f /t`, POSIX `SIGKILL`)
- **Safety gates** — Dangerous shell commands blocked before execution
- **Recovery mode** — `meow --continue` replays stranded tasks on boot
- **TUI dashboard** — Real-time monitoring of agent status, token costs, and task progress

## Commands

| Command | Description |
|---------|-------------|
| `meow -p "task"` | Dispatch task (headless, returns immediately) |
| `meow` | Interactive REPL |
| `meow --tui` | Terminal dashboard |
| `meow --continue` | Resume stranded tasks after a crash |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | required | API key for the LLM |
| `ANTHROPIC_MODEL` | `claude-sonnet-4` | Model to use |
| `MEOW_DB` | `meow.db` | SQLite database path |
| `MEOW_MODE` | `SEQUENTIAL` | `SEQUENTIAL`, `PARALLEL`, or `SHIP` |

---

See `.env.example` for configuration options.