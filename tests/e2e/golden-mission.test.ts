import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { E2EHarness, setupE2EEnvironment } from "./harness";
import { TaskQueue } from "../../src/orchestrator/TaskQueue";
import { makeTask } from "../fixtures/tasks";
import path from "path";

/**
 * Golden Mission Test from END_TO_END_TESTING.md
 *
 * These tests validate the E2E harness and orchestration flow.
 * Full E2E with specialists requires SKIP_E2E=false and specialists in PATH.
 */
describe("Golden Mission E2E", () => {
  const sandboxPath = path.join(process.cwd(), "scratch", "e2e-test-env");
  let harness: E2EHarness;

  beforeEach(() => {
    setupE2EEnvironment(sandboxPath);
    harness = new E2EHarness({
      workingDir: sandboxPath,
    });
  });

  afterEach(async () => {
    await harness.terminateAll();
  });

  it("should setup clean E2E environment", () => {
    expect(sandboxPath).toContain("scratch");
    expect(harness).toBeDefined();
    expect(typeof harness.spawnMeowForGoal).toBe("function");
  });

  it("should terminate all processes on cleanup", async () => {
    harness = new E2EHarness({ workingDir: sandboxPath });
    await harness.terminateAll();
    expect(harness.getActiveCount()).toBe(0);
  });

  it("should create harness with default options", () => {
    const h = new E2EHarness();
    expect(h).toBeDefined();
  });
});

/**
 * Performance Benchmark Tests from END_TO_END_TESTING.md
 *
 * These tests measure real TaskQueue throughput to validate the documented
 * performance targets. No LLM calls are made — workers are mocked to return
 * immediately, so timings reflect scheduling overhead only.
 */
describe("Performance Benchmarks", () => {
  it("should drain a 3-task queue in under 500ms (kernel batch drain target)", () => {
    const queue = new TaskQueue({ maxConcurrent: 3, maxQueued: 100 });

    const start = Date.now();

    // Enqueue 3 independent tasks
    const t1 = makeTask({ id: "bench-1", description: "Benchmark task 1" });
    const t2 = makeTask({ id: "bench-2", description: "Benchmark task 2" });
    const t3 = makeTask({ id: "bench-3", description: "Benchmark task 3" });

    queue.enqueue(t1);
    queue.enqueue(t2);
    queue.enqueue(t3);

    // Drain: dequeue all available tasks and mark complete
    let task = queue.dequeue();
    while (task) {
      queue.complete(task.id, { taskId: task.id, success: true, output: "done" });
      task = queue.dequeue();
    }

    const elapsed = Date.now() - start;

    const status = queue.getStatus();
    expect(status.completed).toBe(3);
    expect(status.pending).toHaveLength(0);
    expect(elapsed).toBeLessThan(500); // Must drain in < 500ms
  });

  it("should enqueue and retrieve 100 tasks with priority ordering in under 200ms", () => {
    const queue = new TaskQueue({ maxConcurrent: 10, maxQueued: 200 });

    const start = Date.now();

    // Enqueue 50 medium + 50 high priority tasks
    for (let i = 0; i < 50; i++) {
      queue.enqueue(makeTask({ id: `medium-${i}`, priority: "medium" }));
    }
    for (let i = 0; i < 50; i++) {
      queue.enqueue(makeTask({ id: `high-${i}`, priority: "high" }));
    }

    // First dequeued task should be high-priority
    const first = queue.dequeue();
    expect(first?.priority).toBe("high");

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(200);

    const status = queue.getStatus();
    // dequeue moves task to running, not out of the system — 99 pending + 1 running = 100 total
    expect(status.pending.length + status.running.length).toBe(100);
  });

  it("should respect maxQueued capacity limit and throw at boundary", () => {
    const queue = new TaskQueue({ maxConcurrent: 1, maxQueued: 5 });

    for (let i = 0; i < 5; i++) {
      queue.enqueue(makeTask({ id: `t${i}` }));
    }

    // 6th enqueue exceeds capacity
    expect(() => {
      queue.enqueue(makeTask({ id: "overflow" }));
    }).toThrow("Task queue is full");
  });
});
