# Changelog

All notable changes to MEOW will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.0.0] — 2026-06-11

### Changed

- **Nine Lives repivot.** meow is now the Nine Lives exoskeleton for Claude Code — not a coding agent. The legacy swarm substrate (17,372 LOC of TypeScript) has been deleted. The system is thin by design: Bun heartbeat (209 LOC), Python governor (stdlib), markdown roles.

### Removed

- `src/` — entirely deleted. Legacy agent/orchestrator/kernel/cli/swarm/mcp/eval/extensions/config/types/architect/auditor/liaison all gone. History preserved on `legacy-swarm` branch.
- Legacy deps: quantum-circuit, blessed, blessed-contrib, ws removed (19 → 5 deps).
- `dist/` build artifacts.
- 32 orphaned test files referencing deleted `src/`.
- `docs/legacy/` untracked from git.

### Added

- `bin/meow.ts` — Bun heartbeat: session boundary, birth, respawn loop.
- `scripts/` — Python governor: run_corpus.py, ship_gate.py, schedule.py, budget.py, compact.py, select_gap.py, audit_verifiers.py.
- `skills/meow/` — Markdown roles: SKILL.md + builder/planner/verifier roles.
- `scripts/loop.sh` — Outer mochu harness for unattended iteration.
- `.meow/verifiers/` — 30-verifier corpus (ratchet).
- `.mochu/` — Product iteration state: gaps, competitors, RELEASE criteria, ledger.
- Thinness ratchet: ship_gate enforces non_core_loc never exceeds baseline.json.

### Fixed

- ship_gate: v006-1_baseline_exists.py exempt from tamper check (migration-complete state accepts non_core_loc=0).
- ship_gate: v0002 mock mode no longer recurses (MEOW_SKIP_CORPUS=1 guard).
- Verifier SKIP verdicts handled correctly (exit 2, not treated as FAIL).

### Verified

- Meow dogfooded: 4 lives cleaned 28,813 lines of orphaned code from the project itself.
- E2E: meow -p ran a life on an external repo (C:\Users\stanc\Downloads\platform) — birth, execute, exit, ship_gate PASS.
- R7 validated: one life completed on external target repo with clean exit.
- 30/30 corpus green. SHIP: all gates green. Thinning ratchet monotone.

---

## [0.1.0] — 2024-05-16

### Added
- Initial release
- `meow -p` headless mode for background task execution
- MEOW-3-RULE: meow -p (3 retries) → claude -p fixes MEOW (never the task)
- 4-panel blessed TUI (`meow --tui`)
- Interactive REPL mode
- Multi-tier quality gates (NO_MOCKS, TYPE_CHECK, LINT_CLEAN, etc.)
- MissionReviewer: 7-criterion scoring
- Convergence logic (stagnation, token budget, diminishing returns)
- MeowKernel: heartbeat watchdog and respawn
- SQLite + sqlite-vec for persistent task memory
- Quantum memory for semantic recall (Grover-based)
- MCP client integration (40+ external services)
- L1-L4 orchestration architecture
- SWARM, SEQUENTIAL, PARALLEL, AUDIT_ONLY execution modes
- HumanSignoffManager for low-confidence decision escalation
- CLAUDE.md and .meow/skills/meow-setup/SKILL.md for Claude Code integration
