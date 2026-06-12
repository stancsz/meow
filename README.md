# meow — Nine Lives Exoskeleton for Claude Code

> One sentence: meow turns Claude Code from a brilliant stateless tool into a persistent, self-improving agent by owning the session boundary — birth, exit contract, rebirth.

```
bun bin/meow.ts -p "fix the auth bug in src/auth.ts"
# → dispatched. the cat lives until the work is done.
```

**What it is:** A Bun heartbeat owns session boundaries. A Python governor enforces mechanical gates. Markdown roles provide judgment. Everything is verified before it ships.

**What it is not:** A coding agent. Meow does not write code directly — it births Claude Code sessions with motive, memory, and discipline, then enforces the exit contract before the next life begins.

---

## Quick start

```bash
# Prerequisites: Bun + Python 3
bun bin/meow.ts birth          # debug: print birth prompt, spawn nothing
bun bin/meow.ts -p "your task" # one life
bun bin/meow.ts live           # loop (default 9 lives, budget-capped)

# Governor (run independently)
python3 scripts/run_corpus.py  # all verifiers
python3 scripts/ship_gate.py  # pre-commit gate
python3 scripts/schedule.py   # who runs next
```

---

## The nine lives model

Every session is a **life** with a beginning, a middle, and an end. The heartbeat guarantees the next life exists and arrives properly equipped.

```
birth → [role:phase] → exit contract → rebirth
```

| Concept | What it means |
|---|---|
| **Birth** | Assembles context: PROBLEM.md, ledger, gaps, brain — then spawns `claude -p` |
| **Exit contract** | Ledger entry, brain distill, WIP to `.meow/tasks/`, ship_gate PASS |
| **Rebirth** | Next life begins with the previous one's learnings |

The loop continues until budget is exhausted or the problem is solved.

---

## Architecture

```
bin/meow.ts         — Heartbeat (Bun). Session boundary, birth, respawn.
                      209 LOC. Does not make judgments.

scripts/
  run_corpus.py     — The ratchet. Every verifier, deterministically.
  ship_gate.py      — Pre-commit gate. FAIL is final.
  schedule.py       — Who runs next (role:phase), from state.
  budget.py         — Survive-first limits.

skills/meow/
  SKILL.md          — The mind: roles, phases, iteration discipline.
  roles/            — Builder, Planner, Verifier (markdown, loaded by Claude Code).

.meow/              — State: ledger, brain.db, verifiers/, tasks/, goals.md
.mochu/             — Product iteration: gaps.md, competitors.md, RELEASE.md
```

The gap: **code lives in the shell, not in the agent.** The agent gets born, does the work, dies, and the shell handles everything that must hold regardless of how smart the model is.

---

## Verification system

Every claim has a verifier. Every verifier is run on every commit. The corpus is the ground truth.

```
30 verifiers (29 green, 2 skipped)
  v0001-v0002   — scaffold and one-life E2E
  v001-1 to v001-5 — heartbeat suite (spawn, @file, stub read-back, exit contract)
  v003-1 to v003-4 — legacy freeze (branch, swarm deleted, deps stripped)
  v006-1 to v006-4 — thinning ratchet (baseline, ratchet active, LOC count)
  v008-1 to v008-4 — W3: agent/orchestrator/kernel/cli deleted
  v009-1 to v009-4 — W4: perimeter artifacts trimmed
  v010-1 to v010-5 — W5: src/ is empty

python3 scripts/run_corpus.py   # all green or it doesn't ship
python3 scripts/ship_gate.py   # tamper check + secret scan + thinning ratchet
```

The verifier corpus is a **ratchet** — it only grows. Past wins are structurally protected from regressions. A verifier written after the work inherits the work's blind spots, so verifiers are authored **before** implementation.

---

## The rules

1. **One life = one role doing one phase.** Then die well.
2. **Grader ≠ builder.** Verifier never reads the builder's narrative.
3. **Mechanics over prose.** `ship_gate.py` FAIL is final.
4. **Two-lane rule.** Reversible → act. Irreversible → `.meow/reviews/pending-*.md`.
5. **Read back every file you write.** Stub detection is in the gate.

---

## Dogfood

Meow used itself to migrate off its own legacy. Every deletion was verified. Every state file was updated. The migration ran as a mochu iteration loop.

```bash
bun bin/meow.ts -p "clean up the project"   # runs on current repo
bun bin/meow.ts -p "review this codebase"   # runs on any repo
```

---

## Design docs

- `docs/rfc/nine-lives.md` — body: mission, heartbeat, gates, brain, migration
- `docs/rfc/yugong-harness-design.md` — mind: four laws, eight phases, tri-role split
- `docs/HANDOFF.md` — read this first for context

---

## Version history

| Version | What changed |
|---|---|
| 1.0.0 | Nine Lives repivot. Legacy swarm deleted. Thin Bun heartbeat + Python governor + markdown roles. 30 verifiers. Meow dogfooded itself. |
| 0.4.0 | Last legacy version (full swarm substrate) |

---

## Requirements

- **Bun** (TypeScript runtime — heartbeat)
- **Python 3** (governor scripts — stdlib only, no deps)
- **Node.js 18+** (for Claude Code)
- `ANTHROPIC_API_KEY` env var (or set in `.env`)