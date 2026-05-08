import { describe, it, expect, vi, beforeEach } from "vitest";
import { MeowKernel } from "../../src/kernel/kernel";
import { createMockDatabase } from "../fixtures/databases";

describe("Agent Frozen Watchdog", () => {
  let kernel: MeowKernel;
  let mockDb: ReturnType<typeof createMockDatabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDatabase();
    kernel = new MeowKernel(mockDb);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await kernel.shutdown();
  });

  it("should trigger respawn when agent exceeds frozen threshold", async () => {
    const pid = 99999;
    const agentName = "test-agent";
    const goal = "frozen task";

    (mockDb.query as any).mockResolvedValueOnce([{ agent_name: agentName, goal: goal }]);

    await kernel.registerMission(pid, agentName, goal);
    await kernel.pulse(pid);

    // Simulate frozen state (heartbeat 20+ min ago)
    const heartbeats = (kernel as any).agentHeartbeats;
    const frozenThresholdMs = (kernel as any).frozenThresholdMs;
    heartbeats.set(pid, new Date(Date.now() - frozenThresholdMs - 1000));

    const respawnSpy = vi.spyOn(kernel as any, "respawnAgent");
    (kernel as any).watchdogCheck();

    expect(respawnSpy).toHaveBeenCalledWith(pid);
  });

  it("should not trigger respawn for healthy agent", async () => {
    const pid = 88888;
    const agentName = "healthy-agent";
    const goal = "healthy goal";

    await kernel.registerMission(pid, agentName, goal);
    await kernel.pulse(pid);

    const respawnSpy = vi.spyOn(kernel as any, "respawnAgent");
    (kernel as any).watchdogCheck();

    expect(respawnSpy).not.toHaveBeenCalled();
  });

  it("should not trigger for agent without heartbeat record", async () => {
    const pid = 77777;
    const respawnSpy = vi.spyOn(kernel as any, "respawnAgent");
    (kernel as any).watchdogCheck();
    expect(respawnSpy).not.toHaveBeenCalled();
  });

  it("should not trigger at exactly frozen threshold", async () => {
    const pid = 66666;
    const agentName = "exact-threshold";
    const goal = "test";

    (mockDb.query as any).mockResolvedValueOnce([{ agent_name: agentName, goal: goal }]);

    await kernel.registerMission(pid, agentName, goal);
    await kernel.pulse(pid);

    // Set heartbeat to exactly at threshold
    const heartbeats = (kernel as any).agentHeartbeats;
    const frozenThresholdMs = (kernel as any).frozenThresholdMs;
    heartbeats.set(pid, new Date(Date.now() - frozenThresholdMs));

    const respawnSpy = vi.spyOn(kernel as any, "respawnAgent");
    (kernel as any).watchdogCheck();

    // At exactly threshold (elapsed == threshold), should NOT trigger
    // since the condition is elapsed > frozenThresholdMs
    expect(respawnSpy).not.toHaveBeenCalled();
  });
});
