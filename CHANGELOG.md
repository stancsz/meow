# Changelog

All notable changes to MEOW will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
