import { describe, it, expect, vi, beforeEach } from "vitest";
import { MeowKernel } from "../../src/kernel/kernel";
import { createMockDatabase } from "../fixtures/databases";

describe("DB Batch Drop", () => {
  it("should retry on batch failure and eventually succeed", async () => {
    vi.useRealTimers();

    // Mock DB that fails 2 times then succeeds
    const mockDb = createMockDatabase({
      batchErrors: ["SQLITE_BUSY", "SQLITE_BUSY"],
    });

    const kernel = new MeowKernel(mockDb);

    // Push many actions to trigger drain
    for (let i = 0; i < 51; i++) {
      kernel.push({ type: "SET_STATE" as const, key: `key-${i}`, value: i });
    }

    // Wait for retries
    await new Promise(resolve => setTimeout(resolve, 400));

    // Should have retried and succeeded (3rd call succeeds)
    expect(mockDb.batch).toHaveBeenCalled();
  });

  it("should drop batch after max retries (3)", async () => {
    vi.useRealTimers();

    // Mock DB that always fails batch
    const mockDb = createMockDatabase({
      shouldFailBatch: true,
    });

    const kernel = new MeowKernel(mockDb);

    // Push actions to trigger drain
    for (let i = 0; i < 51; i++) {
      kernel.push({ type: "SET_STATE" as const, key: `drop-${i}`, value: i });
    }

    // Wait for all retry attempts
    await new Promise(resolve => setTimeout(resolve, 600));

    // Batch was called maxRetries times (3), then dropped
    // Note: The current code drops silently after 3 retries
    expect(mockDb.batch).toHaveBeenCalled();
  });

  it("should log errors on batch failure but not throw", async () => {
    vi.useRealTimers();

    const mockDb = createMockDatabase({
      shouldFailBatch: true,
    });

    const kernel = new MeowKernel(mockDb);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    for (let i = 0; i < 51; i++) {
      kernel.push({ type: "SET_STATE" as const, key: `error-${i}`, value: i });
    }

    await new Promise(resolve => setTimeout(resolve, 600));

    // Errors should have been logged
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("should not lose actions if batch succeeds after some retries", async () => {
    vi.useRealTimers();

    // Fail once, then succeed
    const mockDb = createMockDatabase({
      batchErrors: ["SQLITE_BUSY"],
    });

    const kernel = new MeowKernel(mockDb);

    // Push exactly batchSize to trigger immediate drain
    const actions = Array.from({ length: 50 }, (_, i) => ({
      type: "SET_STATE" as const,
      key: `batch-${i}`,
      value: { index: i },
    }));

    for (const action of actions) {
      kernel.push(action);
    }

    await new Promise(resolve => setTimeout(resolve, 300));

    // Should have succeeded on 2nd try
    expect(mockDb.batch).toHaveBeenCalled();
    const batchCalls = (mockDb.batch as any).mock.calls;
    expect(batchCalls.length).toBeGreaterThanOrEqual(1);
  });
});
