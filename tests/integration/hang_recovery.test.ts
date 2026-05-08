import { describe, it, expect, vi, beforeEach } from "vitest";
import { MeowKernel } from "../../src/kernel/kernel";
import { ParallelExecutor, ExecutorConfig, WorkerConfig } from "../../src/orchestrator/ParallelExecutor";
import { TaskQueue } from "../../src/orchestrator/TaskQueue";
import { FileCoordinator } from "../../src/orchestrator/FileCoordinator";
import { createMockDatabase } from "../fixtures/databases";
import { makeTask } from "../fixtures/tasks";

describe("Hang Recovery Integration", () => {
  let mockDb: ReturnType<typeof createMockDatabase>;
  let kernel: MeowKernel;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDatabase();
    kernel = new MeowKernel(mockDb);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await kernel.shutdown();
  });

  describe("MeowKernel Watchdog", () => {
    it("should detect a frozen agent and trigger respawn", async () => {
      const pid = 99999;
      const agentName = "test-agent";
      const goal = "test-goal";

      (mockDb.query as any).mockResolvedValueOnce([{ agent_name: agentName, goal: goal }]);

      await kernel.registerMission(pid, agentName, goal);
      await kernel.pulse(pid);

      const heartbeats = (kernel as any).agentHeartbeats;
      heartbeats.set(pid, new Date(Date.now() - 30 * 60 * 1000));

      const respawnSpy = vi.spyOn(kernel as any, "respawnAgent");
      (kernel as any).watchdogCheck();

      expect(respawnSpy).toHaveBeenCalledWith(pid);
    });

    it("should not trigger respawn for healthy agent", async () => {
      const pid = 88888;
      const agentName = "healthy-agent";
      const goal = "healthy-goal";

      await kernel.registerMission(pid, agentName, goal);
      await kernel.pulse(pid);

      const respawnSpy = vi.spyOn(kernel as any, "respawnAgent");
      (kernel as any).watchdogCheck();

      expect(respawnSpy).not.toHaveBeenCalled();
    });

    it("should ignore agents with no heartbeat record", async () => {
      const pid = 77777;
      const respawnSpy = vi.spyOn(kernel as any, "respawnAgent");
      (kernel as any).watchdogCheck();
      expect(respawnSpy).not.toHaveBeenCalled();
    });
  });
});
