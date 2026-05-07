import { describe, it, expect, vi, beforeEach } from "vitest";
import { MeowKernel } from "../../src/kernel/kernel";
import { DatabasePort } from "../../src/extensions/database/manifest";

describe("MeowKernel", () => {
  let mockDb: DatabasePort;
  let kernel: MeowKernel;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
      execute: vi.fn(),
      exec: vi.fn(),
      batch: vi.fn().mockResolvedValue({ processed: 1, errors: [] }),
      close: vi.fn(),
      loadExtension: vi.fn()
    } as any;
    
    kernel = new MeowKernel(mockDb);
  });

  it("should batch actions and drain them to the database", async () => {
    const action = { type: "SET_STATE", key: "test", value: "val" } as const;
    
    // We need to trigger the drain. Batch size is 50 by default.
    // Let's push 50 actions.
    for (let i = 0; i < 50; i++) {
      kernel.push(action);
    }

    // Give it a moment to process the drain (it's async)
    await new Promise(resolve => setTimeout(resolve, 200));

    expect(mockDb.batch).toHaveBeenCalled();
    const lastBatch = (mockDb.batch as any).mock.calls[0][0];
    expect(lastBatch.length).toBe(50);
  });

  it("should handle heartbeats and update mission pulse", async () => {
    await kernel.pulse(1234);
    
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE missions"),
      expect.arrayContaining(["running", 1234])
    );
  });
});
