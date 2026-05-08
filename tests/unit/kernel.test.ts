import { describe, it, expect, vi, beforeEach } from "vitest";
import { MeowKernel } from "../../src/kernel/kernel";
import { createMockDatabase } from "../fixtures/databases";

describe("MeowKernel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should track agent heartbeats after pulse", async () => {
    const mockDb = createMockDatabase();
    const kernel = new MeowKernel(mockDb);

    const pid = 1234;
    await kernel.pulse(pid);

    const heartbeats = (kernel as any).agentHeartbeats;
    expect(heartbeats.has(pid)).toBe(true);

    await kernel.shutdown();
  });

  it("should register mission in database", async () => {
    const mockDb = createMockDatabase();
    const kernel = new MeowKernel(mockDb);

    const pid = 12345;
    const agentName = "test-agent";
    const goal = "test-goal";

    await kernel.registerMission(pid, agentName, goal);

    expect(mockDb.execute).toHaveBeenCalled();
    const lastCall = (mockDb.execute as any).mock.calls[0];
    expect(lastCall[0]).toContain("INSERT INTO missions");
    expect(lastCall[1]).toContain(pid);

    await kernel.shutdown();
  });

  it("should update mission pulse in database", async () => {
    const mockDb = createMockDatabase();
    const kernel = new MeowKernel(mockDb);

    await kernel.pulse(5678);

    expect(mockDb.execute).toHaveBeenCalled();
    const lastCall = (mockDb.execute as any).mock.calls[0];
    expect(lastCall[0]).toContain("UPDATE missions");
    expect(lastCall[1]).toContain("running");

    await kernel.shutdown();
  });

  it("should batch actions when queue fills to batchSize", async () => {
    const mockDb = createMockDatabase();
    const kernel = new MeowKernel(mockDb);

    vi.useRealTimers();

    // Push batchSize actions
    const batchSize = 50;
    for (let i = 0; i < batchSize; i++) {
      kernel.push({ type: "SET_STATE" as const, key: `key-${i}`, value: i });
    }

    // Wait for drain
    await new Promise(resolve => setTimeout(resolve, 200));

    expect(mockDb.batch).toHaveBeenCalled();

    await kernel.shutdown();
  });

  it("should retry batch on SQLITE_BUSY and succeed", async () => {
    const mockDb = createMockDatabase({
      batchErrors: ["SQLITE_BUSY", "SQLITE_BUSY"],
    });
    const kernel = new MeowKernel(mockDb);

    vi.useRealTimers();

    for (let i = 0; i < 51; i++) {
      kernel.push({ type: "SET_STATE" as const, key: `retry-${i}`, value: i });
    }

    await new Promise(resolve => setTimeout(resolve, 400));

    expect(mockDb.batch).toHaveBeenCalled();
    await kernel.shutdown();
  });

  it("should drop batch after max retries", async () => {
    const mockDb = createMockDatabase({
      shouldFailBatch: true,
    });
    const kernel = new MeowKernel(mockDb);

    vi.useRealTimers();

    for (let i = 0; i < 51; i++) {
      kernel.push({ type: "SET_STATE" as const, key: `drop-${i}`, value: i });
    }

    await new Promise(resolve => setTimeout(resolve, 600));

    // batch was called maxRetries (3) times then dropped
    expect(mockDb.batch).toHaveBeenCalled();
    await kernel.shutdown();
  });
});
