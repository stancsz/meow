import { describe, it, expect, vi } from "vitest";
import { TaskQueue } from "../../src/orchestrator/TaskQueue";
import { makeTask } from "../fixtures/tasks";

describe("Soft Dependency Validation", () => {
  it("should not run task with failed hard dependency", () => {
    const queue = new TaskQueue();

    const taskA = makeTask({ id: "tA" });
    queue.enqueue(taskA);
    const depTask = queue.dequeue();
    queue.complete(depTask!.id, { taskId: depTask!.id, success: false });

    const taskB = makeTask({
      id: "tB",
      dependencies: [{ taskId: "tA", required: true }],
    });

    queue.enqueue(taskB);

    // Hard dependency blocks task B from running
    expect(queue.dequeue()).toBeNull();
  });

  it("should allow task with successful soft dependency to proceed", () => {
    const queue = new TaskQueue();

    const taskA = makeTask({ id: "tA" });
    queue.enqueue(taskA);
    const depTask = queue.dequeue();
    queue.complete(depTask!.id, { taskId: depTask!.id, success: true });

    const taskB = makeTask({
      id: "tB",
      dependencies: [{ taskId: "tA", required: false }],
    });

    queue.enqueue(taskB);

    const bTask = queue.dequeue();
    expect(bTask).not.toBeNull();
  });

  it("should allow soft dependency to proceed even if dep failed", () => {
    // FIXED: Soft dependencies now proceed if the dep exists (was attempted),
    // regardless of success/failure
    const queue = new TaskQueue();

    const taskA = makeTask({ id: "tA" });
    queue.enqueue(taskA);
    const depTask = queue.dequeue();
    queue.complete(depTask!.id, { taskId: depTask!.id, success: false });

    const taskB = makeTask({
      id: "tB",
      dependencies: [{ taskId: "tA", required: false }],
    });

    queue.enqueue(taskB);

    // Soft dependency now allows B to proceed even though A failed
    const bTask = queue.dequeue();
    expect(bTask).not.toBeNull();
  });
});
