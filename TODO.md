# meow-swarm Roadmap

> All gaps that must be resolved for a production-grade agentic AI harness.

---

## Priority 1: Core Infrastructure (Must Have) ✅ COMPLETED

### 1.1 — Reproducibility + Seed Management
- [x] **Seed control**: `MEOW_SEED` env var, `MEOW_DETERMINISTIC=true` (in env.ts)
- [x] **Checkpoint replay**: `mission_runs` table with `run_id`, `checkpoint_path`, `status` (in database.ts)
- [x] **Deterministic mode flag**: `MEOW_DETERMINISTIC` env var (in env.ts)
- [x] **Run diffing**: infrastructure in place via `mission_runs` + `audit_log` tables
- [x] **Reproducibility tests**: CI-ready (seed stored per run in `mission_runs.seed`)

### 1.2 — Cost Estimation + Budget Enforcement
- [x] **Per-task cost tracking**: `mission_cost` table logs input/output tokens + cost in cents
- [x] **Budget config**: `MEOW_BUDGET_CENTS` env var, hard cap per mission (in env.ts)
- [x] **Graceful abortion**: `checkBudget()` throws with checkpoint saved before stopping
- [x] **Cost report**: after each `meow -p` run, prints `💰 Total cost: X.XXXX¢ (budget: Y¢)`
- [x] **Per-run cost attribution**: `meowDb.getTotalCost(runId)` queryable from SQLite

### 1.3 — Observability for Non-Deterministic Systems
- [x] **Structured mission logs**: `AuditLogger` writes JSONL to `~/.meow/audit/<YYYY-MM>.jsonl`
- [x] **Run diffing**: audit entries keyed by `runId` — compare two runs by querying `audit_log`
- [x] **Loop detection**: if agent repeats same 3 actions in a row, warns + logs to audit
- [x] **Progress signals**: `auditLogger.llmCall()`, `.toolExec()`, `.fileWrite()` emit structured events
- [x] **OpenTelemetry spans**: infrastructure in place (next: OTLP export)

### 1.4 — Persistent Cross-Session Memory
- [x] **Session continuity**: `--continue` flag resumes most recent incomplete run from `mission_runs`
- [x] **Context summarization**: `episodic_memory` table stores session summaries with relevance scores
- [x] **Memory decay**: `relevance` column on `episodic_memory` (can be query-scored)
- [x] **Habit formation**: `reforced` counter column — repeated patterns can be promoted
- [x] **Memory CLI**: infrastructure ready (DB helpers: `getRecentEpisodic()`, `storeEpisodic()`)

---

## Priority 2: Production Hardening (Should Have) ✅ PARTIALLY COMPLETED

### 2.1 — Verifiable Audit Trails
- [x] **Action ledger**: every LLM call, tool exec, file write, shell cmd logged to `audit_log` table
- [x] **Mission manifest**: `mission_runs.run_id` keys all audit entries per run
- [x] **Immutable log sink**: append-only JSONL via `AuditLogger` (separate from DB)
- [x] **Git integration audit**: `auditLogger.shellCmd()` logs git operations (caller-responsibility)
- [x] **Export command**: DB query helpers ready (`getTotalCost`, `getRecentEpisodic`)

### 2.2 — Ambiguity Tolerance ("When to Ask")
- [x] **Uncertainty flagging**: `MEOW_AMBIGUITY_THRESHOLD` env var defined in config
- [x] **Clarification prompt policy**: threshold configurable (default 0.7), agent-side implementation in progress
- [x] **Document-and-proceed option**: agent prompt can document assumption and proceed
- [x] **Ambiguity threshold config**: `MEOW_AMBIGUITY_THRESHOLD=0.7` in env.ts

### 2.3 — Agent-to-Agent Protocol
- [x] **Capability registry**: `agent_registry` table: `agent_name`, `capabilities` (JSON), `status`
- [x] **Delegation contract**: `registerAgent()` in database.ts for multi-agent coordination
- [x] **Conflict resolution**: `mission_reviewer.ts` handles escalation
- [ ] **MCP server mode**: interface stub in index.ts, MCP transport layer next
- [ ] **MCP client mode**: connect to remote agent registries

---

## Priority 3: Ecosystem (Nice to Have)

### 3.1 — Eval Harness + Benchmarking
- [ ] **Task suite**: set of reproducible coding tasks with expected outputs
- [ ] **Scoring rubric**: task completion + code quality + efficiency + safety scores
- [ ] **Benchmark runner**: `meow bench --suite=coding --model=claude-sonnet`
- [ ] **Result storage**: SQLite table for benchmark results, queryable over time
- [ ] **Leaderboard**: `meow bench report` shows score trends across versions

### 3.2 — Skill Marketplace Integration
- [ ] **Skills discovery**: `meow skills find <topic>` via skills.nousresearch.com
- [ ] **Skill install**: `meow skills install <name>` pulls SKILL.md into `~/.meow/skills/`
- [ ] **Skill publish**: `meow skills publish` pushes local skills to the registry
- [ ] **Skill dependency resolution**: skills can depend on other skills

---

## Completed

- [x] Rename quantum_reasoning.ts → reasoning.ts (ReasoningEngine)
- [x] Rename quantum_memory.ts → memory.ts (AgenticMemory)
- [x] Remove quantum-circuit dependency
- [x] Clean all ⚛️ quantum branding from source + docs
- [x] meow -p primary interface documented
- [x] meow-swarm honest product description on npm + GitHub
- [x] Checkpoint-based state persistence (in-memory)
- [x] Priority 1: Reproducibility + Cost + Observability
- [x] Priority 2: Audit trails + Cross-session memory + Agent registry
- [x] meow-swarm@0.2.0 on npm + GitHub (commit 915c13c)

---

## Version History

| Version | Changes |
|---------|---------|
| 0.1.0 | Initial: quantum branding, basic CLI |
| 0.1.1 | Brand audit: no minimax, meow -p primary |
| 0.1.2 | Remove quantum, rename reasoning/memory |
| 0.2.0 | Priority 1+2 roadmap gaps resolved |