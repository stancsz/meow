import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ExecutionMode } from "../../src/orchestrator/ExecutionMode";
import { Orchestrator } from "../../src/orchestrator/Orchestrator";
import { Agent } from "../../src/agent/agent";
import { MeowKernel } from "../../src/kernel/kernel";
import { DatabasePort } from "../../src/extensions/database/manifest";

describe("Orchestrator Observability & TaskEvents Wiring", () => {
  beforeEach(() => {
    vi.spyOn(Agent.prototype, "chat").mockResolvedValue("Mocked agent response");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("triggers task event handlers and writes audit trails to DB, audit ledger, and kernel", async () => {
    const mockKernel = {
      registerMission: () => "mission-123",
      updateMissionPulse: () => {},
      pulse: () => {},
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      shutdown: async () => {},
    } as unknown as MeowKernel;

    const auditSpy = vi.fn();
    const mockDb = {
      query: async () => [],
      execute: async () => {},
      exec: () => {},
      audit: auditSpy,
      startRun: () => {},
      checkpoint: () => {},
      endRun: () => {},
    } as unknown as DatabasePort;

    const baseAgent = new Agent({
      model: "gpt-4",
      baseUrl: "https://api.openai.com",
      apiKey: "fake-key",
      kernel: mockKernel,
      db: mockDb,
    });

    const ledgerSpy = vi.spyOn(baseAgent.auditLogger, "log").mockImplementation(() => {});

    const orchestrator = new Orchestrator(baseAgent);

    // Mock registerWorkers to execute tasks quickly using mocked agents
    orchestrator.registerWorkers([{
      workerId: "default",
      agentConfig: {
        model: "gpt-4",
        baseUrl: "https://api.openai.com",
        apiKey: "fake-key",
      } as any,
      kernel: mockKernel,
      db: mockDb,
    }]);

    await orchestrator.execute("A simple test task", {
      tasks: "Task 1",
      mode: ExecutionMode.PARALLEL,
    });

    // 1. Verify SQLite DB audit was called for task start and task complete
    expect(auditSpy).toHaveBeenCalled();
    const auditCalls = auditSpy.mock.calls;
    
    const hasStart = auditCalls.some(call => call[0] === "task_start");
    const hasComplete = auditCalls.some(call => call[0] === "task_complete");
    
    expect(hasStart).toBe(true);
    expect(hasComplete).toBe(true);

    // 2. Verify Structured Audit Ledger was called
    expect(ledgerSpy).toHaveBeenCalled();
    const ledgerCalls = ledgerSpy.mock.calls;
    
    const hasLedgerStart = ledgerCalls.some(call => call[0].actionType === "task_start");
    const hasLedgerComplete = ledgerCalls.some(call => call[0].actionType === "task_complete");
    
    expect(hasLedgerStart).toBe(true);
    expect(hasLedgerComplete).toBe(true);

    // 3. Verify Kernel log was called
    expect(mockKernel.log).toHaveBeenCalled();
  });
});
