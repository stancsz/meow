import { describe, it, expect, vi } from "vitest";
import { TaskQueue } from "../../src/orchestrator/TaskQueue";
import { makeTask } from "../fixtures/tasks";

describe("Queue Full Failure Mode", () => {
  it("should throw when queue is at capacity and task is lost", () => {
    const queue = new TaskQueue({ maxQueued: 2, maxConcurrent: 1 });

    // Fill the queue to capacity
    queue.enqueue(makeTask({ id: "t1" }));
    queue.enqueue(makeTask({ id: "t2" }));

    // This should throw - the task should NOT be silently dropped
    expect(() => queue.enqueue(makeTask({ id: "t3" }))).toThrow("Task queue is full");
  });

  it("should not throw when queue has space", () => {
    const queue = new TaskQueue({ maxQueued: 3, maxConcurrent: 1 });

    queue.enqueue(makeTask({ id: "t1" }));
    queue.enqueue(makeTask({ id: "t2" }));

    // Should not throw - capacity not reached
    expect(() => queue.enqueue(makeTask({ id: "t3" }))).not.toThrow();
  });

  it("should report correct pending count when at capacity", () => {
    const queue = new TaskQueue({ maxQueued: 2, maxConcurrent: 1 });

    queue.enqueue(makeTask({ id: "t1" }));
    queue.enqueue(makeTask({ id: "t2" }));

    const status = queue.getStatus();
    expect(status.pending.length).toBe(2);
    // maxQueued is the total (pending + running), not just pending
    // So with maxQueued=2 and maxConcurrent=1, we can have 2 pending
    expect(status.pending.length).toBeLessThanOrEqual(2);
  });
});
