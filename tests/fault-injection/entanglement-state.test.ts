import { describe, it, expect, vi, beforeEach } from "vitest";
import { MeowKernel } from "../../src/kernel/kernel";
import { createMockDatabase } from "../fixtures/databases";

describe("Entanglement State Not Processed", () => {
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

  it("should create bidirectional entanglement on registration", async () => {
    // When registering with entangledWith, the relationship is bidirectional (Bell state)
    await kernel.registerMission(1, "agent1", "task1", [2]);
    await kernel.registerMission(2, "agent2", "task2");

    const entanglement = (kernel as any).monolithEntanglement;
    const agent1Entangled = entanglement.get(1);
    const agent2Entangled = entanglement.get(2);

    // Both agents should be entangled with each other
    expect(agent1Entangled).toContain(2);
    expect(agent2Entangled).toContain(1);
  });

  it("should track entanglement in monolithEntanglement map", async () => {
    await kernel.registerMission(1, "agent1", "task1", [2, 3]);

    const entanglement = (kernel as any).monolithEntanglement;

    expect(entanglement.has(1)).toBe(true);
    expect(entanglement.get(1)).toContain(2);
    expect(entanglement.get(1)).toContain(3);
  });

  it("documents that interference state is pushed but never processed", async () => {
    // This documents the known issue:
    // During updateMissionPulse with completed/failed status,
    // interference_* state is pushed to the queue
    // But drain() just stores it in DB - nothing acts on it
    // This is a design gap: "Spooky Action at a Distance" is logged but not processed

    await kernel.registerMission(1, "agent1", "task1", [2]);
    await kernel.registerMission(2, "agent2", "task2");

    // The entanglement map is set up correctly
    const entanglement = (kernel as any).monolithEntanglement;
    expect(entanglement.get(1)).toContain(2);

    // But the interference processing pushed during updateMissionPulse
    // is just stored in DB - no handler reads interference_* and acts on it
  });
});
