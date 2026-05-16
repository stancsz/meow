import { describe, it, expect, beforeEach } from "vitest";
import { HumanSignoffManager } from "../../src/liaison/HumanSignoffManager";
import { HumanSignoff } from "../../src/orchestrator/Task";

describe("HumanSignoffManager", () => {
  let manager: HumanSignoffManager;

  beforeEach(() => {
    manager = new HumanSignoffManager();
  });

  describe("requestSignoff", () => {
    it("creates a pending signoff", async () => {
      const taskSpec = { description: "Implement feature X" };
      const result = await manager.requestSignoff("task-1", "Feature X implementation", taskSpec);

      expect(result).toBeDefined();
      expect(result.approved).toBe(false);
      expect(result.approver).toBe("");
      expect(result.timestamp).toBe(0);

      const pending = manager.getPendingSignoffs();
      expect(pending).toHaveLength(1);
      expect(pending[0].taskId).toBe("task-1");
      expect(pending[0].deliverable).toBe("Feature X implementation");
    });

    it("can request multiple signoffs for different tasks", async () => {
      await manager.requestSignoff("task-1", "Deliverable 1", { description: "Task 1" });
      await manager.requestSignoff("task-2", "Deliverable 2", { description: "Task 2" });

      const pending = manager.getPendingSignoffs();
      expect(pending).toHaveLength(2);
    });
  });

  describe("approve", () => {
    it("marks signoff as approved", () => {
      manager.requestSignoff("task-1", "Feature X", { description: "Task" });

      manager.approve("task-1", "reviewer-1", "LGTM");

      const pending = manager.getPendingSignoffs();
      expect(pending).toHaveLength(0);

      const history = manager.getSignoffHistory();
      expect(history).toHaveLength(1);
      expect(history[0].approved).toBe(true);
      expect(history[0].approver).toBe("reviewer-1");
      expect(history[0].feedback).toBe("LGTM");
    });

    it("can approve without feedback", () => {
      manager.requestSignoff("task-1", "Feature X", { description: "Task" });

      manager.approve("task-1", "admin");

      const history = manager.getSignoffHistory();
      expect(history[0].approved).toBe(true);
      expect(history[0].approver).toBe("admin");
      expect(history[0].feedback).toBeUndefined();
    });
  });

  describe("reject", () => {
    it("marks signoff as rejected with feedback", () => {
      manager.requestSignoff("task-1", "Feature X", { description: "Task" });

      manager.reject("task-1", "reviewer-2", "Needs more work");

      const pending = manager.getPendingSignoffs();
      expect(pending).toHaveLength(0);

      const history = manager.getSignoffHistory();
      expect(history).toHaveLength(1);
      expect(history[0].approved).toBe(false);
      expect(history[0].approver).toBe("reviewer-2");
      expect(history[0].feedback).toBe("Needs more work");
    });

    it("rejected signoff has timestamp set", () => {
      manager.requestSignoff("task-1", "Feature X", { description: "Task" });
      const beforeReject = Date.now();

      manager.reject("task-1", "reviewer", "Failed review");

      const history = manager.getSignoffHistory();
      expect(history[0].timestamp).toBeGreaterThanOrEqual(beforeReject);
    });
  });

  describe("getPendingSignoffs", () => {
    it("returns pending items only", async () => {
      await manager.requestSignoff("task-1", "First", { description: "1" });
      await manager.requestSignoff("task-2", "Second", { description: "2" });

      const pending = manager.getPendingSignoffs();
      expect(pending).toHaveLength(2);
    });

    it("returns empty array when no pending signoffs", () => {
      const pending = manager.getPendingSignoffs();
      expect(pending).toHaveLength(0);
    });

    it("clears pending after approve or reject", () => {
      manager.requestSignoff("task-1", "Feature", { description: "Task" });
      manager.approve("task-1", "reviewer");

      const pending = manager.getPendingSignoffs();
      expect(pending).toHaveLength(0);
    });
  });

  describe("getSignoffHistory", () => {
    it("returns all signoffs including approved and rejected", () => {
      manager.requestSignoff("task-1", "Feature 1", { description: "1" });
      manager.requestSignoff("task-2", "Feature 2", { description: "2" });
      manager.requestSignoff("task-3", "Feature 3", { description: "3" });

      manager.approve("task-1", "admin");
      manager.reject("task-2", "reviewer", "Not ready");
      manager.approve("task-3", "lead");

      const history = manager.getSignoffHistory();
      expect(history).toHaveLength(3);
      expect(history.filter(h => h.approved)).toHaveLength(2);
      expect(history.filter(h => !h.approved)).toHaveLength(1);
    });

    it("returns a copy of history, not the original", () => {
      manager.requestSignoff("task-1", "Feature", { description: "Task" });
      manager.approve("task-1", "admin");

      const history1 = manager.getSignoffHistory();
      const history2 = manager.getSignoffHistory();

      expect(history1).not.toBe(history2);
      expect(history1).toEqual(history2);
    });

    it("returns empty array when no signoffs recorded", () => {
      const history = manager.getSignoffHistory();
      expect(history).toHaveLength(0);
    });
  });
});