import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ExecutionMode, isQualityMode, isBlockingMode } from "../../src/orchestrator/ExecutionMode";
import { Orchestrator } from "../../src/orchestrator/Orchestrator";
import { Agent } from "../../src/agent/agent";
import { MeowKernel } from "../../src/kernel/kernel";
import { DatabasePort } from "../../src/extensions/database/manifest";
import { SelfReviewRunner } from "../../src/orchestrator/SelfReviewRunner";

describe("ExecutionMode", () => {
  describe("enum values", () => {
    it("has all expanded values", () => {
      expect(ExecutionMode.PARALLEL).toBe("parallel");
      expect(ExecutionMode.SEQUENTIAL).toBe("sequential");
      expect(ExecutionMode.AUDIT_ONLY).toBe("audit_only");
      expect(ExecutionMode.SHIP).toBe("ship");
      expect(ExecutionMode.AUTOPILOT).toBe("autopilot");
      expect(ExecutionMode.RALPH).toBe("ralph");
      expect(ExecutionMode.ECOMODE).toBe("ecomode");
      expect(ExecutionMode.PIPELINE).toBe("pipeline");
      expect(ExecutionMode.SWARM).toBe("swarm");
      expect(ExecutionMode.ULTRAWORK).toBe("ultrawork");
      expect(ExecutionMode.ULTRAPILOT).toBe("ultrapilot");
      expect(ExecutionMode.SWARM_TEAM).toBe("swarm_team");
    });
  });

  describe("isQualityMode", () => {
    it("returns true for quality modes", () => {
      expect(isQualityMode(ExecutionMode.SEQUENTIAL)).toBe(true);
      expect(isQualityMode(ExecutionMode.SHIP)).toBe(true);
      expect(isQualityMode(ExecutionMode.RALPH)).toBe(true);
      expect(isQualityMode(ExecutionMode.AUTOPILOT)).toBe(true);
      expect(isQualityMode(ExecutionMode.PIPELINE)).toBe(true);
      expect(isQualityMode(ExecutionMode.ULTRAWORK)).toBe(true);
      expect(isQualityMode(ExecutionMode.ULTRAPILOT)).toBe(true);
    });

    it("returns false for non-quality modes", () => {
      expect(isQualityMode(ExecutionMode.PARALLEL)).toBe(false);
      expect(isQualityMode(ExecutionMode.AUDIT_ONLY)).toBe(false);
      expect(isQualityMode(ExecutionMode.ECOMODE)).toBe(false);
      expect(isQualityMode(ExecutionMode.SWARM)).toBe(false);
      expect(isQualityMode(ExecutionMode.SWARM_TEAM)).toBe(false);
    });
  });

  describe("isBlockingMode", () => {
    it("returns false for non-blocking modes", () => {
      expect(isBlockingMode(ExecutionMode.PARALLEL)).toBe(false);
      expect(isBlockingMode(ExecutionMode.AUDIT_ONLY)).toBe(false);
      expect(isBlockingMode(ExecutionMode.SWARM)).toBe(false);
      expect(isBlockingMode(ExecutionMode.SWARM_TEAM)).toBe(false);
      expect(isBlockingMode(ExecutionMode.ECOMODE)).toBe(false);
    });

    it("returns true for blocking modes", () => {
      expect(isBlockingMode(ExecutionMode.SEQUENTIAL)).toBe(true);
      expect(isBlockingMode(ExecutionMode.SHIP)).toBe(true);
      expect(isBlockingMode(ExecutionMode.RALPH)).toBe(true);
      expect(isBlockingMode(ExecutionMode.AUTOPILOT)).toBe(true);
      expect(isBlockingMode(ExecutionMode.PIPELINE)).toBe(true);
      expect(isBlockingMode(ExecutionMode.ULTRAWORK)).toBe(true);
      expect(isBlockingMode(ExecutionMode.ULTRAPILOT)).toBe(true);
    });
  });

  describe("Orchestrator Mode Processing", () => {
    beforeEach(() => {
      vi.spyOn(Agent.prototype, "chat").mockResolvedValue("Mocked agent response");
      vi.spyOn(SelfReviewRunner.prototype, "executeWithSelfReview").mockResolvedValue({
        passes: true,
        qualityScore: 100,
        issues: [],
        warnings: [],
        gates: [],
        gatesPassed: [],
        gatesFailed: [],
        iterations: 1,
        timeSpentMs: 1,
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("applies budget constraints to tasks in ECOMODE", async () => {
      const mockKernel = {
        registerMission: () => "mission-123",
        updateMissionPulse: () => {},
        pulse: () => {},
        shutdown: async () => {},
      } as unknown as MeowKernel;

      const mockDb = {
        query: async () => [],
        execute: async () => {},
        exec: () => {},
      } as unknown as DatabasePort;

      const baseAgent = new Agent({
        model: "gpt-4",
        baseUrl: "https://api.openai.com",
        apiKey: "fake-key",
        kernel: mockKernel,
        db: mockDb,
      });

      const orchestrator = new Orchestrator(baseAgent);
      
      const result = await orchestrator.execute("Build simple page", {
        tasks: "Task 1",
        mode: ExecutionMode.ECOMODE,
      });

      // Verify task parameters inside queue
      const status = orchestrator.getStatus();
      const allTasks = [...status.queue.pending, ...status.queue.running];
      
      for (const t of allTasks) {
        expect(t.agentConfig?.model).toBe("gemini-2.0-flash");
        expect(t.maxRetries).toBe(1);
        expect(t.timeoutMs).toBeLessThanOrEqual(30000);
      }
    });

    it("applies maximum retries in RALPH mode", async () => {
      const mockKernel = {
        registerMission: () => "mission-123",
        updateMissionPulse: () => {},
        pulse: () => {},
        shutdown: async () => {},
      } as unknown as MeowKernel;

      const mockDb = {
        query: async () => [],
        execute: async () => {},
        exec: () => {},
      } as unknown as DatabasePort;

      const baseAgent = new Agent({
        model: "gpt-4",
        baseUrl: "https://api.openai.com",
        apiKey: "fake-key",
        kernel: mockKernel,
        db: mockDb,
      });

      const orchestrator = new Orchestrator(baseAgent);
      
      const result = await orchestrator.execute("Build resilient service", {
        tasks: "Task 1",
        mode: ExecutionMode.RALPH,
      });

      const status = orchestrator.getStatus();
      const allTasks = [...status.queue.pending, ...status.queue.running];
      
      for (const t of allTasks) {
        expect(t.maxRetries).toBe(100);
      }
    });
  });
});