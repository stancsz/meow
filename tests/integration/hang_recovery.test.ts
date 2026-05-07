import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MeowKernel } from "../../src/kernel/kernel";
import { ParallelExecutor, ExecutorConfig, WorkerConfig } from "../../src/orchestrator/ParallelExecutor";
import { TaskQueue } from "../../src/orchestrator/TaskQueue";
import { FileCoordinator } from "../../src/orchestrator/FileCoordinator";
import { DatabasePort } from "../../src/extensions/database/manifest";

describe("Hang Recovery Integration", () => {
  let mockDb: DatabasePort;
  let kernel: MeowKernel;

  beforeEach(() => {
    mockDb = {
      query: vi.fn().mockResolvedValue([]),
      execute: vi.fn().mockResolvedValue({ changes: 1, lastInsertRowid: 1 }),
      exec: vi.fn().mockResolvedValue({ done: true }),
      batch: vi.fn().mockResolvedValue({ processed: 1, errors: [] }),
      close: vi.fn(),
      loadExtension: vi.fn()
    } as any;
    
    kernel = new MeowKernel(mockDb);
  });

  afterEach(async () => {
    await kernel.shutdown();
  });

  describe("MeowKernel Watchdog", () => {
    it("should detect a frozen agent and trigger respawn", async () => {
      const pid = 99999;
      const agentName = "test-agent";
      const goal = "test-goal";

      // Mock the mission in DB
      (mockDb.query as any).mockResolvedValueOnce([{ agent_name: agentName, goal: goal }]);

      // 1. Register a mission
      await kernel.registerMission(pid, agentName, goal);

      // 2. Simulate a heartbeat
      await kernel.pulse(pid);

      // 3. Manually manipulate the heartbeat timestamp to simulate 30 minutes ago
      // Accessing private map for testing purposes (in TS we use bracket notation to bypass)
      const heartbeats = (kernel as any).agentHeartbeats;
      heartbeats.set(pid, new Date(Date.now() - 30 * 60 * 1000));

      // 4. Trigger watchdog check
      // We need to spy on respawnAgent
      const respawnSpy = vi.spyOn(kernel as any, 'respawnAgent');
      
      // Execute watchdog check (it's private, but we call it)
      (kernel as any).watchdogCheck();

      expect(respawnSpy).toHaveBeenCalledWith(pid);
    });
  });

  describe("ParallelExecutor Timeout", () => {
    it("should recover from a hanging tool execution via timeout", async () => {
      const queue = new TaskQueue();
      const coordinator = new FileCoordinator();
      const config: ExecutorConfig = {
        maxWorkers: 1,
        taskTimeoutMs: 100, // Very short timeout for testing
        enableParallelTools: true
      };
      
      const executor = new ParallelExecutor(queue, coordinator, config);
      
      const worker: WorkerConfig = {
        workerId: "w1",
        agentConfig: { model: "m", baseUrl: "b", apiKey: "k" },
        kernel,
        db: mockDb
      };
      executor.registerWorker(worker);

      // Create a task that will "hang"
      // We'll mock executeToolTask to return a promise that never resolves
      const hangPromise = new Promise(() => {});
      const executeSpy = vi.spyOn(executor as any, 'executeToolTask').mockReturnValue(hangPromise);

      queue.enqueue({
        id: "t1",
        description: "Hanging task",
        priority: "medium",
        dependencies: [],
        createdAt: Date.now(),
        maxRetries: 0,
        timeoutMs: 100,
        status: "pending",
        toolName: "run"
      });

      const resultsPromise = executor.run();

      // Fast-forward time
      await new Promise(resolve => setTimeout(resolve, 200));

      const results = await resultsPromise;
      const t1Result = results.get("t1");

      expect(t1Result?.success).toBe(false);
      expect(t1Result?.error).toContain("timed out");
    });
  });
});
