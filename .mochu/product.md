# product.md — what this product IS

## What meow is

meow is the **exoskeleton for Claude Code** — not a coding agent. A Bun heartbeat
(`bin/meow.ts`) owns the session boundary: it births `claude -p` sessions with
motive + memory + state, enforces an exit contract at death, and guarantees rebirth.

## Users

- Solo developers wanting autonomous continuous improvement on a target repo
- Developer teams needing a disciplined autonomous agent loop
- AI researchers iterating on codebases overnight

## Jobs-to-be-done

1. Run autonomous code improvement against a target repo without constant supervision
2. Maintain state across Claude Code sessions (memory, budget, goals)
3. Enforce quality gates mechanically (no self-graded work)
4. Clean up legacy code systematically (thinning ratchet)

## Positioning

meow = Claude Code + persistent state + mechanical discipline. The value is
turning Claude Code from a stateless REPL into a persistent autonomous agent.

## Deploy URL

N/A — this is a local CLI tool, not a web product.

## Differentiators

- Built-in budget management (`.meow/budget.md`)
- Mechanical ship_gate.py (not self-graded)
- Thinning focus: removes legacy mass over time
- Second-brain integration (`.meow/brain.db`)
- Nine Lives architecture with explicit role separation (strategist/builder/verifier)

## Status (2026-06-11)

- W0 scaffold complete
- W1 (Prove the heartbeat) next — gap #1 "Heartbeat verifier suite"
- Legacy `src/` frozen, not yet branched to `legacy-swarm`
- 22911 non-core LOC baseline (ratchet: must go down)
- 1/1 verifiers green