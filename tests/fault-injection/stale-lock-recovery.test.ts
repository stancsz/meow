import { describe, it, expect, vi, beforeEach } from "vitest";
import { FileCoordinator } from "../../src/orchestrator/FileCoordinator";
import { makeTask } from "../fixtures/tasks";

describe("Stale Lock Recovery Never Called", () => {
  it("should release stale locks when called", () => {
    const coordinator = new FileCoordinator();

    // Manually add a stale lock
    const locks = (coordinator as any).locks;
    locks.set("stale.ts", {
      taskId: "old-task",
      path: "stale.ts",
      acquiredAt: Date.now() - 60000, // 1 minute ago
    });

    // releaseStaleLocks() should detect and remove it
    const stale = coordinator.releaseStaleLocks(30000); // 30 second max age

    expect(stale).toContain("stale.ts");
    expect(locks.has("stale.ts")).toBe(false);
  });

  it("should not release fresh locks", () => {
    const coordinator = new FileCoordinator();

    const locks = (coordinator as any).locks;
    locks.set("fresh.ts", {
      taskId: "current-task",
      path: "fresh.ts",
      acquiredAt: Date.now(), // Just acquired
    });

    const stale = coordinator.releaseStaleLocks(30000);

    expect(stale).not.toContain("fresh.ts");
    expect(locks.has("fresh.ts")).toBe(true);
  });

  it("documents that releaseStaleLocks is never called in production", () => {
    // This test is a documentation test showing the gap:
    // releaseStaleLocks() exists but is never invoked anywhere

    const coordinator = new FileCoordinator();
    coordinator.requestAccess("t1", [{ path: "stuck.ts", operation: "update" }]);

    // Set lock to be stale
    const locks = (coordinator as any).locks;
    const lock = locks.get("stuck.ts");
    lock.acquiredAt = Date.now() - 120000; // 2 minutes ago

    // Manually calling it works
    const stale = coordinator.releaseStaleLocks(60000);
    expect(stale).toContain("stuck.ts");

    // But this method is NEVER called in the production code
    // It's only callable but not wired into any lifecycle
  });

  it("should handle mixed fresh and stale locks", () => {
    const coordinator = new FileCoordinator();

    const locks = (coordinator as any).locks;

    // Add stale lock
    locks.set("old.ts", {
      taskId: "old-task",
      path: "old.ts",
      acquiredAt: Date.now() - 120000,
    });

    // Add fresh lock
    locks.set("new.ts", {
      taskId: "new-task",
      path: "new.ts",
      acquiredAt: Date.now(),
    });

    const stale = coordinator.releaseStaleLocks(60000);

    expect(stale).toContain("old.ts");
    expect(stale).not.toContain("new.ts");
    expect(locks.has("old.ts")).toBe(false);
    expect(locks.has("new.ts")).toBe(true);
  });
});
