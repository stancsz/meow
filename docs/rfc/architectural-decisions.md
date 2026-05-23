# Architectural Gap Analysis: Meow vs Kitchen vs Factory.ai

**Reviewer:** stangg
**Date:** May 2026
**Last updated:** 2026-05-23

> **How to use this doc:** Section 5 lists gaps. Gaps marked ✅ are closed. Open gaps
> feed into `docs/STATUS.md` and `docs/ROADMAP.md`. For the current priority list,
> read `docs/STATUS.md` first.

---

## 1. Current Meow Architecture (As-Built)

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INPUT                               │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│  L1 LIAISON (Interaction Layer)                                  │
│  • Fast intent extraction (< 500ms)                              │
│  • Streams initial response                                      │
│  • Creates MissionBrief                                          │
│  liaison/Liaison.ts                                              │
└─────────────────────────────┬───────────────────────────────────┘
                              │ MissionBrief
┌─────────────────────────────▼───────────────────────────────────┐
│  L2 ARCHITECT (Planning Layer)                                   │
│  • QUBO/QAOA for parallel wave scheduling                        │
│  • File conflict detection                                       │
│  • DAG planning                                                   │
│  architect/Architect.ts                                          │
└─────────────────────────────┬───────────────────────────────────┘
                              │ ExecutionPlan (tasks + waves)
┌─────────────────────────────▼───────────────────────────────────┐
│  L3 SWARM (Execution Layer)                                      │
│  • Worker pool management                                        │
│  • Ephemeral sessions (claude/aider/opencode/browseros/qa)       │
│  • Heartbeat monitoring                                          │
│  swarm/SwarmManager.ts                                          │
│  ├─ ParallelExecutor.ts  (in-process worker dispatch)           │
│  ├─ FileCoordinator.ts   (conflict detection, IN-MEMORY)        │
│  └─ TaskDecomposer.ts    (LLM-based task breakdown)            │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│  L4 AUDITOR (Verification Layer)                                 │
│  • MissionReviewer (7-criterion post-hoc scoring)               │
│  • Automatic retry on failure                                   │
│  auditor/Auditor.ts                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│  MEOW KERNEL (Supervision)                                       │
│  • Single-writer MPSC action queue (batched drain)              │
│  • Watchdog (frozen agent respawn)                               │
│  • Bell-state entanglement (spooky action at distance)           │
│  • Mission tracking in SQLite                                    │
│  kernel/kernel.ts                                                │
└─────────────────────────────────────────────────────────────────┘
```

### Meow's Unique Innovations
1. **Quantum-inspired memory** — Grover's search over embeddings, Bell-state entanglement for swarm coordination
2. **4-layer hierarchy** — Clear separation: Liaison → Architect → Swarm → Auditor
3. **L1 fast-path** — < 500ms initial response with streaming
4. **Post-hoc verification** — MissionReviewer scores results after specialist runs
5. **7 specialist types** — cc, aider, opencode, browseros, hermes, eigent, qa

### Meow's Architectural Weaknesses
1. **L3 is flat** — Only one mode (parallel swarm), no concept of execution modes like Kitchen
2. **FileCoordinator is in-memory** — Advisory locks, not SQLite-backed atomic claims
3. **No validation contracts** — Tests written after code (post-hoc), not before
4. **TaskEvents are stubs** — No real observability wired through ParallelExecutor → Orchestrator
5. **No path-based delegation** — All file writes delegated to whatever specialist is chosen
6. **L2 QUBO is simulated** — `QuantumReasoning` uses brute-force search, not real QAOA

---

## 2. Kitchen Architecture (Target Build)

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INPUT                               │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│  ORCHESTRATOR (Conductor)                                        │
│  • Detects execution mode from magic keywords                    │
│  • 8 modes: AUTOPILOT / RALPH / ULTRAWORK / ULTRAPILOT /        │
│            SWARM / PIPELINE / ECOMODE / SWARM_TEAM              │
│  • NEVER writes source code — always delegates                   │
│  orchestrator/core.py  (KitchenOrchestrator)                     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  ANALYST     │     │  ARCHITECT   │     │   WRITER     │
│  (requirements)  │     │  (specs)     │     │  (docs)      │
│  executor-low│     │              │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  EXECUTOR   │     │  ARCHITECT   │     │  QA-TESTER   │
│  (code)     │     │  (verify)    │     │  (tests)     │
│  tier-based │     │  final sign  │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
                              │
         ┌────────────────────┴────────────────────┐
         ▼                                         ▼
┌──────────────────┐                  ┌──────────────────────────┐
│ SWARM DATABASE   │                  │  STATE MANAGER           │
│ (SQLite)         │                  │  • session.json          │
│ • claim_task()   │                  │  • features/{id}.json    │
│ • heartbeat()    │                  │  • delegation-audit.jsonl│
│ • cleanup_stale  │                  │  • task recovery          │
└──────────────────┘                  └──────────────────────────┘
```

### Kitchen's Strengths
1. **8 execution modes** — Each with clear semantics and trigger conditions
2. **Path-based DelegationProtocol** — Explicit rules: `*.py` → executor, `*.css` → designer, `.kitchen/**` → orchestrator
3. **Pre-hoc validation** — `feature_list.json` with `passes: false`, tests written before code
4. **SQLite swarm coordination** — Atomic BEGIN IMMEDIATE task claiming, heartbeat protocol
5. **Tier-based agents** — LOW (Haiku) / MEDIUM (Sonnet) / HIGH (Opus) for cost control
6. **Session recovery** — Full state persisted for mid-execution restart
7. **Structured handoff** — TaskSpec with validation contracts, not raw strings

### Kitchen's Weaknesses
1. **Python, not TypeScript** — Different ecosystem from meow
2. **No multi-agent specialist integration** — Only Claude Code, no aider/opencode/browseros
3. **Stub implementations** — Orchestrator, agents, and tools are skeleton code
4. **No quantum innovations** — No Grover search, no Bell-state entanglement
5. **No L1 fast-path** — No streaming initial response layer

---

## 3. Factory.ai Architecture (Reference)

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INPUT                               │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│  INIT.SH (Bootstrap)                                            │
│  • Sets up environment                                           │
│  • Runs Initializer agent                                        │
│  • Produces feature_list.json                                    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
         ┌────────────────────┴────────────────────┐
         ▼                                         ▼
┌──────────────────┐                  ┌──────────────────────────┐
│  INITIALIZER      │                  │  CODING AGENT            │
│  (planner)        │ ──JSON handoff──▶  (implementer)           │
│  • Breaks into    │   feature_list   │  • Reads feature_list     │
│    tasks          │   passes: false  │  • Writes code           │
│  • Writes JSON    │                  │  • Sets passes: true     │
│  • Structured     │                  │  • Structured output     │
│    handoff        │                  │                          │
└──────────────────┘                  └──────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  VALIDATION GATE                                                 │
│  • If passes == false → coding agent must fix                     │
│  • If passes == true → next feature                              │
│  • Progress tracking dashboard                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Factory.ai's Strengths
1. **Structured JSON handoffs** — feature_list.json with passes flag is the contract
2. **2-agent simplicity** — Initializer (planner) + Coder (executor), no complex layers
3. **Pre-hoc validation** — passes: false means "write tests first, don't mark done until passing"
4. **init.sh bootstrapping** — Reproducible environment setup
5. **Production proven** — Runs factory.ai in production

### Factory.ai's Weaknesses
1. **2-agent only** — No multi-mode execution, no parallelism modes
2. **Closed source** — Internal system, not available
3. **No specialized agents** — Single coder vs meow's 7 specialist types
4. **No cost tiering** — No Haiku/Sonnet/Opus selection
5. **No quantum features** — Standard LLM-based system

---

## 4. Architectural Comparison Map

| Dimension | Meow | Kitchen | Factory.ai |
|-----------|------|---------|------------|
| **Layer count** | 4 (L1-L4) | 2 (Orchestrator + Agents) | 2 (Init + Coder) |
| **Execution modes** | 1 (parallel swarm) | 8 | 1 (passes-based) |
| **Specialist agents** | 7 types | 1 (Claude Code) | 1 (Coder) |
| **Coordination** | In-memory FileCoordinator | SQLite atomic claiming | File locks + JSON |
| **Validation** | Post-hoc (MissionReviewer) | Pre-hoc (passes flag) | Pre-hoc (passes flag) |
| **Fast-path L1** | ✅ < 500ms streaming | ❌ | ❌ |
| **Quantum features** | ✅ Grover + Bell-state | ❌ | ❌ |
| **Tier-based cost** | ❌ | ✅ Haiku/Sonnet/Opus | ❌ |
| **Path delegation** | ❌ | ✅ | ❌ |
| **Session recovery** | Partial (stale locks) | ✅ Full | ❌ |
| **Observer pattern** | ❌ (stubs) | ✅ TaskEvents | ❌ |
| **Structured handoff** | ❌ (raw strings) | ✅ TaskSpec | ✅ JSON |
| **LSP/AST tools** | ❌ | ✅ lsp.py + ast.py | ❌ |

---

## 5. Key Architectural Gaps

### Gap Status Summary

| Gap | Description | Status |
|-----|-------------|--------|
| Gap 1 | L3 flat — no execution modes | ✅ Closed — `ExecutionModes.ts` added |
| Gap 2 | No pre-hoc validation contracts | ✅ Closed — `ValidationContract` + passes flag |
| Gap 3 | No structured handoff between layers | ✅ Closed — `TaskSpec` with validation field |
| Gap 4 | `FileCoordinator` in-memory vs SQLite | ✅ Closed — SQLite-backed, proven in tests |
| Gap 5 | No path-based delegation protocol | ✅ Closed — `DelegationProtocol.ts` added |
| Gap 6 | L1-L2 handoff informal | ✅ Closed — LLM-based decomposition |
| BUG-01 | `vec_memory` integer PK crash | ❌ Open — memory broken on every startup |
| BUG-02 | `fixMeow()` ETIMEDOUT Windows | ❌ Open — self-repair broken |
| BUG-03 | DelegationProtocol unregistered workers | ❌ Open — browseros/qa route to claude |
| BUG-04 | FedClient infinite reconnect | ❌ Open — no max attempts cap |
| BUG-05 | FileCoordinator not enforced in Orchestrator | ❌ Open — advisory only |
| BUG-06 | PID mismatch on respawn | ❌ Open — watchdog loses track |
| BUG-07 | Architect fallback validation no-op | ❌ Open — always passes |

---

### ✅ Gap 1: Meow's L3 is Flat — No Execution Modes (CLOSED)

**Current Meow:**
```
execute() → ParallelExecutor.run() → all tasks in parallel
```
One mode handles everything. Can't express "don't stop until done" or "use cheapest model."

**Kitchen approach:**
```
KitchenOrchestrator.run() → detect_mode() → switch(mode):
  case AUTOPILOT: analyst → architect → executor → qa
  case RALPH: ultrawork loop + architect_verify (never gives up)
  case ECOMODE: always Haiku, fallback Sonnet
  case PIPELINE: analyst → architect → executor → qa → writer (sequential)
  case SWARM: N agents with SQLite coordination
```

**Fix:** Add `ExecutionMode` enum to meow, refactor `Orchestrator.execute()` into mode handlers.

### ✅ Gap 2: No Pre-Hoc Validation Contracts (CLOSED)

**Current Meow:**
```
Specialist runs → Auditor scores (post-hoc) → retry if failed
```

**Factory.ai / Kitchen:**
```
feature_list.json created with passes: false
Tests written FIRST (must fail initially)
Executor implements until tests pass
Architect verifies → passes: true → done
```

**Fix:** Add `ValidationContract` interface. In `Architect.plan()`, generate contracts BEFORE spawning agents. Set `passes: false` initially. Only mark done when passes: true.

### ✅ Gap 3: No Structured Handoff Between Layers (CLOSED)

**Current Meow:**
```
Liaison → MissionBrief (informal)
L2 → L3: Task[] (raw array of strings)
L3 → L4: output string (unstructured)
```

**Factory.ai:**
```
Initializer → feature_list.json (structured JSON with passes field)
  {
    "features": [
      {
        "id": "auth-jwt",
        "validation": { "tests": [...], "lint": "pylint > 9.0" },
        "passes": false
      }
    ]
  }
Coder → structured result { passes: true/false, artifacts: [...] }
```

**Fix:** Add `TaskSpec.validation: ValidationContract` to Task interface. Specialists receive structured input and return structured `TaskResult` with `passes` field.

### ✅ Gap 4: FileCoordinator In-Memory vs SQLite Atomic Claiming (CLOSED)

**Current Meow (FileCoordinator.ts):**
```typescript
// In-memory Map — lost on crash
private locks: Map<string, FileLock> = new Map();
requestAccess(taskId, artifacts) {
  // Check conflicts... but not enforced downstream
}
```

**Kitchen (SwarmDatabase):**
```python
# SQLite with BEGIN IMMEDIATE — survives crashes
def claim_task(self, task_id: str, agent_id: str) -> bool:
    conn = sqlite3.connect(self.db_path, isolation="BEGIN IMMEDIATE")
    cursor.execute(
        "UPDATE tasks SET status='claimed', claimed_by=? WHERE task_id=? AND status='pending'",
        (agent_id, task_id)
    )
    # Atomic: only one agent gets the lock
```

**Fix:** Replace in-memory FileCoordinator with SQLite-backed `SwarmDatabase` from Kitchen's `state/manager.py`. Use `BEGIN IMMEDIATE` transactions.

### ✅ Gap 5: No Path-Based Delegation Protocol (CLOSED)

**Current Meow:** Any specialist can be assigned to any file.

**Kitchen:**
```python
# Path-based delegation rules
class DelegationProtocol:
    ORCHESTRATOR_CAN_WRITE = {".kitchen/", "FACTORY.md", "*.md"}
    SOURCE_EXTENSIONS = {".py", ".ts", ".tsx", ...}
    UI_EXTENSIONS = {".css", ".scss", ".html", ...}

    @classmethod
    def get_delegate(cls, file_path: str) -> str:
        if path.startswith(".kitchen/"): return "orchestrator"
        if suffix in UI_EXTENSIONS: return "designer"
        if suffix in DOC_EXTENSIONS: return "writer"
        if suffix in SOURCE_EXTENSIONS: return "executor"
```

**Fix:** Add `DelegationProtocol.ts` with path-based rules. Log all delegation decisions to `delegation-audit.jsonl`.

### ✅ Gap 6: L1-L2 Handoff is Informal (CLOSED)

**Current Meow:** `Liaison.extractIntent()` produces `MissionBrief` via regex + keyword heuristics.

**Better approach (Kitchen-style):**
- L1 receives user input
- L1 enriches context (available files, skills, MCP servers)
- L2 (Architect) runs full LLM-based decomposition with this context
- Not just regex classification

---

## 5b. Operational Gaps (Wave 4 — Active)

These gaps are confirmed by live logs and the `ERRORS.md` error table. They are the current
priority. See `docs/STATUS.md` for the ordered fix list.

### BUG-01: `vec_memory` Integer Primary Key Crash

**Symptom (from `.meow/logs/`):**
```
Memory store failed: SqliteError: Only integers are allowed for primary key values on vec_memory
```
Fires 7–10× per session. Every memory write fails. Memory subsystem is effectively broken.

**Root cause:** The `vec_memory` table requires integer primary keys (a `sqlite-vec` constraint), but the insert is passing a non-integer (likely a UUID or string ID).

**Fix:** Ensure the primary key value passed to `vec_memory` inserts is an integer. Use `AUTOINCREMENT` or derive from the parent table's integer rowid.

---

### BUG-02: `fixMeow()` spawnSync ETIMEDOUT on Windows

**Symptom:** `claude -p spawnSync ETIMEDOUT` — MEOW-3-RULE self-repair loop is broken on Windows.

**Root cause:** `spawnSync("cmd.exe", ["/c", "claude -p ..."])` hangs waiting for TTY input that never arrives.

**Fix:** Use `spawn("node", [claudeBinPath, "-p", ...], { shell: false, stdio: ["pipe", "pipe", "pipe"] })` and close stdin immediately. Or use `execFile`. See `ERRORS.md` for full options.

---

### BUG-03: DelegationProtocol Routes to Unregistered Workers

**File:** `src/orchestrator/DelegationProtocol.ts`

**Symptom:** Tasks that should route to `browseros` or `qa` silently fall back to `claude`.

**Fix:** Either register actual workers for these types, or remove them from the routing table until they exist.

---

### BUG-04: FedClient Infinite Reconnect Loop

**File:** `src/swarm/federation/FedHub.ts:238`

**Symptom:** On permanent network failure, `triggerReconnection()` retries indefinitely.

**Fix:** Add `maxReconnectAttempts` counter; stop after N attempts and emit a `permanently_disconnected` event.

---

### BUG-05: FileCoordinator Not Enforced in Orchestrator

**Files:** `src/orchestrator/FileCoordinator.ts`, `src/orchestrator/Orchestrator.ts`

**Symptom:** `requestAccess()` returns `allowed: false`, but Orchestrator dispatches the task anyway. File lock is advisory-only.

**Fix:** Check `allowed` before dispatch. If `false`, requeue with backoff.

---

### BUG-06: PID Mismatch on Respawn

**File:** `src/kernel/kernel.ts`

**Symptom:** `respawnAgent()` spawns a new PID but the caller retains the old reference. Watchdog loses the agent.

**Fix:** `respawnAgent()` must return the new PID. All call sites must update the mission registry.

---

### BUG-07: Architect Fallback Validation Always Passes

**File:** `src/architect/Architect.ts:125`

**Symptom:** When no test file is found, the fallback contract runs `node -e "console.log('passed')"` — exits 0 always.

**Fix:** Replace with a real sanity check, or fail explicitly when no test file exists.

---

## 6. Recommended Architectural Changes

### Change 1: Add ExecutionMode System
```
src/orchestrator/
├── ExecutionModes.ts     ← NEW: enum + mode handlers
├── Orchestrator.ts       ← MODIFY: route to mode handlers
```

### Change 2: SQLite SwarmDatabase
```
src/state/
├── SwarmDatabase.ts      ← NEW: SQLite atomic claiming
├── StateManager.ts       ← NEW: session recovery
```

### Change 3: ValidationContract System
```
src/validation/
├── contracts.ts          ← NEW: ValidationContract interface
├── update Task.ts         ← MODIFY: add validation field
```

### Change 4: Path DelegationProtocol
```
src/orchestrator/
├── DelegationProtocol.ts ← NEW: path-based delegation
```

### Change 5: Implement TaskEvents Fully
```
src/orchestrator/
├── ParallelExecutor.ts   ← MODIFY: wire up all callbacks
├── Orchestrator.ts      ← MODIFY: implement emitTaskStart/Complete
```

---

## 7. Architecture Decision Record (ADR)

### ADR-001: Keep 4-Layer Hierarchy
**Decision:** Keep L1-L4 but enhance each layer's contracts
**Rationale:** L1 fast-path is unique to Meow, not worth replacing
**Alternatives considered:** Kitchen's 2-layer (rejected — loses fast-path)

### ADR-002: Add Execution Modes to L3
**Decision:** Add AUTOPILOT/RALPH/ECOMODE/PIPELINE modes to SwarmManager
**Rationale:** Kitchen's mode system is proven; meow needs same flexibility
**Alternatives considered:** Custom mode system (rejected — Kitchen already solved it)

### ADR-003: SQLite for Swarm Coordination
**Decision:** Replace FileCoordinator with SQLite SwarmDatabase
**Rationale:** Crash-safe, atomic claiming, heartbeat cleanup
**Alternatives considered:** Redis (rejected — adds external dependency)

### ADR-004: Pre-Hoc Validation Contracts
**Decision:** Add passes flag + tests-before-code to Architect planning
**Rationale:** Factory.ai proved this prevents "almost done" syndrome
**Alternatives considered:** Keep post-hoc only (rejected — no clear done criterion)

### ADR-005: Keep Quantum Innovations
**Decision:** Keep Grover's search and Bell-state entanglement
**Rationale:** Unique to meow, not yet proven but promising
**Changes:** Can be extended to work with validation contracts

---

*Last updated: May 2026*