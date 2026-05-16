# MEOW — Multi-Agent Quality-First Harness

**ANGLE: Multi-agent long-running agent harness that stays on tasks and produces quality work**

Core thesis: Most agent frameworks optimize for speed. MEOW optimizes for quality — keeps working until the task is right, knows when to stop grinding tokens, never ships hallucinated code.

---

## What MEOW Is

MEOW (Meta Orchestrator Operating on World) is a **meta-orchestrator** for long-running quality tasks. It runs locally in your terminal, coordinates specialist agents, and structural gates prevent hallucination from reaching output. Built on TypeScript and SQLite-vec.

---

## The Problem

Most agent harnesses fan out and hope — specialists run, output gets assembled, but nobody verifies quality until a human notices. Long-running agents burn tokens on diminishing returns, grinding through the same task again and again without meaningful improvement. Hallucination slips through because there is no structural gate: no score, no threshold, no moment where the harness says "this is wrong" and retries. MEOW was built to close that gap.

---

## How It Works — Quality-First Loop

```
USER TASK
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
                                   ▼
                          L3 ORCHESTRATOR decides: retry, decompose, escalate
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

Convergence logic is built into the loop. MEOW does not grind until the user kills it. It evaluates whether continued iteration is productive and stops when it is not.

---

## Quality Gates

| Gate | What it checks | Fail action |
|------|----------------|-------------|
| `NO_MOCKS` | No `TODO`, `FIXME`, placeholder code in diff | Retry with note |
| `TYPE_CHECK` | `tsc --noEmit` passes | Retry |
| `LINT_CLEAN` | ESLint reports 0 errors | Retry |
| `REAL_TESTS` | Test files exist and are non-empty | Warn (non-fatal) |
| `NO_REFACTOR_BLOAT` | Diff does not touch unrelated files | Warn (non-fatal) |
| `MISSION_COMPLETE` | Goal keywords present in output | Retry if missing |
| `SOP_COMPLIANCE` | Think-Plan-Verify evidence in output | Retry if missing |

Mission fails if weighted score is below threshold. Each retry passes review notes back to the specialist.

---

## Convergence Logic

MEOW stops iterating when any of these conditions are true:

- **Stagnation**: No score improvement for 2 consecutive iterations
- **Token budget exceeded**: Cumulative token spend crosses threshold for this task
- **Diminishing returns**: Score improvement between iterations falls below minimum delta

Built into `SelfReviewRunner` and checked by the orchestrator at each loop exit.

---

## Execution Modes

| Mode | Behavior |
|------|----------|
| `SEQUENTIAL` | One task at a time. Full review between each step. |
| `SHIP` | Pass through all specialists with final review only. Used for trusted codebases. |
| `PARALLEL` | Run independent tasks concurrently. Each task gets its own review. |
| `AUDIT_ONLY` | No execution. Run MissionReviewer on existing output, report scores. |

---

## Multi-Agent Architecture

```
L1 LIAISON       — Human-facing layer. Receives tasks, escalates ambiguity, manages expectations.
                  HumanSignoffManager: gates on low-confidence decisions.

L2 ARCHITECT     — Mid-layer planner. Breaks tasks into subtasks, sequences dependencies.
                  TaskDecomposer, FileCoordinator.

L3 ORCHESTRATOR  — Execution coordinator. Manages TaskQueue, dispatches to L4 specialists,
                  runs convergence checks. SelfReviewRunner.

L4 SPECIALISTS   — Execute individual tasks. Claude Code subprocess, Aider subprocess.
                  Each runs once per task; retry is a new invocation with review context.
```

---

## File Tree

```
src/
├── index.ts                    # CLI entry, piped commands or REPL
├── auditor/
│   └── Auditor.ts              # Scores L4 output, gates on threshold
├── liaison/
│   ├── HumanSignoffManager.ts  # Escalation to human for low-confidence decisions
│   └── HumanSignoffManager.test.ts
├── orchestrator/
│   ├── Orchestrator.ts         # L3 coordinator, convergence checks
│   ├── ExecutionMode.ts        # SEQUENTIAL / SHIP / PARALLEL / AUDIT_ONLY
│   ├── FileCoordinator.ts     # Coordinates file access across specialists
│   ├── SelfReviewRunner.ts     # Runs convergence checks between iterations
│   ├── TaskQueue.ts            # Priority queue with dependencies
│   └── QualityConvergenceChecker.ts  # Diminishing returns / stagnation detection
├── agent/
│   ├── agent.ts                # LLM chat, system prompt builder
│   ├── skills.ts               # SkillManager: discovers .md skill files
│   ├── summoner.ts             # Spawns Claude Code / Aider as subprocesses
│   ├── evolve.ts               # Self-improvement via specialist review
│   ├── mission_reviewer.ts      # Post-mission verification, 7-criterion scoring
│   ├── quantum_memory.ts       # Grover-based memory recall over SQLite-vec
│   └── mcp.ts                  # MCP client for external service integrations
├── kernel/
│   ├── kernel.ts               # MeowKernel: heartbeat loop, watchdog, respawn
│   └── database.ts             # SQLite-vec via bun:sqlite, WAL mode, multi-table schema
├── extensions/                 # Tool definitions (read, write, run, grep, search...)
├── cli/
│   └── repl.ts                 # Interactive terminal REPL
└── types/
    └── tool.ts                 # Tool definition schema, default tool registry

.context/                       # Governance docs injected into every agent turn
├── SOP.md                      # Think-Plan-Verify, NO TRUST policy, Always Delegate
├── HONESTY.md                  # Definition of Done, Anti-Hallucination Contacts
├── MISSION.md                 # North star, core values
├── ARCHITECTURE.md             # Directory layout, data flow
└── ANTI_PATTERNS.md            # Known failure modes

memory/                         # Persistent agent findings
scratch/                        # Task-specific workspace (git-ignored)
```

---

## Comparison

**Factory.ai Kitchen**: Kitchen generates agent code and runs it in a sandbox. MEOW does not generate agents — it coordinates existing specialists and treats every output as suspect until verified. Kitchen's quality gates are post-hoc; MEOW's are structural.

**Anthropic Harness**: Harness provides a solid execution substrate. MEOW builds on that pattern but adds explicit convergence logic (stop when stagnant), multi-tier review (L3 Orchestrator + MissionReviewer), and human-in-the-loop escalation (L1 Liaison). Harness is a runner. MEOW is a quality-first harness.

---

## Anti-Hallucination Design

MEOW has four structural defenses against hallucination:

1. **Placeholder detection** (`NO_MOCKS` gate): Rejects any diff containing `TODO`, `FIXME`, or unfinished code before it can be committed.
2. **MissionReviewer** (`SOP_COMPLIANCE` gate): Scores each output for Think-Plan-Verify evidence. Output that cannot show its reasoning fails.
3. **Human sign-off** (`HumanSignoffManager`): Low-confidence decisions escalate to a human. Used for architectural choices, ambiguous requirements, and outputs that score below a confidence threshold.
4. **SOP injection**: `.context/SOP.md` is injected into every agent turn at runtime. Agents cannot opt out of the protocol.

---

## Usage

```bash
# Run in REPL mode (interactive)
npx tsx src/index.ts

# Run a single command
npx tsx src/index.ts "fix the stalled REPL"

# Pipe directly
echo "fix the stalled REPL" | npx tsx src/index.ts

# Health check
npx tsx src/index.ts "health check"

# Audit mode — no execution, score existing output
MEOW_MODE=AUDIT_ONLY npx tsx src/index.ts "audit output"
```

---

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_API_KEY` / `ANTHROPIC_API_KEY` | API key for LLM calls | (required) |
| `LLM_BASE_URL` / `ANTHROPIC_BASE_URL` | LLM endpoint | `http://localhost:11434` (Ollama) |
| `ANTHROPIC_MODEL` / `MEOW_MODEL` | Model name | `claude-3-5-sonnet-latest` |
| `EMBEDDING_DIMENSION` | Vector embedding dimension | `1536` |
| `MEOW_MODE` | Execution mode | `SEQUENTIAL` |

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `node` + `tsx` | Runtime (Node.js only — Bun does not support `better-sqlite3` native addons) |
| `better-sqlite3` | SQLite database with WAL mode |
| `sqlite-vec` | Vector similarity search |
| `quantum-circuit` | Real quantum gate simulation (Grover search, Bell states) |
| `@modelcontextprotocol/sdk` | MCP client (40+ integrations) |
| `picocolors` | Terminal colors |
| `diff-match-patch` | Text diffing |
| `mathjs` | Matrix operations for quantum simulation |

---

## License

MIT