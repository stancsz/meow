import { describe, it, expect } from "vitest";
import { Task, TaskStatus, TaskPriority, TaskDependency, FileArtifact, TaskResult, HumanSignoff, TestResult, TaskSpec } from "../../src/orchestrator/Task";

describe("Task", () => {
  describe("TaskSpec interface", () => {
    it("has passes boolean field", () => {
      const spec: TaskSpec = {
        description: "test",
        passes: true,
      };
      expect(typeof spec.passes).toBe("boolean");
    });

    it("has qualityScore optional number field", () => {
      const spec: TaskSpec = {
        description: "test",
        passes: true,
        qualityScore: 85,
      };
      expect(typeof spec.qualityScore).toBe("number");
      expect(spec.qualityScore).toBe(85);
    });

    it("qualityScore is optional", () => {
      const spec: TaskSpec = {
        description: "test",
        passes: false,
      };
      expect(spec.qualityScore).toBeUndefined();
    });

    it("has selfReviewNotes optional string field", () => {
      const spec: TaskSpec = {
        description: "test",
        passes: true,
        selfReviewNotes: "All quality gates passed",
      };
      expect(typeof spec.selfReviewNotes).toBe("string");
    });

    it("has humanSignoff optional field", () => {
      const signoff: HumanSignoff = {
        approved: true,
        approver: "reviewer-1",
        timestamp: Date.now(),
      };
      const spec: TaskSpec = {
        description: "test",
        passes: true,
        humanSignoff: signoff,
      };
      expect(spec.humanSignoff).toBeDefined();
      expect(spec.humanSignoff?.approved).toBe(true);
    });
  });

  describe("HumanSignoff interface", () => {
    it("has approved boolean field", () => {
      const signoff: HumanSignoff = {
        approved: true,
        approver: "tester",
        timestamp: 0,
      };
      expect(typeof signoff.approved).toBe("boolean");
    });

    it("has approver string field", () => {
      const signoff: HumanSignoff = {
        approved: false,
        approver: "manager",
        timestamp: 0,
      };
      expect(typeof signoff.approver).toBe("string");
    });

    it("has timestamp number field", () => {
      const now = Date.now();
      const signoff: HumanSignoff = {
        approved: true,
        approver: "admin",
        timestamp: now,
      };
      expect(typeof signoff.timestamp).toBe("number");
      expect(signoff.timestamp).toBe(now);
    });

    it("has optional feedback string field", () => {
      const signoff: HumanSignoff = {
        approved: false,
        approver: "reviewer",
        timestamp: Date.now(),
        feedback: "Needs more testing",
      };
      expect(signoff.feedback).toBe("Needs more testing");
    });
  });

  describe("TestResult interface", () => {
    it("has suite string field", () => {
      const result: TestResult = {
        suite: "unit-tests",
        passed: true,
      };
      expect(typeof result.suite).toBe("string");
    });

    it("has passed boolean field", () => {
      const result: TestResult = {
        suite: "integration",
        passed: false,
      };
      expect(typeof result.passed).toBe("boolean");
    });

    it("has optional coverage number field", () => {
      const result: TestResult = {
        suite: "coverage",
        passed: true,
        coverage: 92.5,
      };
      expect(typeof result.coverage).toBe("number");
      expect(result.coverage).toBe(92.5);
    });

    it("has optional failures array field", () => {
      const result: TestResult = {
        suite: "lint",
        passed: false,
        failures: ["unused variable", "missing return"],
      };
      expect(Array.isArray(result.failures)).toBe(true);
      expect(result.failures).toHaveLength(2);
    });
  });

  describe("Task interface", () => {
    it("has required fields for task execution", () => {
      const task: Task = {
        id: "task-1",
        description: "Implement feature X",
        priority: "high",
        dependencies: [],
        createdAt: Date.now(),
        maxRetries: 3,
        timeoutMs: 30000,
        status: "pending",
      };

      expect(task.id).toBe("task-1");
      expect(task.description).toBeDefined();
      expect(task.priority).toBe("high");
      expect(task.status).toBe("pending");
    });

    it("can have task dependencies", () => {
      const dep: TaskDependency = {
        taskId: "dep-task",
        required: true,
      };
      const task: Task = {
        id: "task-2",
        description: "Dependent task",
        priority: "medium",
        dependencies: [dep],
        createdAt: Date.now(),
        maxRetries: 1,
        timeoutMs: 10000,
        status: "pending",
      };

      expect(task.dependencies).toHaveLength(1);
      expect(task.dependencies[0].taskId).toBe("dep-task");
      expect(task.dependencies[0].required).toBe(true);
    });

    it("can have file artifacts", () => {
      const artifact: FileArtifact = {
        path: "src/example.ts",
        operation: "create",
        content: "export const x = 1;",
      };
      const task: Task = {
        id: "task-3",
        description: "Create file",
        priority: "low",
        dependencies: [],
        createdAt: Date.now(),
        maxRetries: 1,
        timeoutMs: 5000,
        status: "completed",
        producedFiles: [artifact],
      };

      expect(task.producedFiles).toHaveLength(1);
      expect(task.producedFiles?.[0].path).toBe("src/example.ts");
    });

    it("can have TaskResult when completed", () => {
      const result: TaskResult = {
        taskId: "task-4",
        success: true,
        output: "Completed successfully",
        artifacts: [],
      };
      const task: Task = {
        id: "task-4",
        description: "Completed task",
        priority: "medium",
        dependencies: [],
        createdAt: Date.now(),
        completedAt: Date.now(),
        maxRetries: 1,
        timeoutMs: 10000,
        status: "completed",
        result,
      };

      expect(task.result).toBeDefined();
      expect(task.result?.success).toBe(true);
    });
  });
});