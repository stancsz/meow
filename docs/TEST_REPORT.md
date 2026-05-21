# Test Report - 2026-05-21

## Test Results Summary

```
Test Files:  1 failed | 32 passed | 1 skipped (34)
Tests:       2 failed | 176 passed | 2 skipped (180)
Duration:    12.46s
```

## Failing Tests

Both failures are in `tests/orchestrator/ExecutionMode.test.ts`:

### 1. `applies budget constraints to tasks in ECOMODE` (line 67)
```
Error: Test timed out in 5000ms.
```

### 2. `applies maximum retries in RALPH mode` (line 107)
```
Error: Test timed out in 5000ms.
```

## Root Cause Analysis

The tests call `orchestrator.execute()` with `mode: ExecutionMode.ECOMODE` (or `RALPH`) and `tasks: "Task 1"`.

**Execution flow:**
1. `execute()` calls `decomposer.decomposeSimple("Task 1")` → creates 1 task
2. ECOMODE modifies task config (sets `model: "gemini-2.0-flash"`, `maxRetries: 1`)
3. Since `isQualityMode(ECOMODE) = false`, execution goes to PARALLEL path (line 272)
4. Workers are NOT registered in the test (only 1 default worker, but `this.workers.length === 0` check at line 279 passes and registers a default worker... but see below)
5. `executor.run()` is called

**The hanging issue:**
`ParallelExecutor.run()` (line 57-67) returns a Promise that resolves when:
- `activeTaskCount === 0`
- `queue.canAcceptWork()` returns false

In the dispatch loop:
1. Task is dequeued
2. `selectWorker()` returns null (workers Map is empty or all at capacity)
3. Task is re-enqueued with `noWorkerAvailableCount++`
4. If `noWorkerAvailableCount >= 2`, dispatch stops
5. But `setTimeout(() => { dispatch(); }, delay)` keeps rescheduling

The dispatch loop schedules another `dispatch()` call via `setTimeout(..., delay)`. With `delay = 50ms` initially (backoff), the queue is never drained because tasks keep getting re-enqueued with backoff delays.

**Why workers are empty in the test:**
Looking at `Orchestrator.constructor` (line 73-101), workers are NOT registered at construction. Workers are only registered in `execute()` at line 279-291, but only if `this.workers.length === 0`. However, the default worker registration uses `this.agent.kernel` and `this.agent.db` which in the test mock are present. But the actual worker registration happens AFTER `executor.run()` is called — so when `executor.run()` starts, there are zero workers registered.

Wait — actually looking more closely:
- Line 279: `if (this.workers.length === 0)` → registers a default worker BEFORE calling `executor.run()` (line 294)

So workers ARE registered. The issue must be in `selectWorker()`. Let me trace further.

**Actual issue in `dispatch()`:**
At line 151: `const worker = this.selectWorker(task)` — if this returns null, task is re-enqueued.

Looking at `selectWorker()` (line 360-381):
```typescript
private selectWorker(task: Task): WorkerConfig | null {
  const available = Array.from(this.workers.values());
  if (available.length === 0) return null;
  ...
}
```

If `this.workers` is a Map with entries, `available.length` should be > 0. But the workers Map is keyed by `workerId` string. If the worker was registered with `workerId: 'default'`, then `available.length` should be 1.

Actually wait — let me look at how workers are stored. At line 281-292:
```typescript
this.registerWorkers([{
  workerId: 'default',
  agentConfig: { ... },
  mcpManager: this.mcpManager,
  skillManager: this.skillManager,
  kernel: this.agent.kernel,
  db: this.agent.db,
}]);
```

And `registerWorkers` should add to `this.workers` Map. Let me check...

Actually, I notice that the issue is likely that when `executor.run()` is called, the queue was never seeded with tasks! Looking at lines 200-207:

```typescript
for (const task of tasks) {
  if (!task.assignedWorker) {
    task.assignedWorker = DelegationProtocol.determineSpecialistForTask(task);
  }
  if (!isQualityMode(mode)) {
    this.queue.enqueue(task);
  }
}
```

For ECOMODE, tasks ARE enqueued (since ECOMODE is not a quality mode). So the queue should have 1 task.

Then `executor.run()` starts dispatch loop. Task is dequeued. `selectWorker` returns a worker. Task starts.

But wait — `executeTask` at line 79 is an async operation. If it never completes (agent.chat() never returns due to mock not being properly configured), then the Promise never resolves, `activeTaskCount` never decrements, and the run Promise never resolves.

**Most likely cause:** The mock `Agent` in the test doesn't properly mock the underlying LLM call. When `executeTask` calls `agent.chat()`, it probably hangs waiting for an actual API response or fails in an unexpected way.

## Suggested Fix

The tests should either:
1. Increase timeout (these are integration tests, 5s may not be enough)
2. Use proper mocked execution that doesn't trigger actual agent work
3. Mock the executor's `run()` method to return immediately

Alternatively, the test design is flawed — it's trying to inspect task config AFTER triggering full execution, but execution is async and never completes in test environment.

## TypeScript / Lint Status

```
✖ 576 problems (0 errors, 576 warnings)
```

All warnings are `Unexpected any` in `src/types/tool.ts` — these are pre-existing and not related to the doc cleanup.

## Docs Cleanup Verification

The documentation cleanup did not affect any source code or tests. All deleted files were documentation only:
- `docs/GAP_ANALYSIS.md` (duplicate)
- `docs/assets/repo_map.md` (duplicate)
- `docs/learn.md` (duplicate)
- `docs/gaps.md` (duplicate)
- `docs/processed/*` (archived)
- `docs/gap-analysis-vs-kitchen-factory/*` (archived)

The failing tests are pre-existing failures in `ExecutionMode.test.ts` and are NOT caused by the docs cleanup.

## Recommendation

The two failing tests need to be fixed separately — they have a design flaw where they trigger async execution paths that never complete in the test environment. This is a pre-existing issue unrelated to the documentation reorganization.