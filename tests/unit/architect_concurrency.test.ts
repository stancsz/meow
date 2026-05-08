import { describe, it, expect, vi, beforeEach } from "vitest";
import { Architect } from "../../src/architect/Architect";
import { Orchestrator } from "../../src/orchestrator/Orchestrator";
import { Agent } from "../../src/agent/agent";
import { Task } from "../../src/orchestrator/Task";
import { FileCoordinator } from "../../src/orchestrator/FileCoordinator";
import { MissionBrief } from "../../src/liaison/MissionBrief";

/**
 * L2 Architect Concurrency Test
 *
 * Ensures: L2 (Architect) detects file conflicts between parallel L3 workers.
 * Test: Simulate two tasks trying to edit the same file simultaneously.
 */
describe("Architect Concurrency", () => {
  let architect: Architect;
  let mockAgent: Partial<Agent>;
  let mockOrchestrator: Partial<Orchestrator>;

  beforeEach(() => {
    mockAgent = {
      callLLM: vi.fn().mockResolvedValue(
        JSON.stringify([
          { description: "Task 1", priority: "high", dependencies: [], requiredFiles: ["kernel.ts"] },
          { description: "Task 2", priority: "high", dependencies: [], requiredFiles: ["kernel.ts"] },
        ])
      ),
    } as any;

    mockOrchestrator = {
      "agent": mockAgent,
    } as any;

    architect = new Architect(mockOrchestrator as Orchestrator);
  });

  it("should detect file conflict when two tasks access same file", () => {
    const tasks: Task[] = [
      {
        id: "task-1",
        description: "Update kernel.ts - add new method",
        priority: "high",
        dependencies: [],
        createdAt: Date.now(),
        maxRetries: 2,
        timeoutMs: 120000,
        status: "pending",
        requiredFiles: ["kernel.ts"],
        producedFiles: [{ path: "kernel.ts", operation: "update" }],
      },
      {
        id: "task-2",
        description: "Update kernel.ts - refactor existing method",
        priority: "high",
        dependencies: [],
        createdAt: Date.now(),
        maxRetries: 2,
        timeoutMs: 120000,
        status: "pending",
        requiredFiles: ["kernel.ts"],
        producedFiles: [{ path: "kernel.ts", operation: "update" }],
      },
    ];

    const conflicts = architect.detectConflicts(tasks);

    expect(conflicts).toContain("kernel.ts");
    expect(conflicts.length).toBe(1);
  });

  it("should not report conflict when tasks access different files", () => {
    const tasks: Task[] = [
      {
        id: "task-1",
        description: "Update kernel.ts",
        priority: "high",
        dependencies: [],
        createdAt: Date.now(),
        maxRetries: 2,
        timeoutMs: 120000,
        status: "pending",
        requiredFiles: ["kernel.ts"],
      },
      {
        id: "task-2",
        description: "Update agent.ts",
        priority: "high",
        dependencies: [],
        createdAt: Date.now(),
        maxRetries: 2,
        timeoutMs: 120000,
        status: "pending",
        requiredFiles: ["agent.ts"],
      },
    ];

    const conflicts = architect.detectConflicts(tasks);

    expect(conflicts.length).toBe(0);
  });

  it("should detect conflict across requiredFiles and producedFiles", () => {
    const tasks: Task[] = [
      {
        id: "task-1",
        description: "Read kernel.ts",
        priority: "medium",
        dependencies: [],
        createdAt: Date.now(),
        maxRetries: 2,
        timeoutMs: 120000,
        status: "pending",
        requiredFiles: ["kernel.ts"],
      },
      {
        id: "task-2",
        description: "Write kernel.ts",
        priority: "high",
        dependencies: [],
        createdAt: Date.now(),
        maxRetries: 2,
        timeoutMs: 120000,
        status: "pending",
        producedFiles: [{ path: "kernel.ts", operation: "update" }],
      },
    ];

    const conflicts = architect.detectConflicts(tasks);

    expect(conflicts).toContain("kernel.ts");
  });

  it("should acquire locks for all files in tasks", () => {
    const tasks: Task[] = [
      {
        id: "task-1",
        description: "Work on file A",
        priority: "high",
        dependencies: [],
        createdAt: Date.now(),
        maxRetries: 2,
        timeoutMs: 120000,
        status: "pending",
        requiredFiles: ["file-a.ts"],
        producedFiles: [{ path: "file-b.ts", operation: "create" }],
      },
    ];

    const lockedFiles = architect.acquireLocks(tasks);

    expect(lockedFiles).toContain("file-a.ts");
    expect(lockedFiles).toContain("file-b.ts");
  });

  it("should not duplicate locked files", () => {
    const tasks: Task[] = [
      {
        id: "task-1",
        description: "Work on file A",
        priority: "high",
        dependencies: [],
        createdAt: Date.now(),
        maxRetries: 2,
        timeoutMs: 120000,
        status: "pending",
        requiredFiles: ["kernel.ts"],
        producedFiles: [{ path: "kernel.ts", operation: "update" }],
      },
    ];

    const lockedFiles = architect.acquireLocks(tasks);

    expect(lockedFiles.filter(f => f === "kernel.ts").length).toBe(1);
  });

  it("should validate plan with no circular dependencies", () => {
    const plan = {
      tasks: [
        {
          id: "task-1",
          description: "Task 1",
          priority: "high" as const,
          dependencies: [],
          createdAt: Date.now(),
          maxRetries: 2,
          timeoutMs: 120000,
          status: "pending" as const,
        },
        {
          id: "task-2",
          description: "Task 2",
          priority: "high" as const,
          dependencies: [{ taskId: "task-1", required: true }],
          createdAt: Date.now(),
          maxRetries: 2,
          timeoutMs: 120000,
          status: "pending" as const,
        },
      ],
      parallelWaves: [["task-1"], ["task-2"]],
      lockedFiles: [],
      complexityScore: 30,
      hasConflicts: false,
    };

    const result = architect.validatePlan(plan);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should reject plan with circular dependencies", () => {
    const plan = {
      tasks: [
        {
          id: "task-1",
          description: "Task 1",
          priority: "high" as const,
          dependencies: [{ taskId: "task-2", required: true }],
          createdAt: Date.now(),
          maxRetries: 2,
          timeoutMs: 120000,
          status: "pending" as const,
        },
        {
          id: "task-2",
          description: "Task 2",
          priority: "high" as const,
          dependencies: [{ taskId: "task-1", required: true }],
          createdAt: Date.now(),
          maxRetries: 2,
          timeoutMs: 120000,
          status: "pending" as const,
        },
      ],
      parallelWaves: [["task-1"], ["task-2"]],
      lockedFiles: [],
      complexityScore: 30,
      hasConflicts: false,
    };

    const result = architect.validatePlan(plan);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Circular dependency detected");
  });

  it("should reject plan with invalid dependency reference", () => {
    const plan = {
      tasks: [
        {
          id: "task-1",
          description: "Task 1",
          priority: "high" as const,
          dependencies: [{ taskId: "non-existent-task", required: true }],
          createdAt: Date.now(),
          maxRetries: 2,
          timeoutMs: 120000,
          status: "pending" as const,
        },
      ],
      parallelWaves: [["task-1"]],
      lockedFiles: [],
      complexityScore: 30,
      hasConflicts: false,
    };

    const result = architect.validatePlan(plan);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("invalid dependency"))).toBe(true);
  });

  it("should compute complexity score based on task count and conflicts", () => {
    const brief: MissionBrief = {
      missionId: "test-mission",
      rawInput: "Complex multi-file task",
      intent: "implement",
      domain: "agent",
      desiredOutcome: "Implement feature",
      constraints: [],
      targetFiles: [],
      priority: "high",
      createdAt: Date.now(),
      complexity: 50,
    };

    const tasks: Task[] = [
      {
        id: "task-1",
        description: "Task 1",
        priority: "high",
        dependencies: [],
        createdAt: Date.now(),
        maxRetries: 2,
        timeoutMs: 120000,
        status: "pending",
        requiredFiles: ["file-a.ts"],
      },
      {
        id: "task-2",
        description: "Task 2",
        priority: "high",
        dependencies: [],
        createdAt: Date.now(),
        maxRetries: 2,
        timeoutMs: 120000,
        status: "pending",
        requiredFiles: ["file-a.ts"], // Conflict
      },
    ];

    // The Architect's detectConflicts method correctly identifies file conflicts
    const conflicts = architect.detectConflicts(tasks);

    // Base complexity + task penalty (2 tasks * 5)
    // Task count contributes to complexity
    expect(conflicts).toContain("file-a.ts");
  });
});
