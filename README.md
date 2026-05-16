# MEOW — Autonomous Multi-Agent Coding Harness

![](https://img.shields.io/badge/Node.js-18%2B-brightgreen?style=flat-square) [![npm]](https://www.npmjs.com/package/meow-agent)
![](https://img.shields.io/badge/License-MIT-green?style=flat-square)
![](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square)

**MEOW** (Meta-Orchestrator Operating on World) is a sovereign coding harness that runs locally in your terminal, coordinates specialist agents, and structural quality gates prevent hallucination from reaching output. Built on TypeScript and SQLite-vec.

**Learn more at [github.com/stancsz/meow](https://github.com/stancsz/meow)**

---

## Get Started

```bash
# Install
npm install -g meow-agent

# Run a task (headless — no TTY required)
meow -p "fix the stalled REPL in src/cli/repl.ts"

# Interactive REPL
meow

# Interactive TUI
meow --tui
```

Or clone and run:

```bash
git clone https://github.com/stancsz/meow.git
cd meow
npm install
npx tsx src/index.ts "your task here"
```

---

## What MEOW Does

```
Task arrives
    │
    ▼
L4 SPECIALIST (Claude Code / Aider) — implements
    │
    ▼
MISSION REVIEWER — scores output across 7 criteria
    │
    ├── score >= threshold ──► COMMIT
    │
    └── score < threshold ──► RETRY (with review notes)
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
              CONVERGENCE CHECK             STAGNATION CHECK
              ─ token budget?                ─ 2 iters no improvement?
              ─ max iters hit?              ─ diminishing returns?
                    │                             │
                    ▼                             ▼
               STOP / REPORT                   ADAPT / DECOMPOSE
```

MEOW does NOT grind until the user kills it. It evaluates whether continued iteration is productive and stops when it is not.

---

## Quality Gates

Every output passes through structural gates before it can be committed:

| Gate | Checks | Fail action |
|------|--------|-------------|
| `NO_MOCKS` | No `TODO`, `FIXME`, placeholder code | Retry with note |
| `TYPE_CHECK` | `tsc --noEmit` passes | Retry |
| `LINT_CLEAN` | ESLint reports 0 errors | Retry |
| `REAL_TESTS` | Test files exist and non-empty | Warn (non-fatal) |
| `MISSION_COMPLETE` | Goal keywords in output | Retry if missing |
| `SOP_COMPLIANCE` | Think-Plan-Verify in output | Retry if missing |

---

## Convergence Logic

MEOW stops iterating when:

- **Stagnation** — No score improvement for 2 consecutive iterations
- **Token budget exceeded** — Cumulative spend crosses threshold
- **Diminishing returns** — Score improvement falls below minimum delta

---

## Execution Modes

| Mode | Behavior |
|------|----------|
| `SEQUENTIAL` | One task at a time. Full review between each step. |
| `SHIP` | Pass through all specialists with final review only. |
| `PARALLEL` | Run independent tasks concurrently. |
| `AUDIT_ONLY` | Score existing output without executing. |

---

## Architecture

```
L1 LIAISON       — Human-facing. Receives tasks, escalates ambiguity.
L2 ARCHITECT     — Mid-layer planner. Breaks tasks, sequences dependencies.
L3 ORCHESTRATOR  — Execution coordinator. TaskQueue, convergence checks.
L4 SPECIALISTS   — Claude Code / Aider subprocesses.
```

**Key files:**

| File | Purpose |
|------|---------|
| `src/agent/agent.ts` | MEOW-3-RULE: 3-retry loop + fixMeow() |
| `src/agent/summoner.ts` | Spawns specialist agents as subprocesses |
| `src/agent/mission_reviewer.ts` | 7-criterion scoring, quality gates |
| `src/orchestrator/Orchestrator.ts` | Convergence checks, task dispatch |
| `src/kernel/kernel.ts` | Heartbeat loop, watchdog, respawn |
| `src/db/database.ts` | SQLite + sqlite-vec for persistence |

---

## MEOW-3-RULE

MEOW uses `meow -p` as the primary interface (not `claude -p`):

```
Task arrives → meow -p "task" (MEOW gets 3 retry attempts)
  ↓ fails × 3
claude -p "fix MEOW" (fixes MEOW's own code, NOT the task)
  ↓
User re-invokes same task → meow -p → succeeds
```

`claude -p` only runs when MEOW's own code/prompts/tools are broken. It patches MEOW, then MEOW retries and completes the task.

---

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | API key for LLM calls | (required) |
| `ANTHROPIC_BASE_URL` | LLM endpoint | MiniMax gateway |
| `ANTHROPIC_MODEL` | Model name | `claude-sonnet-4` |
| `MEOW_DB` | SQLite database path | `~/.meow/meow.db` |
| `MEOW_MODE` | Execution mode | `SEQUENTIAL` |

---

## Requirements

- Node.js 18+ (Bun is **NOT** supported — `better-sqlite3` native addons require Node)
- TypeScript 5.0+

---

## License

MIT — see [LICENSE](LICENSE)