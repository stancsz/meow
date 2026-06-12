---
name: meow
description: meow — Nine Lives heartbeat for Claude Code. Run a life cycle (birth → phase → exit contract → rebirth), check status, review pending gates, or spawn a one-shot task. Trigger with "run meow", "one life", "grind the mountain", "meow status", "meow -p <task>", "meow live".
---

# meow — the heartbeat (Nine Lives exoskeleton)

A CLI harness that orchestrates Claude Code sessions as "lives" — each life is one role doing one phase. The heartbeat assembles context, spawns `claude -p`, enforces the exit contract via governor scripts, and decides rebirth.

## Driver

`.claude/skills/meow/driver.mjs` — wraps `bun bin/meow.ts`. All paths relative to repo root.

## Commands

| Command | What it does |
|---|---|
| `meow status` | Show PROBLEM, ledger tail, budget, next role:phase |
| `meow -p "<task>"` | One-shot: one life, one task, exit contract, death |
| `meow live [--lives N]` | Loop: rebirth until budget/review halt (default 9 lives) |
| `meow review` | Show pending human gates (the leash) |
| `meow birth` | Debug: print the birth prompt, spawn nothing |
| `meow mock` | Test: mocked end-to-end life (no real LLM) |

## Run a life cycle

```bash
bun bin/meow.ts -p "fix the auth bug in src/auth.ts"
```

## Check status

```bash
bun bin/meow.ts status
```

## Run the loop (9 lives default)

```bash
bun bin/meow.ts live
```

## Run N lives

```bash
bun bin/meow.ts live --lives 3
```

## Prerequisites

- Bun (TypeScript runtime) — `bun --version` should work
- Python 3 — `python3 --version` should work
- `ANTHROPIC_API_KEY` env var set

## Architecture

- `bin/meow.ts` — heartbeat entry point
- `scripts/` — governor scripts (budget.py, ship_gate.py, schedule.py)
- `skills/meow/` — role skills (dispatched per life)
- `.meow/` — state directory (ledger.md, brain.db, verifiers/, etc.)

## Exit contract

Every life must:
1. Append one entry to `.meow/ledger.md`
2. Distill to the brain via `brain_cli.py`
3. Serialize WIP to `.meow/tasks/`
4. Write `reviews/pending-*.md` for anything external/irreversible
5. Read back every file written — title-only stubs are failed writes

## Gotchas

- The heartbeat runs `ship_gate.py` after each life — FAIL from the gate is final. Do not edit the gate or verifiers to route around it.
- Budget check runs before every life unless `MEOW_SKIP_BUDGET=1`.
- `--dangerously-skip-permissions` is passed to `claude -p` — ensure `ANTHROPIC_API_KEY` is set or the spawn will fail silently.
