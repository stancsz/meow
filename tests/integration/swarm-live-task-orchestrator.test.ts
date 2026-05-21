import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { ParallelExecutor, ExecutorConfig, WorkerConfig } from "../../src/orchestrator/ParallelExecutor";
import { TaskQueue } from "../../src/orchestrator/TaskQueue";
import { FileCoordinator } from "../../src/orchestrator/FileCoordinator";
import { SwarmManager } from "../../src/swarm/SwarmManager";
import { PiiFilter } from "../../src/agent/security/PiiFilter";
import { createMockDatabase } from "../fixtures/databases";
import { makeTask } from "../fixtures/tasks";
import { Agent } from "../../src/agent/agent";
import { MeowKernel } from "../../src/kernel/kernel";

describe("Swarm Live Task Orchestrator & Integration Gateway", () => {
  let db: any;
  let kernel: MeowKernel;
  let swarmManager: SwarmManager;

  beforeEach(() => {
    vi.useRealTimers();
    db = createMockDatabase();
    kernel = new MeowKernel(db);
    swarmManager = new SwarmManager(kernel, db, {
      maxConcurrentWorkers: 2,
      sessionTimeoutMs: 10000,
      heartbeatIntervalMs: 5000,
    });
  });

  it("should dynamically balance, resolve locks with backoff, apply validation contracts, and filter PII outputs", async () => {
    const queue = new TaskQueue({ maxQueued: 50, maxConcurrent: 2 });
    const coordinator = new FileCoordinator();
    const config: ExecutorConfig = {
      maxWorkers: 2,
      taskTimeoutMs: 15000,
      enableParallelTools: true,
    };

    const executor = new ParallelExecutor(queue, coordinator, config);

    // Register two specialized workers
    const worker1: WorkerConfig = {
      workerId: "swarm-worker-alpha",
      agentConfig: { model: "claude-3-5-sonnet", baseUrl: "https://api.anthropic.com", apiKey: "sk-mock-key" },
      kernel,
      db,
    };
    const worker2: WorkerConfig = {
      workerId: "swarm-worker-beta",
      agentConfig: { model: "claude-3-5-sonnet", baseUrl: "https://api.anthropic.com", apiKey: "sk-mock-key" },
      kernel,
      db,
    };
    executor.registerWorker(worker1);
    executor.registerWorker(worker2);

    // ── Live Tasks Setup ───────────────────────────────────────────────────────
    
    // Task A: Produces `build.json`. Has a validation contract that checks if build succeeded.
    // Contains PII email addresses to test security gateways.
    const taskA = makeTask({
      id: "task-build-pipeline",
      description: "Compile source directory and log success to build.json for dev@meow-swarm.com",
      producedFiles: [{ path: "build.json", operation: "update" }],
      validationContract: {
        validationScript: "node -e \"console.log('Build output: dev@meow-swarm.com successfully generated build.json.'); process.exit(0);\"",
        expectedOutputs: ["successfully generated"],
      },
    });

    // Task B: Reads `build.json` and produces `release.json`.
    // It collides with Task A on `build.json`, so it must block and wait/backoff until Task A finishes.
    const taskB = makeTask({
      id: "task-release-gate",
      description: "Analyze build.json and deploy release-v1.0.0",
      requiredFiles: ["build.json"],
      producedFiles: [{ path: "release.json", operation: "update" }],
      validationContract: {
        validationScript: "node -e \"console.log('Release generated successfully.'); process.exit(0);\"",
      },
    });

    // Task C: Completely independent, should be run in parallel with Task A instantly.
    const taskC = makeTask({
      id: "task-docs-generator",
      description: "Generate static markup documents under docs/",
      producedFiles: [{ path: "docs/index.html", operation: "update" }],
    });

    // Trace execution ordering and parallelization
    const activeTasks: string[] = [];
    const executionOrder: { task: string; event: "start" | "end" }[] = [];
    
    // Initialize PII filter to verify redacting
    const piiFilter = new PiiFilter("REDACT");

    // Spy on Agent.chat to capture and mock responses and trace operations
    const chatSpy = vi.spyOn(Agent.prototype, "chat").mockImplementation(async function (
      this: Agent,
      goal: string
    ) {
      const currentTaskId = goal.includes("Compile")
        ? "task-build-pipeline"
        : goal.includes("Analyze")
        ? "task-release-gate"
        : "task-docs-generator";

      activeTasks.push(currentTaskId);
      executionOrder.push({ task: currentTaskId, event: "start" });

      // Atomically claim task in SwarmManager to verify DB-level atomic gates
      const claimed = await swarmManager.claimTaskAtomically(currentTaskId, this.runId);
      expect(claimed).toBe(true);

      // Task A takes a little longer to simulate concurrent overlap
      const delay = currentTaskId === "task-build-pipeline" ? 150 : 50;
      await new Promise((resolve) => setTimeout(resolve, delay));

      executionOrder.push({ task: currentTaskId, event: "end" });
      activeTasks.splice(activeTasks.indexOf(currentTaskId), 1);

      // Return output containing an email that must be redacted by our PiiFilter
      if (currentTaskId === "task-build-pipeline") {
        return "Compilation completed for developer dev@meow-swarm.com with API key sk-ant-sid01-123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456.";
      }
      return `Done: ${currentTaskId}`;
    });

    // Track conflict events triggered during backoff scheduling
    const fileConflicts: string[] = [];
    (executor as any).taskEvents = {
      onFileConflict: (taskId: string, conflicts: string[]) => {
        fileConflicts.push(taskId);
      },
    };

    // Queue up the live tasks
    queue.enqueue(taskA);
    queue.enqueue(taskB);
    queue.enqueue(taskC);

    // Run parallel orchestrator execution
    const results = await executor.run();

    // ── Assertions ────────────────────────────────────────────────────────────

    // 1. Assert all tasks completed with full success
    expect(results.get("task-build-pipeline")?.success).toBe(true);
    expect(results.get("task-release-gate")?.success).toBe(true);
    expect(results.get("task-docs-generator")?.success).toBe(true);

    // 2. Assert that Task A and Task B never ran concurrently due to file collision lock gate
    const aStartIdx = executionOrder.findIndex((x) => x.task === "task-build-pipeline" && x.event === "start");
    const aEndIdx = executionOrder.findIndex((x) => x.task === "task-build-pipeline" && x.event === "end");
    const bStartIdx = executionOrder.findIndex((x) => x.task === "task-release-gate" && x.event === "start");

    expect(aStartIdx).toBeLessThan(aEndIdx);
    expect(aEndIdx).toBeLessThan(bStartIdx); // Task A ended fully before Task B started!

    // 3. Assert that Task C ran concurrently or load-balanced smoothly
    expect(executionOrder.some((x) => x.task === "task-docs-generator")).toBe(true);

    // 4. Assert that at least one file conflict was detected and requeued with backoff
    expect(fileConflicts.length).toBeGreaterThan(0);
    expect(fileConflicts).toContain("task-release-gate");

    // 5. Verify the Validation Contract outputs were fully recorded on Task A and Task B
    const valAResult = results.get("task-build-pipeline")!;
    expect(valAResult.passes).toBe(true);
    expect(valAResult.output).toContain("Validation contract passed");
    expect(valAResult.output).toContain("Build output");

    // 6. Verify that PII is properly scrubbed from our agent outputs
    const rawOutput = valAResult.output!;
    const sanitizedOutput = piiFilter.filter(rawOutput);

    expect(sanitizedOutput).toContain("[REDACTED_EMAIL]");
    expect(sanitizedOutput).toContain("[REDACTED_ANTHROPIC_KEY]");
    expect(sanitizedOutput).not.toContain("dev@meow-swarm.com");
    expect(sanitizedOutput).not.toContain("sk-ant-sid01");

    chatSpy.mockRestore();
  });
});
