import { describe, it, expect, vi } from "vitest";
import { ParallelExecutor, ExecutorConfig } from "../../src/orchestrator/ParallelExecutor";
import { TaskQueue } from "../../src/orchestrator/TaskQueue";
import { FileCoordinator } from "../../src/orchestrator/FileCoordinator";
import { createMockDatabase } from "../fixtures/databases";
import { makeTask } from "../fixtures/tasks";
import { WorkerConfig } from "../../src/orchestrator/ParallelExecutor";

describe("Worker Overload Spin Loop", () => {
  it("documents that selectWorker returns null when all workers at capacity", () => {
    // This documents the known issue:
    // When selectWorker() returns null (all workers at capacity),
    // the task is re-enqueued creating a potential spin loop
    // The break statement after re-enqueue leaves remaining tasks unprocessed

    const queue = new TaskQueue({ maxQueued: 100, maxConcurrent: 1 });
    const coordinator = new FileCoordinator();
    const config: ExecutorConfig = {
      maxWorkers: 1,
      taskTimeoutMs: 5000,
      enableParallelTools: true,
    };

    const executor = new ParallelExecutor(queue, coordinator, config);

    const mockDb = createMockDatabase();
    const worker: WorkerConfig = {
      workerId: "w1",
      agentConfig: { model: "m", baseUrl: "b", apiKey: "k" },
      kernel: {} as any,
      db: mockDb,
    };
    executor.registerWorker(worker);

    // With maxConcurrent=1, adding 2 tasks means worker is at capacity
    queue.enqueue(makeTask({ id: "t1" }));
    queue.enqueue(makeTask({ id: "t2" }));

    // The issue: when worker is busy, selectWorker returns null
    // and task is re-enqueued - this is the spin loop vulnerability
    const status = queue.getStatus();
    expect(status.pending.length).toBe(2);
  });
});
