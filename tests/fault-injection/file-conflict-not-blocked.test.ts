import { describe, it, expect, vi, beforeEach } from "vitest";
import { FileCoordinator } from "../../src/orchestrator/FileCoordinator";
import { makeTask } from "../fixtures/tasks";

describe("File Conflict Not Blocked", () => {
  let coordinator: FileCoordinator;

  beforeEach(() => {
    coordinator = new FileCoordinator();
  });

  it("should detect conflicting file access via wouldConflict", () => {
    // Task 1 writes to file.ts
    const task1 = makeTask({
      id: "t1",
      producedFiles: [{ path: "src/file.ts", operation: "update" }],
    });

    // Task 2 also writes to same file
    const task2 = makeTask({
      id: "t2",
      producedFiles: [{ path: "src/file.ts", operation: "update" }],
    });

    // Task 1 gets access first
    const result1 = coordinator.requestAccess(task1.id, task1.producedFiles!);
    expect(result1.allowed).toBe(true);
    expect(result1.conflicts).toHaveLength(0);

    // Task 2 is blocked (same file write conflict detected)
    const result2 = coordinator.requestAccess(task2.id, task2.producedFiles!);
    expect(result2.allowed).toBe(false); // Blocked due to conflict
    expect(result2.conflicts.length).toBeGreaterThan(0);

    // wouldConflict from task2's perspective should detect the conflict with task1's lock
    const conflicts = coordinator.wouldConflict(task2.id, task2.producedFiles!);
    expect(conflicts.length).toBeGreaterThan(0);
  });

  it("should track file locks but second write is blocked", () => {
    const task1 = makeTask({ id: "t1" });
    const task2 = makeTask({ id: "t2" });

    // Both tasks try to write same file
    coordinator.requestAccess(task1.id, [{ path: "src/app.ts", operation: "update" }]);
    coordinator.requestAccess(task2.id, [{ path: "src/app.ts", operation: "update" }]);

    // Only task1's lock is active
    const locks = coordinator.getLockedFiles();
    expect(locks.size).toBe(1);
    expect(locks.get("src/app.ts")?.taskId).toBe("t1");
  });

  it("documents that file conflicts are only advisory - first task proceeds", () => {
    // This documents the actual behavior: the first task to request access
    // gets the lock and proceeds. The second task is blocked.

    const task1 = makeTask({
      id: "t1",
      producedFiles: [{ path: "src/index.ts", operation: "create" }],
    });

    const task2 = makeTask({
      id: "t2",
      producedFiles: [{ path: "src/index.ts", operation: "create" }],
    });

    // Task 1 gets through
    const result1 = coordinator.requestAccess(task1.id, task1.producedFiles!);
    expect(result1.allowed).toBe(true);

    // Task 2 is blocked
    const result2 = coordinator.requestAccess(task2.id, task2.producedFiles!);
    expect(result2.allowed).toBe(false);

    // Task 2 still runs in practice (orchestrator doesn't enforce this)
    // This is the bug: conflicts are advisory, task2 still proceeds in orchestrator
  });

  it("should handle read and write to same file correctly", () => {
    const task1 = makeTask({
      id: "t1",
      requiredFiles: ["src/app.ts"],
      producedFiles: [{ path: "src/app.ts", operation: "update" }],
    });

    const task2 = makeTask({
      id: "t2",
      requiredFiles: ["src/app.ts"],
      producedFiles: [{ path: "src/app.ts", operation: "update" }],
    });

    // Both want to write - task1 gets it, task2 is blocked
    const result1 = coordinator.requestAccess(task1.id, task1.producedFiles!);
    const result2 = coordinator.requestAccess(task2.id, task2.producedFiles!);

    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(false);
  });
});
