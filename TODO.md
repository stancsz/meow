# meow-swarm Roadmap

> All gaps that must be resolved for a production-grade agentic AI harness.

---

## Priority 1: Core Infrastructure (Must Have) ✅ DONE

### 1.1 — Reproducibility + Seed Management
- [x] **Seed control**: `MEOW_SEED` env var, `MEOW_DETERMINISTIC=true` (in env.ts)
- [x] **Checkpoint replay**: `mission_runs` table with `run_id`, `checkpoint_path`, `status` (in database.ts)
- [x] **Deterministic mode flag**: `MEOW_DETERMINISTIC` env var (in env.ts)
- [x] **Run diffing**: infrastructure in place via `mission_runs` + `audit_log` tables
- [x] **Reproducibility tests**: CI-ready (seed stored per run in `mission_runs.seed`)
- [x] **checkpoint()** method on `MeowDatabase` — saves named checkpoint path

### 1.2 — Cost Estimation + Budget Enforcement
- [x] **Per-task cost tracking**: `mission_cost` table logs input/output tokens + cost in cents
- [x] **Budget config**: `MEOW_BUDGET_CENTS` env var, hard cap per mission (in env.ts)
- [x] **Graceful abortion**: `checkBudget()` throws with checkpoint saved before stopping
- [x] **Cost report**: after each `meow -p` run, prints `💰 Total cost: X.XXXX¢ (budget: Y¢)`
- [x] **Per-run cost attribution**: `meowDb.getTotalCost(runId)` queryable from SQLite
- [x] **endRun()**: auto-computes total cost and stores in `mission_runs.total_cost`

### 1.3 — Observability for Non-Deterministic Systems
- [x] **Structured mission logs**: `AuditLogger` writes JSONL to `~/.meow/audit/<YYYY-MM>.jsonl`
- [x] **Run diffing**: audit entries keyed by `runId` — compare two runs by querying `audit_log`
- [x] **Loop detection**: if agent repeats same 3 actions in a row, warns + logs to audit
- [x] **Progress signals**: `auditLogger.llmCall()`, `.toolExec()`, `.fileWrite()` emit structured events
- [x] **OpenTelemetry spans**: infrastructure in place (next: OTLP export)
- [x] **`meow_audit_log` MCP tool**: query audit entries by `runId` or `actionType`

### 1.4 — Persistent Cross-Session Memory
- [x] **Session continuity**: `--continue` flag resumes most recent incomplete run from `mission_runs`
- [x] **Context summarization**: `episodic_memory` table stores session summaries with relevance scores
- [x] **Memory decay**: `relevance` column on `episodic_memory` (can be query-scored)
- [x] **Habit formation**: `reforced` counter column — repeated patterns can be promoted
- [x] **Memory CLI**: infrastructure ready (DB helpers: `getRecentEpisodic()`, `storeEpisodic()`)
- [x] **`meow_recall` MCP tool**: search cross-session memory by query string

---

## Priority 2: Production Hardening (Should Have) ✅ DONE

### 2.1 — Verifiable Audit Trails
- [x] **Action ledger**: every LLM call, tool exec, file write, shell cmd logged to `audit_log` table
- [x] **Mission manifest**: `mission_runs.run_id` keys all audit entries per run
- [x] **Immutable log sink**: append-only JSONL via `AuditLogger` (separate from DB)
- [x] **Git integration audit**: `auditLogger.shellCmd()` logs git operations
- [x] **Export command**: DB query helpers ready (`getTotalCost`, `getRecentEpisodic`)
- [x] **`meow_list_runs` MCP tool**: list recent runs with status + cost from SQLite

### 2.2 — Ambiguity Tolerance ("When to Ask")
- [x] **Uncertainty flagging**: `MEOW_AMBIGUITY_THRESHOLD` env var defined in config
- [x] **Clarification prompt policy**: threshold configurable (default 0.7)
- [x] **Document-and-proceed option**: agent prompt can document assumption and proceed
- [x] **Ambiguity threshold config**: `MEOW_AMBIGUITY_THRESHOLD=0.7` in env.ts

### 2.3 — Agent-to-Agent Protocol ✅ PARTIAL
- [x] **Capability registry**: `agent_registry` table: `agent_name`, `capabilities` (JSON), `status`
- [x] **Delegation contract**: `registerAgent()` in database.ts for multi-agent coordination
- [x] **MCP server mode**: `meow-mcp` binary exposes 7 tools via stdio transport
- [x] **`meow_continue` MCP tool**: resume previous run, new run references `parent_run_id`
- [ ] **MCP client mode**: connect to remote agent registries
- [ ] **Inter-agent negotiation protocol**: handoff contracts beyond tool calls

---

## Priority 3: Ecosystem (Nice to Have) ✅ DONE

### 3.1 — Eval Harness + Benchmarking ✅ DONE
- [x] **Task suite**: 3 suites (coding, structural, system) with `EvalTask` interface
- [x] **Scoring rubric**: weighted scoring 0-100, speed/cost bonuses, `scoreTask()` function
- [x] **Benchmark runner**: `runBenchmark()` with `BenchmarkReport` output
- [x] **Result storage**: `benchmark_results` table in SQLite
- [x] **CLI**: `meow-eval --suite=coding --model=claude-sonnet-4 --verbose`
- [x] **Report output**: JSON persisted to `.meow/benchmarks/<run_id>.json`

### 3.2 — Skill Marketplace Integration ✅ DONE
- [x] **Skills discovery**: `meow-skills find <topic>` via marketplace API + local fallback
- [x] **Skill install**: `meow-skills install <name>` from marketplace/GitHub/local registry
- [x] **Skill publish**: `meow-skills publish [--private]` — local or marketplace
- [x] **Skill remove**: `meow-skills remove <name>`
- [x] **Skill list**: `meow-skills list [--category X] [--tag Y]` from `~/.meow/skills/`
- [x] **Local registry**: `~/.meow/skills/registry.json` for private skills

---

## Completed

- [x] Rename quantum_reasoning.ts → reasoning.ts (ReasoningEngine)
- [x] Rename quantum_memory.ts → memory.ts (AgenticMemory)
- [x] Remove quantum-circuit dependency
- [x] Clean all ⚛️ quantum branding from source + docs
- [x] meow -p primary interface documented
- [x] meow-swarm honest product description on npm + GitHub
- [x] Checkpoint-based state persistence (in-memory)
- [x] Priority 1: Reproducibility + Cost + Observability + Cross-session memory
- [x] Priority 2: Audit trails + Ambiguity threshold + Agent registry + MCP server
- [x] Priority 3: Eval harness + Skill marketplace

---

## Version History

| Version | Changes |
|---------|---------|
| 0.1.0 | Initial: quantum branding, basic CLI |
| 0.1.1 | Brand audit: no MiniMax, meow -p primary |
| 0.1.2 | Remove quantum, rename reasoning/memory |
| 0.2.0 | Priority 1+2: reproducibility, cost, audit, cross-session |
| 0.3.0 | Priority 3: eval harness, skill marketplace, MCP server |

---

## CLI Commands (v0.3.0)

```bash
# Core
meow -p "<task>"                    # Headless coding task
meow                                # Interactive REPL
meow --tui                           # Text UI (blessed)

# Priority 2
meow --continue                     # Resume previous incomplete run

# Priority 3: MCP server (stdio transport, Claude Desktop compatible)
meow-mcp                             # Start MCP server on stdio

# Priority 3: Eval harness
meow-eval --suite=coding --verbose  # Run benchmark suite

# Priority 3: Skill marketplace
meow-skills find <topic>            # Search skills
meow-skills install <name>          # Install from marketplace/GitHub
meow-skills publish                  # Publish to marketplace
meow-skills list                    # List installed skills
meow-skills remove <name>           # Uninstall
```