# Meow × Kitchen Gap Analysis & Project Plan

**Reviewer:** stangg
**Date:** May 2026
**Sources:** meow (commit latest), kitchen (commit 05ed993), Factory AI (public blog + Luke's talk)

---

## 1. System Overview

### Meow (this system)
- **Role:** Sovereign meta-orchestrator — never writes code, only coordinates specialists
- **Language:** TypeScript / Bun
- **Layers:** L1 Liaison → L2 Architect → L3 Swarm → L4 Auditor
- **Specialists:** Claude Code, Aider, OpenCode, BrowserOS, Hermes, Eigent, QA
- **Key innovation:** Quantum-inspired memory (Grover's search, Bell-state entanglement), 7-criterion MissionReviewer

### Kitchen (open-source build)
- **Role:** Conductor/agent architecture with 8 execution modes
- **Language:** Python
- **Layers:** Orchestrator (conductor) + Agents + Tools
- **Key innovation:** Path-based delegation protocol, SQLite swarm coordination, feature_list.json with `passes` flag

### Factory AI (reference)
- **Role:** Production multi-agent harness (closed-source, powers factory.ai)
- **Pattern:** 2-agent (Initializer → Coder) with structured JSON handoffs
- **Key innovation:** `passes` flag for validation contracts, init.sh bootstrapping, progress tracking

---

## 2. Dimension-by-Dimension Comparison

| Dimension | Meow | Kitchen | Factory.ai | Verdict |
|-----------|------|---------|------------|---------|
| **Execution modes** | 1 (parallel swarm) | 8 (autopilot/ralph/ultrawork/swarm/pipeline/ecomode/swarm+team) | 1 (sequential with passes) | Meow is flat |
| **Agent tier selection** | 7 specialist types, no cost tiers | LOW (Haiku) / MEDIUM (Sonnet) / HIGH (Opus) | Tiered by task complexity | Meow misses cost control |
| **Task claiming** | FileCoordinator (in-memory, advisory) | SQLite (atomic BEGIN IMMEDIATE) | File locks + structured handoffs | Meow's lock is not enforced |
| **Validation model** | Post-hoc MissionReviewer (7 criteria) | Pre-hoc passes flag in feature_list.json | JSON feature list with passes | Kitchen wins (TDD-style) |
| **Structured handoffs** | summoner.ts (fire-and-forget) | feature_list.json + agent protocol | JSON with passes field | Meow lacks contract |
| **Session recovery** | Stale lock cleanup only | Full StateManager with features + tasks | Checkpoint-based | Kitchen leads |
| **Path-based delegation** | None | Orchestrator CAN write to `.kitchen/**` else delegates | Not disclosed | Kitchen leads |
| **Orchestration observability** | Basic task events (stubs) | TaskEvents with onStatus/onResult/onProgress | Not disclosed | Kitchen leads |
| **External specialist fidelity** | 7 specialists, escalation chains | Claude Code only | Custom agents | Meow wins on breadth |
| **Fault injection tests** | 11 fault-injection tests (some failing) | Stub only | Not disclosed | Meow wins on coverage |
| **Quantum memory** | Grover's + Bell-state entanglement | None | Not disclosed | Meow wins (unique) |
| **Persistence** | SQLite-vec for memory | SQLite for swarm coordination | Not disclosed | Comparable |

---

## 3. Critical Gaps (Priority Order)

### Gap 1: No dedicated execution modes → Kitchen #1, Factory.ai #2
**Problem:** Meow only has one mode: dispatch tasks to swarm in parallel. Kitchen has 8 modes (autopilot, ralph, ultrawork, etc.) that handle different scenarios: persistence, cost control, sequential stages, max parallelism.

**Impact:** Can't express "don't stop until done" (ralph mode) or "use cheapest model" (ecomode) or "sequential pipeline" in Meow.

**Fix:** Add execution mode system to Orchestrator.ts.

### Gap 2: FileCoordinator is advisory, not enforced → Meow BUG
**Problem:** FileCoordinator detects conflicts but the Orchestrator still runs blocked tasks. The fault-injection test `file-conflict-not-blocked.test.ts` documents this: "task2 still runs in practice (orchestrator doesn't enforce this)."

**Impact:** Parallel tasks can corrupt files by writing simultaneously.

**Fix:** Enforce FileCoordinator.requestAccess() blocking in ParallelExecutor before task start.

### Gap 3: No pre-hoc validation contracts → Kitchen #2, Factory.ai #1
**Problem:** Meow validates AFTER the specialist runs (MissionReviewer). Kitchen/Factory validate BEFORE execution using feature_list.json with `passes: false` — tests are written first, code must pass them.

**Impact:** No clear "done" criterion. Tests may not exist before code is written.

**Fix:** Add validation contract system: tests written first, passes flag, architect verification gate.

### Gap 4: No agent tier selection → Kitchen #2
**Problem:** All specialists use the same model tier. Kitchen selects Haiku/Sonnet/Opus based on task complexity. No cost control for simple vs. complex tasks.

**Impact:** Wasting expensive model tokens on simple tasks (comments, formatting).

**Fix:** Add tier selection to summoner.ts: simple tasks → Haiku, standard → Sonnet, complex → Opus.

### Gap 5: No SQLite-based atomic task claiming → Kitchen #2
**Problem:** Meow's swarm coordination is in-memory. Kitchen uses SQLite with BEGIN IMMEDIATE transactions for atomic task claiming. If Meow crashes, coordination state is lost.

**Impact:** No crash-safe task queue. No heartbeat cleanup with stale claim detection.

**Fix:** Replace in-memory FileCoordinator locks with SQLite SwarmDatabase ( Kitchen's `SwarmDatabase` pattern).

### Gap 6: No structured handoff protocol → Factory.ai #2
**Problem:** summoner.ts spawns a specialist and waits. Factory.ai uses structured JSON with feature_list, passes flag, init.sh. No artifact contracts between orchestrator and specialist.

**Impact:** No clear input/output contract. Specialists receive unstructured prompts.

**Fix:** Add TaskSpec with validation field, passes flag, produced_files to summoner.ts.

### Gap 7: No orchestration observer pattern → Kitchen #2
**Problem:** TaskEvents callbacks are stubs in Orchestrator.ts. No real observability for UI/TUI integration.

**Impact:** Can't build real progress tracking, can't integrate with external dashboards.

**Fix:** Implement the TaskEvents interface fully, wire up callbacks in ParallelExecutor.

### Gap 8: No path-based delegation protocol → Kitchen #2
**Problem:** Meow has no rules about which agent type should handle which file path. Kitchen has explicit rules: `src/**/*.py` → executor, `*.css` → designer, `.kitchen/**` → orchestrator.

**Impact:** Inconsistent delegation, possible wrong agent for task type.

**Fix:** Add DelegationProtocol with path-based rules similar to Kitchen's.

---

## 4. Project Plan

### Phase 1: Foundation (Execute First)

#### P1.1: Enforce FileCoordinator in ParallelExecutor
**Files:** `src/orchestrator/ParallelExecutor.ts`, `src/orchestrator/Orchestrator.ts`
**Test:** `tests/fault-injection/file-conflict-not-blocked.test.ts` must pass
**Steps:**
1. In `ParallelExecutor.executeTask()`, call `coordinator.requestAccess()` before spawning agent
2. If `!result.allowed`, re-queue task with backoff instead of proceeding
3. Remove the "advisory" comment from the fault-injection test

#### P1.2: Add SQLite SwarmDatabase
**Files:** `src/state/SwarmDatabase.ts`, update `src/orchestrator/TaskQueue.ts`
**Reference:** Kitchen's `src/state/manager.py` → `SwarmDatabase` class
**Steps:**
1. Create `SwarmDatabase` with `claim_task()`, `claim_any_task()`, `heartbeat()`, `complete_task()`, `cleanup_stale_claims()`
2. Replace `FileCoordinator` lock Map with SQLite-backed locks
3. Add heartbeat protocol to `WorkerSession`

#### P1.3: Implement TaskEvents fully
**Files:** `src/orchestrator/Orchestrator.ts`, `src/orchestrator/ParallelExecutor.ts`
**Steps:**
1. Wire up `onStatusChange` in ParallelExecutor to call orchestrator events
2. Wire up `onProgress` from agent.chat() callbacks
3. Add `StatusUpdate` emission for TUI integration

---

### Phase 2: Agent Intelligence (Execute Second)

#### P2.1: Add agent tier selection
**Files:** `src/agent/summoner.ts`, `src/agent/agent.ts`
**Reference:** Kitchen's `AgentTier` (LOW/MEDIUM/HIGH)
**Steps:**
1. Add `AgentTier` enum: `LOW = "haiku"`, `MEDIUM = "sonnet"`, `HIGH = "opus"`
2. In `summoner.ts`, detect task complexity and select tier
3. Simple tasks (format, comment, rename) → LOW
4. Standard features → MEDIUM
5. Multi-file architecture, debugging → HIGH

#### P2.2: Add validation contract system
**Files:** `src/validation/contracts.ts`, `src/architect/Architect.ts`
**Reference:** Kitchen's `docs/VALIDATION_CONTRACTS.md` + Factory.ai's `passes` flag
**Steps:**
1. Create `ValidationContract` interface: `tests[]`, `lint[]`, `coverage`, `e2e`
2. In `Architect.plan()`, generate contracts BEFORE decomposition
3. Add `passes: boolean` field to feature state
4. Architect verification gate: can't mark feature done until passes = true

#### P2.3: Add structured handoff protocol
**Files:** `src/orchestrator/Task.ts`, `src/agent/summoner.ts`
**Reference:** Factory.ai's JSON feature list with passes field
**Steps:**
1. Add `TaskSpec.validation: ValidationContract` to Task interface
2. In `summoner.ts`, pass structured TaskSpec to specialist instead of raw string
3. Specialist must return `{ passes: boolean, output: string, artifacts: FileArtifact[] }`

---

### Phase 3: Execution Modes (Execute Third)

#### P3.1: Add execution mode system
**Files:** `src/orchestrator/ExecutionModes.ts`, update `src/orchestrator/Orchestrator.ts`
**Reference:** Kitchen's `docs/EXECUTION_MODES.md` — 8 modes
**Steps:**
1. Create `ExecutionMode` enum: `AUTOPILOT`, `RALPH`, `ULTRAWORK`, `ULTRAPILOT`, `SWARM`, `PIPELINE`, `ECOMODE`, `SWARM_TEAM`
2. Add magic keyword detection: "don't stop" → RALPH, "eco"/"efficient" → ECOMODE, etc.
3. Implement mode handlers in Orchestrator:
   - **RALPH**: Loop until done, architect verification gate, NEVER reduce scope
   - **ECOMODE**: Always use Haiku, fallback to Sonnet on failure
   - **PIPELINE**: Sequential agent chaining (analyst → architect → executor → qa)
   - **ULTRAWORK**: Fire all independent tasks at once
   - **SWARM**: N agents with SQLite coordination

#### P3.2: Add path-based DelegationProtocol
**Files:** `src/orchestrator/DelegationProtocol.ts`, update `src/orchestrator/Orchestrator.ts`
**Reference:** Kitchen's `docs/DELEGATION_PROTOCOL.md`
**Steps:**
1. Create `DelegationProtocol` class with `ORCHESTRATOR_CAN_WRITE`, `SOURCE_EXTENSIONS`, `UI_EXTENSIONS`
2. `getDelegate(filePath)`: returns which agent should handle
3. In Orchestrator, check delegation before spawning agents
4. Audit log all delegation decisions

---

### Phase 4: Observability (Execute Fourth)

#### P4.1: Full state recovery
**Files:** `src/state/StateManager.ts`, update `src/kernel/kernel.ts`
**Reference:** Kitchen's `src/state/manager.py` → `StateManager` class
**Steps:**
1. Persist session state to `.meow/state/session.json`
2. Persist feature state to `.meow/state/features/{feature_id}.json`
3. On restart, reload session and resume from last checkpoint
4. Log all delegation decisions to `.meow/logs/delegation-audit.jsonl`

#### P4.2: Integration test suite for swarm modes
**Steps:**
1. Add integration test for RALPH mode (persistence across failures)
2. Add integration test for ECOMODE (tier fallback)
3. Add integration test for PIPELINE (sequential stage outputs)
4. Add integration test for SWARM+SQLite (atomic task claiming)

---

## 5. Not Doing (Out of Scope)

- **Quantum memory improvements** — Meow already leads here
- **Hermes/Eigent parity** — These are already integrated
- **BrowserOS MCP expansion** — Already working
- **Porting to Python** — Meow stays TypeScript/Bun
- **Benchmarks** — Kitchen has them; Meow doesn't need them yet

---

## 6. Success Criteria

| Metric | Target |
|--------|--------|
| File conflict enforcement | `file-conflict-not-blocked.test.ts` passes |
| SQLite coordination | Crash-recovery test passes |
| Validation contracts | `passes` flag enforced before feature marked done |
| Execution modes | All 8 modes implemented and tested |
| Tier selection | Simple tasks use Haiku (verify via logs) |
| State recovery | Session survives restart mid-execution |
| Path delegation | All file writes audited with delegate type |

---

## 7. Effort Estimate

| Phase | Tasks | Complexity |
|-------|-------|------------|
| P1.1 FileCoordinator enforcement | 1 | Medium |
| P1.2 SQLite SwarmDatabase | 1 | High |
| P1.3 TaskEvents | 1 | Low |
| P2.1 Agent tiers | 1 | Medium |
| P2.2 Validation contracts | 1 | High |
| P2.3 Structured handoffs | 1 | Medium |
| P3.1 Execution modes | 5 (one per mode group) | High |
| P3.2 DelegationProtocol | 1 | Medium |
| P4.1 StateManager | 1 | Medium |
| P4.2 Integration tests | 4 | Medium |

**Total: ~15 tasks across 4 phases**

**Recommended order:** P1.1 → P1.2 → P1.3 → P2.1 → P2.2 → P2.3 → P3.1 → P3.2 → P4.1 → P4.2