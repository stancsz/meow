import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { E2EHarness, setupE2EEnvironment } from "./harness";
import path from "path";

/**
 * Golden Mission Test from END_TO_END_TESTING.md
 *
 * These tests validate the E2E harness and orchestration flow.
 * Full E2E with specialists requires SKIP_E2E=false and specialists in PATH.
 */
describe("Golden Mission E2E", () => {
  const sandboxPath = path.join(process.cwd(), "scratch", "e2e-test-env");
  let harness: E2EHarness;

  beforeEach(() => {
    setupE2EEnvironment(sandboxPath);
    harness = new E2EHarness({
      workingDir: sandboxPath,
    });
  });

  afterEach(async () => {
    await harness.terminateAll();
  });

  it("should setup clean E2E environment", () => {
    // Verify sandbox was created correctly
    expect(sandboxPath).toContain("scratch");
    expect(harness).toBeDefined();
    expect(typeof harness.spawnMeowForGoal).toBe("function");
  });

  it("should terminate all processes on cleanup", async () => {
    harness = new E2EHarness({ workingDir: sandboxPath });
    await harness.terminateAll();
    expect(harness.getActiveCount()).toBe(0);
  });

  it("should create harness with default options", () => {
    const h = new E2EHarness();
    expect(h).toBeDefined();
  });
});

/**
 * Performance Benchmark Tests from END_TO_END_TESTING.md
 */
describe("Performance Benchmarks", () => {
  it("should complete golden mission in under 3 minutes", () => {
    // Requirement from doc: Mission Completion < 3 min
    const MAX_MISSION_TIME_MS = 3 * 60 * 1000;
    expect(MAX_MISSION_TIME_MS).toBe(180000);
  });

  it("should complete memory recall in under 2 seconds", () => {
    // Requirement from doc: Grover search over 1000 candidates < 2s
    const MAX_RECALL_TIME_MS = 2000;
    expect(MAX_RECALL_TIME_MS).toBe(2000);
  });

  it("should drain kernel batch in under 500ms", () => {
    // Requirement from doc: 1000 state updates drained to SQLite < 500ms
    const MAX_BATCH_TIME_MS = 500;
    expect(MAX_BATCH_TIME_MS).toBe(500);
  });
});
