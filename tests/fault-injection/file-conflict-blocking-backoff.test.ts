import { describe, it, expect, vi } from "vitest";
import { ParallelExecutor, ExecutorConfig, WorkerConfig } from "../../src/orchestrator/ParallelExecutor";
import { TaskQueue } from "../../src/orchestrator/TaskQueue";
import { FileCoordinator } from "../../src/orchestrator/FileCoordinator";
import { createMockDatabase } from "../fixtures/databases";
import { makeTask } from "../fixtures/tasks";
import { Agent } from "../../src/agent/agent";

describe("File Conflict Blocking and Backoff", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("should actively block conflicting tasks and execute them sequentially with backoff", async () => {
    const queue = new TaskQueue({ maxQueued: 100, maxConcurrent: 2 });
    const coordinator = new FileCoordinator();
    const config: ExecutorConfig = {
      maxWorkers: 2,
      taskTimeoutMs: 5000,
      enableParallelTools: true,
    };

    const executor = new ParallelExecutor(queue, coordinator, config);

    const mockDb = createMockDatabase();
    const worker1: WorkerConfig = {
      workerId: "w1",
      agentConfig: { model: "m", baseUrl: "b", apiKey: "k" },
      kernel: {} as any,
      db: mockDb,
    };
    const worker2: WorkerConfig = {
      workerId: "w2",
      agentConfig: { model: "m", baseUrl: "b", apiKey: "k" },
      kernel: {} as any,
      db: mockDb,
    };
    executor.registerWorker(worker1);
    executor.registerWorker(worker2);

    // Task 1 and Task 2 both produce/write to conflict.ts
    const task1 = makeTask({
      id: "t1",
      producedFiles: [{ path: "src/conflict.ts", operation: "update" }],
      description: "Writes to conflict.ts",
    });

    const task2 = makeTask({
      id: "t2",
      producedFiles: [{ path: "src/conflict.ts", operation: "update" }],
      description: "Also writes to conflict.ts",
    });

    queue.enqueue(task1);
    queue.enqueue(task2);

    const activeExecutions: string[] = [];
    const executionOrder: string[] = [];

    // Mock Agent.chat to simulate some delay and trace execution
    const chatSpy = vi.spyOn(Agent.prototype, "chat").mockImplementation(async function(this: Agent, goal: string) {
      const currentTaskGoal = goal.includes("Also") ? "t2" : "t1";
      
      activeExecutions.push(currentTaskGoal);
      executionOrder.push(`start-${currentTaskGoal}`);
      
      // Keep it active for 100ms
      await new Promise(resolve => setTimeout(resolve, 100));
      
      activeExecutions.splice(activeExecutions.indexOf(currentTaskGoal), 1);
      executionOrder.push(`end-${currentTaskGoal}`);
      return "Done";
    });

    const conflictEvents: { taskId: string; conflicts: string[] }[] = [];
    (executor as any).taskEvents = {
      onFileConflict: (taskId: string, conflicts: string[]) => {
        conflictEvents.push({ taskId, conflicts });
      }
    };

    // Run parallel executor
    const results = await executor.run();

    // Verify both tasks succeeded
    expect(results.get("t1")?.success).toBe(true);
    expect(results.get("t2")?.success).toBe(true);

    // Verify a conflict event was fired for task t2
    expect(conflictEvents.length).toBeGreaterThan(0);
    expect(conflictEvents.some(e => e.taskId === "t2")).toBe(true);

    // Verify they never ran concurrently!
    // If they ran concurrently, activeExecutions would have length 2 at some point
    // Also the executionOrder must show that t1 finished before t2 started or vice versa
    expect(executionOrder.indexOf("end-t1")).toBeLessThan(executionOrder.indexOf("start-t2"));
    
    chatSpy.mockRestore();
  });
});
