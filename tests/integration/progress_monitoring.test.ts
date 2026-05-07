import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MeowKernel } from "../../src/kernel/kernel";
import { DatabasePort } from "../../src/extensions/database/manifest";

describe("Semantic Progress Monitoring", () => {
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

  it("should detect Zero Velocity (Semantic Drift) even if heartbeats are active", async () => {
    const pid = 12345;
    const agentName = "drift-agent";
    const goal = "long-running-task";

    // 1. Register mission
    await kernel.registerMission(pid, agentName, goal);

    // 2. Pulse with initial progress
    await kernel.pulse(pid, 10, "Started coding");

    // 3. Simulate a sequence of heartbeats with NO progress change
    // We'll manipulate the timestamps to simulate 15 minutes of "Same Progress"
    const progressMap = (kernel as any).agentProgress;
    progressMap.set(pid, {
      score: 10,
      lastChange: new Date(Date.now() - 15 * 60 * 1000), // 15 mins ago
      summary: "Started coding"
    });

    // 4. Also keep the heartbeat alive (so it doesn't trigger frozen detection)
    const heartbeats = (kernel as any).agentHeartbeats;
    heartbeats.set(pid, new Date()); // Just now

    // 5. Spy on warnings
    const warnSpy = vi.spyOn(kernel, 'warn');
    
    // 6. Trigger watchdog check
    (kernel as any).watchdogCheck();

    // Should detect Zero Velocity drift
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Zero Velocity"),
      "WATCHDOG"
    );
  });

  it("should update progress score and reset drift timer on meaningful changes", async () => {
    const pid = 67890;
    
    // 1. Initial pulse
    await kernel.pulse(pid, 10, "Step 1");
    
    // 2. Manipulate timer to simulate 5 minutes pass
    const progressMap = (kernel as any).agentProgress;
    progressMap.get(pid).lastChange = new Date(Date.now() - 5 * 60 * 1000);

    // 3. Pulse with NEW progress
    await kernel.pulse(pid, 20, "Step 2 completed");

    // 4. Verify timer was reset to "just now" (within 1 second)
    const lastChange = progressMap.get(pid).lastChange;
    expect(Date.now() - lastChange.getTime()).toBeLessThan(1000);
  });
});
