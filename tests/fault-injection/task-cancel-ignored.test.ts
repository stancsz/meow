import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskQueue } from "../../src/orchestrator/TaskQueue";
import { makeTask } from "../fixtures/tasks";

describe("Task Cancel Ignored", () => {
  it("should cancel pending task successfully", () => {
    const queue = new TaskQueue();

    queue.enqueue(makeTask({ id: "t1" }));
    const result = queue.cancel("t1");

    // Cancel returns true for pending task
    expect(result).toBe(true);
    expect(queue.getStatus().pending.length).toBe(0);
  });

  it("should return false for running task (not in pending array)", () => {
    const queue = new TaskQueue();

    queue.enqueue(makeTask({ id: "t1" }));

    // Manually move task to running (via dequeue + simulate running)
    const task = queue.dequeue();
    expect(task).not.toBeNull();

    const result = queue.cancel("t1");

    // Cancel returns false for running task - it's in running map, not pending
    expect(result).toBe(false);
  });

  it("should return false for completed task", () => {
    const queue = new TaskQueue();

    queue.enqueue(makeTask({ id: "t1" }));
    const task = queue.dequeue();

    // Complete the task
    queue.complete(task!.id, { taskId: task!.id, success: true });

    const result = queue.cancel("t1");

    expect(result).toBe(false);
  });

  it("should return false for failed task", () => {
    const queue = new TaskQueue();

    queue.enqueue(makeTask({ id: "t1" }));
    const task = queue.dequeue();

    // Fail the task
    queue.complete(task!.id, { taskId: task!.id, success: false, error: "test" });

    const result = queue.cancel("t1");

    expect(result).toBe(false);
  });

  it("should return false for unknown task", () => {
    const queue = new TaskQueue();

    const result = queue.cancel("nonexistent");

    // Returns false for unknown task
    expect(result).toBe(false);
  });
});
