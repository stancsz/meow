# meow-swarm

![](https://img.shields.io/badge/npm-meow--swarm-blue?style=flat-square) ![](https://img.shields.io/badge/Node.js-18%2B-brightgreen?style=flat-square) ![](https://img.shields.io/badge/License-MIT-green?style=flat-square) ![](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square)

**`meow -p`** — the primary interface. Run autonomous coding agents in the background.

```
npm install -g meow-swarm
meow -p "fix the auth bug in src/auth.ts"
```

meow-swarm is a sovereign, stateful, multi-agent coding harness that runs locally in your terminal. It coordinates L1→L4 specialist agents, checkpoints every task state to SQLite, gates output quality before commit, and exposes a TUI dashboard. You fire it and come back later — it is not a synchronous chat partner.

---

## Get Started

```bash
# Primary: headless mode (no TTY required) — this is meow -p
meow -p "fix the stalled REPL in src/cli/repl.ts"

# Interactive REPL
meow

# Interactive TUI
meow --tui
```

**Requirements:** Node.js 18+, `ANTHROPIC_API_KEY` env var. Bun is not supported (better-sqlite3 requires Node.js native addons).

---

## What is meow-swarm?

A background daemon harness for autonomous coding agents. Think `nohup ./worker.sh &` — you dispatch a task, it runs in the background, you check the TUI or state files later.

```
Task arrives
    │
    ▼
L4 SPECIALIST (Claude Code) — implements
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

meow-swarm does NOT grind until the user kills it. It evaluates whether continued iteration is productive and stops when it is not.

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

meow-swarm stops iterating when:

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
| `src/index.ts` | CLI entry: `meow -p` for headless, `meow` for REPL, `meow --tui` for TUI |
| `src/agent/agent.ts` | MEOW-3-RULE: 3-retry loop + fixMeow() + suggestUpstreamContribution() |
| `src/agent/summoner.ts` | Spawns specialist agents as subprocesses |
| `src/agent/mission_reviewer.ts` | 7-criterion scoring, quality gates |
| `src/orchestrator/Orchestrator.ts` | Convergence checks, task dispatch |
| `src/kernel/kernel.ts` | Heartbeat loop, watchdog, respawn |
| `src/db/database.ts` | SQLite + sqlite-vec for persistence + checkpointing |

---

## meow -p (the primary interface)

`meow -p` is the primary headless interface — no TTY required, designed for calling from scripts, CI, or other AI agents:

```
meow -p "your task description"
```

The `-p` / `--plan` flag activates non-interactive mode. Task output goes to stdout. Progress goes to the TTY if available, otherwise to `~/.meow/` state files.

---

## MEOW-3-RULE

meow-swarm's self-repair loop:

```
Task arrives → meow -p "task" (meow-swarm gets 3 retry attempts)
  ↓ fails × 3
claude -p "fix meow-swarm" (fixes meow-swarm's own code, NOT the task)
  ↓
User re-invokes same task → meow -p → succeeds
```

`claude -p` only runs when meow-swarm's own code/prompts/tools are broken. It patches meow-swarm, then meow-swarm retries and completes the task.

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

## npm

```
npm install -g meow-swarm
https://www.npmjs.com/package/meow-swarm
```

---

## License

MIT — see [LICENSE](LICENSE)