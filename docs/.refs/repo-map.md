# Meow Repository Map

This is a top-level guide to the codebase. For CLI usage, see the README.

## Directory Overview

```
meow/
├── src/                  # Main source
├── tests/                 # Test suite (Vitest)
├── docs/                  # Project docs and RFCs
├── skills/                # meow-swarm skills
├── evals/                 # Evaluation harnesses
├── .context/              # Claude context files
└── .husky/                # Git hooks
```

## `src/` — Source Tree

```
src/
├── index.ts               # CLI entry: meow, meow -p, meow --tui, meow --continue
├── agent/
│   ├── agent.ts           # Core agent loop, retry logic, fixMeow fallback
│   ├── summoner.ts        # Dynamic specialist registration
│   └── security/          # PII redaction and output sanitization
├── architect/
│   └── index.ts           # L2 Architect: decomposes tasks into dependency DAGs
├── auditor/
│   └── index.ts           # L4 Auditor: post-execution contract verification
├── cli/
│   ├── repl.ts            # Interactive REPL shell
│   └── tui.ts             # Blessed terminal dashboard (4-panel)
├── config/
│   ├── env.ts             # Environment variable loading and fallback chain
│   └── model.ts            # Model schema definitions
├── extensions/
│   ├── database/           # sqlite-vec, HNSW vector store, caching
│   └── plugins/           # Dynamic manifest loader for external tools
├── kernel/
│   ├── kernel.ts          # Daemon lifecycle, heartbeat, watchdog, respawn
│   └── database.ts        # SQLite schema, checkpointing, strand reclamation
├── orchestrator/
│   ├── Orchestrator.ts     # L1 task queue and orchestration engine
│   ├── ParallelExecutor.ts# Worker pool, sandbox gates, process cleanup
│   ├── FileCoordinator.ts # Transaction-safe file lock manager
│   └── Task.ts            # Task definitions and pre-hoc validation
└── swarm/
    ├── consensus/         # Byzantine Raft consensus, node heartbeat pruning
    └── federation/        # Zero-trust WebSocket FedHub (server + client)
```

## `tests/` — Test Suite

```
tests/
├── unit/                  # Isolated module tests (Consensus, Kernel, HNSW, TUI)
├── integration/           # Multi-process swarm and WebSocket live task tests
└── fault-injection/       # Chaos tests: DB drops, lock pauses, timeouts
```

Run with `npx vitest run`.

## `docs/` — Project Docs

| File | Purpose |
|------|---------|
| `STATUS.md` | Current open bugs and blockers |
| `ROADMAP.md` | Project roadmap |
| `loop.md` | Operating procedure for autonomous agent loops |
| `loop-decisions.md` | Log of decisions made during autonomous runs |
| `rfc/` | Request for Comments — design proposals and decisions |
| `repo-map.md` | This file |

## `skills/` — meow-swarm Skills

Scripts and prompts used by meow-swarm agents. Each skill is self-contained with its own instructions and tools.

## `evals/` — Evaluation Harnesses

Test fixtures and evaluation scripts for measuring agent performance.

## Key Relationships

```
CLI entry (src/index.ts)
  ├── -p flag  →  kernel.ts (daemon bootstrap)  →  Orchestrator.ts
  ├── --tui    →  cli/tui.ts (blessed dashboard)
  ├── --continue → kernel.ts (strand reclamation on boot)
  └── REPL     →  cli/repl.ts

Orchestrator.ts
  ├── L1 Liaison   (task validation)
  ├── L2 Architect (decomposition into subtask DAG)
  ├── L3 SwarmManager (spawns specialist agents)
  │     └── ParallelExecutor.ts (sandbox gates, process cleanup)
  └── L4 Auditor   (contract verification, checkpointing)

Swarm federation (src/swarm/)
  ├── consensus/  — Raft Byzantine voting, heartbeat pruning
  └── federation/  — ed25519-signed WebSocket tunnels between peer swarms

Kernel + Database
  ├── kernel.ts    — heartbeat loop, watchdog, respawn logic
  └── database.ts  — SQLite checkpointing, strand reclamation on crash recovery
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | required | LLM API key |
| `ANTHROPIC_MODEL` | `claude-sonnet-4` | Model name |
| `ANTHROPIC_BASE_URL` | — | Optional custom API endpoint |
| `MEOW_DB` | `meow.db` | SQLite database path |
| `MEOW_MODE` | `SEQUENTIAL` | `SEQUENTIAL`, `PARALLEL`, or `SHIP` |

## Common Commands

```bash
# Run tests
npx vitest run

# Build (if any)
npm run build

# Type check
npm run typecheck
```