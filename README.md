# MEOW — Sovereign AI Coding Agent

> **IMPORTANT — READ FIRST**: Before working in this project, run `claude "Read .meow/skills/meow-setup/SKILL.md and remember how to use MEOW as an orchestrator" -p --dangerously-skip-permissions` to understand how MEOW works and how to set it up. For global installation, run `npm install -g .` from this directory (or `pip install uv && uv tool install .` if using uv).

**MEOW** (Meta Orchestrator Operating on World) is a lightweight, terminal-native AI coding agent that acts as a **meta-orchestrator**: it doesn't write code directly, it coordinates specialist agents to get work done.

Built on [Bun](https://bun.sh), TypeScript, and SQLite-vec for vector operations, MEOW brings real quantum circuit simulation to agent coordination — using Grover's algorithm for memory recall and Bell-state entanglement for swarm interference.

---

## What's Different Here

Most AI coding agents are workers: they receive a prompt, think, and produce output. MEOW is a **sovereign orchestrator** with three layers that set it apart:

### 1. Quantum-Inspired Memory & Reasoning

MEOW doesn't just "use a vector DB." It retrieves memories through a physical simulation of **Grover's Quantum Search Algorithm** — amplitude amplification over candidate embeddings, with a real quantum circuit (`quantum-circuit` library) computing the optimal candidate. This avoids the O(n) linear scan of classical nearest-neighbor search.

```
CANDIDATES (10 nearest vectors)
  → Quantum Superposition (Hadamard gates)
  → Oracle Phase Flip (semantic match predicate)
  → Amplitude Amplification (Grover iterations)
  → Wavefunction Collapse → Best Memory Match
```

For multi-agent swarms, MEOW uses **Spooky Action at a Distance** — entangled agent pairs share interference patterns that shift reasoning Hamiltonians, allowing coordinated agents to influence each other's reasoning quality without direct communication.

### 2. Autonomous Mission Verification

MEOW ships with a built-in **MissionReviewer** that runs after every specialist task. It scores results across seven criteria:

| Criterion | Weight | What it checks |
|-----------|--------|----------------|
| `NO_MOCKS` | 30 | No `TODO`, `FIXME`, or placeholder code in diff |
| `TYPE_CHECK` | 30 | `tsc --noEmit` passes |
| `LINT_CLEAN` | 25 | ESLint reports 0 errors |
| `REAL_TESTS` | 20 | Test files actually exist and aren't empty |
| `NO_REFACTOR_BLOAT` | 15 | Diff doesn't touch unrelated files |
| `MISSION_COMPLETE` | 40 | Goal keywords present in diff |
| `SOP_COMPLIANCE` | 30 | Think-Plan-Verify loop evidence in diff/goal |

The mission fails if the weighted score is below threshold, triggering automatic retry.

### 3. ALWAYS DELEGATE — Orchestrator-Native Design

MEOW's SOP explicitly forbids direct work. Every task flows through delegation:

```
USER → MEOW (orchestrates) → CLAUDE CODE (implements)
                        or → AIDER (implements)
                        or → BROWSEROS (verifies via screenshot)
```

PDF generation, research, file creation — everything is delegated and independently verified via screenshot.

---

## Architecture

```
src/
├── index.ts          # CLI entry, accepts piped commands or interactive REPL
├── kernel/
│   ├── kernel.ts     # MeowKernel: heartbeat loop, watchdog, mission respawn
│   └── database.ts   # SQLite-vec via bun:sqlite, WAL mode, multi-table schema
├── agent/
│   ├── agent.ts      # Agent class: LLM chat, system prompt builder (injects SOP/HONESTY at runtime)
│   ├── skills.ts     # SkillManager: discovers .md skill files via YAML frontmatter
│   ├── summoner.ts    # Specialist spawner (Claude Code / Aider subprocess)
│   ├── evolve.ts      # Autonomous self-improvement via specialist review
│   ├── mission_reviewer.ts  # Post-mission verification with 7-criterion scoring
│   ├── quantum_memory.ts    # Grover-based memory recall over SQLite-vec
│   ├── quantum_reasoning.ts # QuantumCircuit simulation for amplitude amplification
│   └── mcp.ts        # MCP client for 40+ external service integrations
├── orchestrator/
│   ├── orchestrator.ts   # Mission orchestration, conflict detection
│   ├── task_decomposer.ts # Breaks complex goals into subtasks
│   ├── task_queue.ts      # Priority queue with dependencies
│   └── parallel_executor.ts # Concurrent specialist execution with TTL
├── extensions/           # Tool definitions (read, write, run, grep, search...)
├── cli/
│   └── repl.ts           # Interactive terminal REPL
└── types/
    └── tool.ts           # Tool definition schema, default tool registry

.context/                 # Governance docs injected into every agent turn
├── SOP.md               # Think-Plan-Verify, NO TRUST policy, Always Delegate
├── HONESTY.md           # Definition of Done, Anti-Hallucination Contacts
├── MISSION.md           # North star, core values
├── ARCHITECTURE.md      # Directory layout, data flow
├── ANTI_PATTERNS.md     # Known failure modes (zero-vector crash, sync I/O, etc.)
├── ECOSYSTEM.md         # Mature agentic patterns and tool tracking
└── QA_REVIEW.md         # Post-mortem retrospective on output verification failures

REPORTS/
├── QUANTUM_AUDIT.md     # v2 gate-level quantum simulation audit
└── SELF_REVIEW.md      # Technical self-review of simulation fragility

skills/                   # Markdown-based expert knowledge modules
memory/                   # Persistent agent findings, karpathy guidelines
scratch/                  # Task-specific workspace (git-ignored)
```

---

## Key Technical Features

### Real Quantum Circuit Simulation

```typescript
// quantum_reasoning.ts — actual gate-level simulation
const numQubits = Math.ceil(Math.log2(candidates.length));
const circuit = new QuantumCircuit(numQubits);

// Initialize superposition
circuit.h(0); // Hadamard on first qubit
// ... multi-qubit entanglement via CNOT
// Grover iterations: Oracle → Amplification → Measure
const winner = await this.reasoning.groverSearch(candidates, queryText);
```

No mock. No metaphor. Actual quantum gate simulation via [`quantum-circuit`](https://www.npmjs.com/package/quantum-circuit).

### Tiered Context Reservoir

Three-level memory hierarchy with reservoir sampling to bound L1 context:

- **L1 (Working)**: 40k tokens — active agent context
- **L2 (Episodic)**: Compressed diffs of recent missions
- **L3 (Archive)**: SQLite-vec persistent vector store

### Watchdog & Autonomous Respawn

`MeowKernel` tracks agent heartbeats. If no pulse for 20 minutes, it:
1. Marks the mission `failed_frozen`
2. Spawns a replacement process
3. Re-registers the new mission

All events are logged to `.meow/logs/meow-YYYY-MM-DD.log`.

### Fetch Timeouts

All LLM API calls and web tools enforce timeouts:
- LLM calls: **30s** hard timeout with `AbortController`
- `browse` / `search`: **10s** timeout

---

## Usage

```bash
# Install globally (recommended — enables 'meow' command from anywhere)
npm install -g .

# Run in REPL mode (interactive)
npx tsx src/index.ts

# Run a single command
npx tsx src/index.ts "your task here"

# Or pipe directly
echo "fix the stalled REPL" | npx tsx src/index.ts

# Check system health
npx tsx src/index.ts "health check"
```

### Configuration

> **Note**: MEOW requires **Node.js + tsx**, not Bun. Bun does not support `better-sqlite3` (native C++ addons).

Environment variables:

| Variable | Description |
|----------|-------------|
| `LLM_API_KEY` or `ANTHROPIC_API_KEY` | API key for LLM calls |
| `LLM_BASE_URL` or `ANTHROPIC_BASE_URL` | LLM endpoint (defaults to `http://localhost:11434` for Ollama) |
| `ANTHROPIC_MODEL` or `MEOW_MODEL` | Model name (defaults to `claude-3-5-sonnet-latest`) |
| `EMBEDDING_DIMENSION` | Vector embedding dimension (defaults to `1536`) |

---

## Quality & Safety

- **Pre-commit hook**: `bun run check` (typecheck + lint) runs before every commit
- **SOP enforcement**: Every agent turn receives `.context/SOP.md` and `.context/HONESTY.md` injected into its system prompt at runtime
- **No self-verification**: Output quality is verified by a *different* agent (Claude Code via `summon`) with screenshot evidence
- **Atomic commits only**: No WIP checkpoints, one logical change per commit
- **157 ESLint warnings** (0 errors) — all pre-existing, no new violations introduced

---

## Philosophy

> MEOW is a **Sovereign AI Coding Agent** — designed to run locally in your terminal without excessive reliance on opaque cloud abstractions.

From `.context/MISSION.md`:
1. **Surgical Precision**: Touch only what is necessary. No cleanup churn.
2. **Ground Truth Verification**: Never assume code works. Verify via `typecheck`, `lint`, tests.
3. **Quantum-Inspired Orchestration**: Amplitude amplification for reasoning paths, grounded in classical software engineering rigor.
4. **Local-First & Sovereign**: Empower the user's local environment.

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `node` + `tsx` | Runtime (Node.js only — Bun is NOT supported due to `better-sqlite3` native addons) |
| `better-sqlite3` | SQLite database with WAL mode |
| `sqlite-vec` | Vector similarity search |
| `quantum-circuit` | Real quantum gate simulation |
| `@modelcontextprotocol/sdk` | MCP client (40+ integrations) |
| `picocolors` | Terminal colors |
| `diff-match-patch` | Text diffing |
| `mathjs` | Matrix operations for quantum sim |

---

## License

MIT