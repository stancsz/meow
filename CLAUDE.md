# meow

> **REPIVOT (2026-06-11) — read `docs/HANDOFF.md` FIRST.** meow is now the Nine
> Lives exoskeleton for Claude Code (`docs/rfc/nine-lives.md` body + `docs/rfc/yugong-harness-design.md` mind).
> The skill is `skills/meow/SKILL.md`; the heartbeat is `bin/meow.ts`; the cleanup
> plan is `docs/MIGRATION.md`. Everything below this banner describes the FROZEN
> legacy system (`src/`, kept only until the MIGRATION waves delete it) — consult
> it only when working inside legacy code, and never extend that code.

---

# meow — Nine Lives Harness (current)

## Core Interface

```bash
# Run a life cycle (birth → phase → exit contract → rebirth)
bun bin/meow.ts birth

# Run specific number of lives
bun bin/meow.ts birth --lives 3

# Schedule the heartbeat
bun bin/meow.ts schedule
```

## Architecture

- `bin/meow.ts` — Heartbeat entry point: schedule, birth, phase dispatch, exit contract, rebirth
- `scripts/` — Governor scripts: `run_corpus.py` (verifier corpus), `ship_gate.py` (pre-commit gate), `schedule.py`, `select_gap.py`, `compact.py`, `budget.py`, `audit_verifiers.py`
- `skills/meow/` — Role skills: `SKILL.md` + `roles/` (builder, planner, etc.)
- `.meow/` — State directory: `ledger.md`, `brain.db`, `verifiers/`, `goals.md`, `gaps.md`, `campaign.md`, `budget.md`, `playbook.md`
- `.mochu/` — Product iteration state: `gaps.md`, `competitors.md`, `product.md`, `RELEASE.md`, `verifiers/`

## Nine Lives Lifecycle

1. **Schedule** — heartbeat triggers on cron/schedule
2. **Birth** — assemble context from PROBLEM.md, gaps.md, ledger, brain
3. **Phase** — execute role:phase (e.g., `builder:execute`, `planner:plan`)
4. **Exit contract** — gates green, ledger appended, brain distilled, WIP serialized
5. **Rebirth** — next life begins

## Requirements

- Bun (TypeScript runtime)
- Python 3 (for governor scripts)
- Anthropic API key: set `ANTHROPIC_API_KEY` env var

## Verifiers

Verifiers live in `.meow/verifiers/` and `.mochu/verifiers/`. Run the corpus:

```bash
python3 scripts/run_corpus.py
```

## Ship Gate

Pre-commit gate must pass before committing:

```bash
python3 scripts/ship_gate.py
```

---

# meow-swarm (LEGACY — frozen)

> **For autonomous agent loops**: the old procedure was `docs/legacy/loop.md`; the current one is the Nine Lives life-cycle (`docs/rfc/nine-lives.md` §4.5).

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

Set credentials and model in `.env` (copy from `.env.example`). Never hardcode keys or model names.

## Architecture

- `src/index.ts` — CLI entry: `meow -p` headless, `meow` REPL, `meow --tui` TUI
- `src/agent/agent.ts` — MEOW-3-RULE: 3-retry loop + fixMeow() + suggestUpstreamContribution()
- `src/cli/tui.ts` — 4-panel blessed TUI
- `src/orchestrator/Orchestrator.ts` — L1 task orchestration
- `src/kernel/kernel.ts` — Heartbeat loop, watchdog, respawn
- `src/kernel/database.ts` — SQLite + sqlite-vec for task persistence and checkpointing

## Agent loop

to run meow as a continuous self-improving loop, follow `docs/legacy/loop.md`. the loop:
1. checks env vars (Anthropic first)
2. reads `docs/STATUS.md` — picks the top open bug or roadmap item
3. runs live tests, does the work, commits
4. uses `meow -p` to find the next item
5. never stops — decisions are logged in `docs/legacy/loop-decisions.md`

**docs reading rule**: only read `docs/STATUS.md`, `docs/legacy/ROADMAP.md`, `docs/legacy/loop.md`, and `docs/legacy/loop-decisions.md` unless a specific task requires something from `docs/legacy/rfc/`. Never read `docs/legacy/legacy-archive/`. Do not browse or read the docs folder beyond these files.

## Known Failure Modes — Read Before Touching Docs or Files

### Duplicate roadmap drift (HIGH RISK)

`docs/STATUS.md` and `docs/legacy/ROADMAP.md` both list the same bugs. They are intentionally separate — STATUS.md is the live ground truth (prose, root causes, current phase), ROADMAP.md is the historical wave plan (checkboxes, CLI reference). **When you close a bug or unimplemented item, you MUST update both:**

1. `docs/STATUS.md` — move the bug out of "Open Bugs" into "Completed"
2. `docs/legacy/ROADMAP.md` — check the `- [ ]` checkbox to `- [x]`

If only one is updated, the other becomes stale and future agents will re-work already-closed items. Also check `docs/legacy/rfc/architectural-decisions.md` — it has a gap status table that must be kept consistent with STATUS.md.

**Trust order when docs contradict:** STATUS.md > ROADMAP.md > everything else.

### Write verification (HIGH RISK)

A confirmed failure mode (see `docs/legacy/FEEDBACK.md`): `meow -p` tasks have completed, reported success, and written a file — but the file on disk contained only a stub title line with no body content.

**Rule: after any significant `write` or file creation, immediately read the file back and verify it is not a stub.** If the read returns fewer than 10 lines for a document that should have content, treat it as a failed write and retry. Do not commit until verified.
