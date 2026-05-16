# MEOW QUALITY-FIRST ARCHITECTURE
## Production-Maturity Harness — Not a POC, Not a Factory Assembly Line

---

## Philosophy: Craftsman Over Factory

> "A harness that ships one perfect feature is better than one that ships ten broken ones."

Meow's core thesis: **Quality is the constraint, not speed.** A piece of work is done only when it meets production-readiness standards — not when a timer runs out.

Kitchen (Factory.ai) optimizes for throughput (8 execution modes, parallel fan-out).
Meow optimizes for correctness (verification loops, self-review, human sign-off).

These are fundamentally different goals. Meow does NOT try to beat Kitchen at speed. Meow beats Kitchen at depth.

---

## Core Execution Loop (Quality-First)

```
[1] RECEIVE MISSION
    └─ L1 Liaison: Intent extraction + clarification with human
           ↓
[2] SPECIFY (TaskSpec)
    └─ L2 Architect: Write explicit acceptance criteria
    └─ Agent + human co-sign the spec
           ↓
[3] EXECUTE (single-agent, not parallel fan-out)
    └─ L3 SwarmManager: Sequential execution with embedded self-review
    └─ FileCoordinator: SQLite IMMEDIATE transaction (blocking, not advisory)
           ↓
[4] VERIFY GATES (all must pass)
    ├─ lint / type check
    ├─ unit tests (must cover ≥ 80%)
    ├─ integration tests (if applicable)
    ├─ visual QA (screenshot diff if UI changed)
    ├─ security scan (no hardcoded secrets, no injection vectors)
    └─ coherence check (no TODOs, no placeholders, no hallucinations)
           ↓ (any fail → back to step 3)
           ↓
[5] HUMAN SIGN-OFF
    └─ L1 Liaison: "Does this meet production standard?"
    └─ Human explicitly approves → proceed
    └─ Human rejects → refine, back to step 3
           ↓
[6] DELIVERABLE COMPLETE
    └─ L4 Auditor: Final audit + improvement log
    └─ Record what was fixed for next time (Quantum Memory)
```

---

## Execution Modes (Quality-First Routing)

The Orchestrator routes execution through modes. Default = `ship` (full quality pipeline).

| Mode | Behavior | When to Use |
|------|----------|-------------|
| `verify` | Self-review only, no code changes | Quick sanity check |
| `polish` | Improve quality without adding features | Cleanup, refactor |
| `fix` | Correct known defects only | Bug fix |
| `audit` | Full production-readiness check | Pre-merge |
| `ship` | verify + polish + audit + human sign-off | **Default** — anything going to production |

**Critical:** Default mode is `ship`, not raw execution. Kitchen/Factory defaults to raw execution with optional `passes` flag. Meow defaults to full quality pipeline and requires explicit opt-out to skip gates.

---

## Architectural Changes Required

### 1. Execution Mode Routing (Orchestrator)

**Current (parallel-only):**
```typescript
// Orchestrator.execute() — purely parallel
tasks = await this.decomposer.decompose(request);
for (const task of tasks) {
  this.queue.enqueue(task);  // all parallel
}
const results = await this.executor.run();
```

**Required (mode-aware):**
```typescript
enum ExecutionMode {
  PARALLEL,   // Kitchen's approach — fast, less verified
  SEQUENTIAL, // Quality-first — one at a time with self-review
  AUDIT_ONLY, // Verify without executing
}

switch (mode) {
  case SEQUENTIAL:
    for (const task of tasks) {
      await executeWithSelfReview(task);  // self-review after each
      if (!passesQualityGates(task)) {
        await refine(task);  // correct before moving on
      }
    }
  case PARALLEL:
    // Kitchen-style fan-out with file conflict detection
}
```

### 2. SQLite FileCoordinator (Blocking, Not Advisory)

**Current (in-memory Map):**
```typescript
// FileCoordinator.ts
private locks: Map<string, Lock> = new Map();
wouldConflict(taskId, files): string[] {
  // Returns conflicts but doesn't block — advisory only
}
```

**Required (SQLite IMMEDIATE transaction):**
```typescript
// SQLite BEGIN IMMEDIATE — blocks other writers until commit
async acquire(path: string, taskId: string): Promise<boolean> {
  // BEGIN IMMEDIATE
  // If lock exists → retry or fail
  // If acquired → hold until release()
}
async release(taskId: string): Promise<void> {
  // COMMIT — releases the IMMEDIATE transaction
}
```

**Why:** In-memory advisory means concurrent tasks can corrupt each other if timing races. SQLite `BEGIN IMMEDIATE` is atomic — second writer blocks until first commits.

### 3. TaskSpec with `passes` Flag (Structured Handoff)

**Current (raw strings):**
```typescript
interface Task {
  description: string;
  producedFiles?: FileArtifact[];
  // No structured input/output schema
}
```

**Required (structured handoff):**
```typescript
interface TaskSpec {
  id: string;
  input: {
    files: string[];
    context: string;
    acceptanceCriteria: string[];  // explicit checklist
  };
  output: {
    files: FileArtifact[];
    testResults?: TestResult[];
    visualQA?: VisualQAResult;
  };
  passes: boolean;  // gates completion — must be explicit
  qualityScore?: number;  // 0-100
  selfReviewNotes?: string;
  humanSignoff?: { approved: boolean; by: string; at: number };
}

interface TestResult {
  suite: string;
  passed: boolean;
  coverage?: number;
  failures?: string[];
}
```

**Kitchen's approach:** JSON feature list with optional `passes` field (post-hoc).
**Meow's approach:** `passes` is mandatory — gates the task from completing.

### 4. Self-Review Loop (Sequential Execution)

**Kitchen:** Executes all tasks in parallel, audit is post-hoc (after all complete).

**Meow:** Agent self-reviews after each deliverable before moving to next.

```typescript
async executeWithSelfReview(task: Task): Promise<TaskResult> {
  const result = await executeTask(task);           // step 3
  const review = await selfReview(task, result);     // embedded verification
  if (!review.passes) {
    await refine(task, review.issues);              // correct immediately
    return executeWithSelfReview(task);             // retry until pass
  }
  return result;
}

async selfReview(task: Task, result: TaskResult): Promise<ReviewResult> {
  // 1. Run linter + type checker
  // 2. Run unit tests (fail if < 80% coverage)
  // 3. If UI files changed → visual QA check
  // 4. Check for TODOs/placeholders
  // 5. Coherence check (goal vs output alignment)
  return { passes: boolean, issues: string[], qualityScore: number };
}
```

### 5. Visual QA Step

**Gap:** Kitchen and Meow both lack explicit visual QA for UI changes.

**Required when UI files changed:**
```typescript
interface VisualQAResult {
  screenshotsTaken: string[];
  diffScore: number;  // 0 = identical, 100 = completely different
  approved: boolean;
  issues?: string[];
}

//触发条件
if (task.producedFiles?.some(f => isUIFile(f.path))) {
  await captureScreenshots(url);
  await diffAgainst(baselineScreenshot);
}
```

### 6. Human Sign-Off Checkpoint

**Gap:** Agent can ship without human ever seeing the output.

**Required:**
```typescript
interface HumanSignoff {
  approved: boolean;
  approver: string;
  timestamp: number;
  feedback?: string;  // if rejected
}

// In Orchestrator.execute()
if (mode === 'ship') {
  const humanApproval = await requestHumanApproval(deliverable);
  if (!humanApproval.approved) {
    // refine based on feedback, back to execute
  }
}
```

### 7. Improvement Log (Self-Correction Memory)

**Kitchen:** No persistent memory of corrections between missions.

**Meow (Quantum Memory):**
```typescript
interface ImprovementLog {
  missionId: string;
  iterations: {
    attempt: number;
    issues: string[];
    fixes: string[];
    qualityScore: number;
  }[];
  finalQualityScore: number;
  timeSpentMs: number;
}
```

Records what was wrong, what was fixed, and how long it took. Future similar tasks can reference this to avoid repeating mistakes.

---

## Comparison: Kitchen vs Meow (Quality Lens)

| Aspect | Kitchen (Factory.ai) | Meow (Quality-First) |
|--------|---------------------|----------------------|
| Default execution | Parallel fan-out | Sequential with self-review |
| Verification timing | Post-hoc (after all complete) | Continuous (after each deliverable) |
| `passes` flag | Optional, post-hoc | Mandatory, gates completion |
| File coordination | Advisory (in-memory) | Blocking (SQLite IMMEDIATE) |
| Quality gates | Opt-in via JSON flag | Default in `ship` mode |
| Human sign-off | Not required | Required for production |
| Visual QA | None | Triggered when UI files change |
| Self-correction | None | Loop until quality gates pass |
| Improvement memory | None | Quantum memory of corrections |
| Coherence check | Post-hoc audit | Embedded in execution loop |
| Intent clarification | Implicit (brief) | Explicit with human co-sign |

---

## Factory.ai Kitchen: What Meow Should NOT Copy

1. **Parallel fan-out as default** — leads to race conditions, file conflicts, no self-review
2. **Post-hoc audit only** — quality gates should be inline, not after the fact
3. **Advisory file coordination** — in-memory Map can corrupt on timing races
4. **No human sign-off** — hallucinations can slip through without human ever seeing output
5. **No visual QA** — UI can look broken without anyone noticing until user complains
6. **No improvement memory** — agent repeats the same mistakes across missions

---

## Factory.ai Kitchen: What Meow SHOULD Copy

1. **`passes` flag as completion gate** — excellent pattern, Meow should make it mandatory
2. **Structured TaskSpec input/output** — explicit contracts between layers
3. **Intent clarification with human** — L1 fast-path for catching misalignment early
4. **Session recovery** — long-running missions need to resume after crash
5. **Multi-context window management** — Anthropic's approach to maintaining state across context boundaries

---

## Implementation Priority

### Phase 1 (Must Have — Production Ready)
1. Execution mode routing in Orchestrator (PARALLEL vs SEQUENTIAL vs SHIP)
2. SQLite FileCoordinator with IMMEDIATE transactions (replace in-memory Map)
3. TaskSpec with `passes` flag (mandatory gate)
4. Self-review loop after each task (sequential mode)
5. Quality gate orchestrator (lint → type → test → coverage → visual QA)

### Phase 2 (Should Have — Production Mature)
6. Human sign-off checkpoint before deliverable completion
7. Visual QA step triggered when UI files change
8. Improvement log (Quantum Memory of corrections)
9. Visual verification report (before/after screenshots)

### Phase 3 (Nice to Have — Production Excellence)
10. Coherence scoring with pass threshold (≥ 80% to ship)
11. Security scan integration (no hardcoded secrets)
12. Performance regression detection (baseline metrics)
13. Accessibility audit (WCAG compliance check)

---

## File Changes Required

| File | Change | Priority |
|------|--------|----------|
| `src/orchestrator/Orchestrator.ts` | Add `ExecutionMode` enum + route by mode | P1 |
| `src/orchestrator/FileCoordinator.ts` | Replace Map with SQLite `BEGIN IMMEDIATE` | P1 |
| `src/orchestrator/Task.ts` | Add `TaskSpec` interface with `passes` flag | P1 |
| `src/swarm/SwarmManager.ts` | Add `SEQUENTIAL` mode with self-review loop | P1 |
| `src/auditor/Auditor.ts` | Add `visualQA()` method + `VisualQAResult` | P2 |
| `src/liaison/MissionBrief.ts` | Add `humanSignoff` field | P2 |
| `src/agent/quantum_memory.ts` | Add `ImprovementLog` persistence | P2 |
| `src/orchestrator/ParallelExecutor.ts` | Add `mode: ExecutionMode` parameter | P1 |

---

## Verification Checklist (Ship Mode)

Before any deliverable is marked `passes: true`, ALL must be true:

- [ ] `lint` passes with no errors
- [ ] `typecheck` passes with no errors
- [ ] `unit tests` pass with ≥ 80% coverage
- [ ] `integration tests` pass (if applicable)
- [ ] `visual QA` passes (if UI files changed)
- [ ] `security scan` finds no hardcoded secrets or injection vectors
- [ ] `coherence check` score ≥ 80%
- [ ] `no TODOs / FIXMEs / placeholders` in diff
- [ ] `human sign-off` explicitly approved
- [ ] `improvement log` recorded in Quantum Memory

---

## Summary

Meow's competitive advantage over Kitchen is **quality depth**, not **execution speed**.

- Kitchen ships fast and audits later
- Meow ships slow and verifies continuously

For production-grade work where hallucinations, misinterpretations, and shoddy quality are unacceptable, Meow's quality-first approach wins. Kitchen is a factory. Meow is a craftsman's workshop.

**Goal: Every deliverable from Meow should be production-ready on first deploy, not "good enough for a POC."**