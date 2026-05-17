# meow-swarm

**The problem:** You want an AI coding agent that runs autonomously — not a chat window you babysit, but a background worker that accepts a task, runs to completion, and reports back. While you sleep. While you work on something else. In CI.

**The solution:** `meow -p "task"` dispatches a self-healing, quality-gated coding agent into the background. It checkpoints every step to SQLite, retries on failure, stops when it's stuck, and surfaces everything in a TUI dashboard.

```bash
npm install -g meow-swarm
meow -p "refactor auth into its own service"
```

---

## Install

**Requires:** Node.js 18+ · `ANTHROPIC_API_KEY` env var set

```bash
npm install -g meow-swarm
export ANTHROPIC_API_KEY=sk-ant-...   # or set in shell profile

# Primary: headless (no TTY required) — designed for scripts, CI, or background dispatch
meow -p "fix the race condition in src/queue.ts"

# Interactive TUI dashboard
meow --tui

# Interactive REPL
meow
```

Bun is not supported. `better-sqlite3` requires Node.js native addons.

---

## What it actually does

```
you → meow -p "task" → background → checkpoint → quality gate → done
                                    ↓ stuck?
                              retry / adapt / stop + report
```

1. **Receives a task** via `meow -p` (headless, no TTY) or `meow` (interactive REPL)
2. **Dispatches to L4 specialist** (Claude Code subprocess)
3. **Mission reviewer scores output** across 7 criteria
4. **Quality gate** — if output fails, it retries with reviewer notes
5. **Convergence check** — stops if stagnating, budget exceeded, or diminishing returns
6. **Checkpoints state** to SQLite after every iteration — crash-safe
7. **TUI dashboard** shows live task progress, queue, and history

---

## Self-healing: the MEOW-3-RULE

When `meow -p` fails 3 times, it doesn't just give up. It surfaces a diagnostic:

```
Task arrives → meow -p "task"   (3 retry attempts)
  ↓ fails × 3
claude -p "fix meow-swarm"       (repairs meow-swarm's own code, NOT the task)
  ↓
you re-run → meow -p "task"     (now succeeds)
```

`claude -p` only fires when meow-swarm's own code/prompts are broken. It fixes meow-swarm, then you re-dispatch the original task. This is the operator loop — you never fix tasks manually.

---

## Quality gates

Every output is scored before it can be marked complete:

| Gate | Checks | On fail |
|------|--------|---------|
| `NO_MOCKS` | No `TODO`, `FIXME`, placeholder code | Retry with note |
| `TYPE_CHECK` | `tsc --noEmit` passes | Retry |
| `LINT_CLEAN` | ESLint 0 errors | Retry |
| `MISSION_COMPLETE` | Goal keywords present in output | Retry |
| `SOP_COMPLIANCE` | Think-Plan-Verify pattern | Retry |

---

## Configuration

| Variable | Default | Notes |
|----------|---------|-------|
| `ANTHROPIC_API_KEY` | *(required)* | API key for LLM calls |
| `ANTHROPIC_BASE_URL` | *(not set)* | Override for custom LLM endpoints |
| `ANTHROPIC_MODEL` | `claude-sonnet-4` | Model name |
| `MEOW_DB` | `~/.meow/meow.db` | SQLite checkpoint store |
| `MEOW_MODE` | `SEQUENTIAL` | `SEQUENTIAL` · `PARALLEL` · `SHIP` · `AUDIT_ONLY` |

---

## Architecture

```
L1 LIAISON      — Receives tasks, escalates ambiguity to human
L2 ARCHITECT     — Breaks tasks, sequences dependencies
L3 ORCHESTRATOR  — Task queue, convergence checks, dispatch
L4 SPECIALISTS   — Claude Code subprocesses (can be swapped)
```

State is checkpointed to SQLite after every operation. If the process dies, the next invocation resumes from the last checkpoint.

---

## License

MIT