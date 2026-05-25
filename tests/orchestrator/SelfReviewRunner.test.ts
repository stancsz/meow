import { describe, it, expect } from "vitest";
import { SelfReviewRunner, DEFAULT_SELF_REVIEW_CONFIG, SelfReviewConfig } from "../../src/orchestrator/SelfReviewRunner";
import { ExecutionMode, DEFAULT_QUALITY_GATES } from "../../src/orchestrator/ExecutionMode";
import { Task, TaskResult } from "../../src/orchestrator/Task";

describe("SelfReviewRunner", () => {
  describe("constructor", () => {
    it("sets config correctly with defaults when no config provided", () => {
      const runner = new SelfReviewRunner();
      const config = runner.getConfig();

      expect(config.mode).toBe(ExecutionMode.SHIP);
      expect(config.maxIterations).toBe(5);
      expect(config.qualityGates).toEqual(DEFAULT_QUALITY_GATES);
      expect(config.minQualityScore).toBe(80);
      expect(config.allowHumanOverride).toBe(true);
    });

    it("merges partial config with defaults", () => {
      const runner = new SelfReviewRunner({ mode: ExecutionMode.SEQUENTIAL });
      const config = runner.getConfig();

      expect(config.mode).toBe(ExecutionMode.SEQUENTIAL);
      expect(config.maxIterations).toBe(5); // default
      expect(config.minQualityScore).toBe(80); // default
    });
  });

  describe("updateConfig", () => {
    it("changes mode via updateConfig", () => {
      const runner = new SelfReviewRunner();
      expect(runner.getConfig().mode).toBe(ExecutionMode.SHIP);

      runner.updateConfig({ mode: ExecutionMode.PARALLEL });
      expect(runner.getConfig().mode).toBe(ExecutionMode.PARALLEL);
    });

    it("can update multiple config values", () => {
      const runner = new SelfReviewRunner();
      runner.updateConfig({
        mode: ExecutionMode.SEQUENTIAL,
        maxIterations: 3,
        minQualityScore: 90,
      });

      const config = runner.getConfig();
      expect(config.mode).toBe(ExecutionMode.SEQUENTIAL);
      expect(config.maxIterations).toBe(3);
      expect(config.minQualityScore).toBe(90);
    });
  });

  describe("executeWithSelfReview", () => {
    const createTask = (id: string): Task => ({
      id,
      description: "test task",
      priority: "medium",
      dependencies: [],
      createdAt: Date.now(),
      maxRetries: 1,
      timeoutMs: 5000,
      status: "pending",
    });

    const successfulExecutor = async (): Promise<TaskResult> => ({
      taskId: "test",
      success: true,
      output: "done",
      artifacts: [],
    });

    const failingExecutor = async (): Promise<TaskResult> => ({
      taskId: "test",
      success: false,
      error: "execution failed",
    });

    it("in PARALLEL mode returns quickly without self-review loops", async () => {
      const runner = new SelfReviewRunner({ mode: ExecutionMode.PARALLEL });
      const task = createTask("parallel-task");

      const result = await runner.executeWithSelfReview(task, successfulExecutor);

      expect(result.passes).toBe(true);
      expect(result.iterations).toBe(1);
      expect(result.gates).toHaveLength(0); // no gates in parallel mode
    }, 10000);

    it("in SEQUENTIAL mode executes and returns SelfReviewResult", async () => {
      const runner = new SelfReviewRunner({
        mode: ExecutionMode.SEQUENTIAL,
        maxIterations: 2,
        // Use minimal quality gates that will pass with empty artifacts
        qualityGates: [{
          name: "Test Gate",
          required: true,
          blocking: true,
          check: async () => ({
            passed: true,
            details: "Test Gate: passed",
            durationMs: 1,
          }),
        }],
        minQualityScore: 50, // low threshold to pass
        enableTestExecution: false, // skip slow vitest run in test
      });

      const task = createTask("sequential-task");
      const result = await runner.executeWithSelfReview(task, successfulExecutor);

      expect(result).toHaveProperty("passes");
      expect(result).toHaveProperty("qualityScore");
      expect(result).toHaveProperty("issues");
      expect(result).toHaveProperty("warnings");
      expect(result).toHaveProperty("gates");
      expect(result).toHaveProperty("iterations");
      expect(result).toHaveProperty("timeSpentMs");
    }, 10000);

    it("in SHIP mode returns SelfReviewResult with qualityScore", async () => {
      const runner = new SelfReviewRunner({
        mode: ExecutionMode.SHIP,
        maxIterations: 1,
        qualityGates: [{
          name: "Passing Gate",
          required: true,
          blocking: true,
          check: async () => ({
            passed: true,
            details: "Passing Gate: passed",
            durationMs: 1,
          }),
        }],
        minQualityScore: 50,
        allowHumanOverride: false,
        enableJudge: false, // skip real LLM judge API call in test
        enableTestExecution: false, // skip slow vitest run in test
      });

      const task = createTask("ship-task");
      const result = await runner.executeWithSelfReview(task, successfulExecutor);

      expect(result.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result.qualityScore).toBeLessThanOrEqual(100);
      expect(typeof result.qualityScore).toBe("number");
    }, 60000);

    it("returns failed result when executor fails", async () => {
      const runner = new SelfReviewRunner({ mode: ExecutionMode.PARALLEL });
      const task = createTask("fail-task");

      const result = await runner.executeWithSelfReview(task, failingExecutor);

      expect(result.passes).toBe(false);
      expect(result.qualityScore).toBe(0);
      expect(result.issues).toContain("execution failed");
    }, 10000);
  });
});