import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskDecomposer } from "../../src/orchestrator/TaskDecomposer";
import { createMockDatabase } from "../fixtures/databases";
import { MeowKernel } from "../../src/kernel/kernel";

describe("LLM Decomposition Timeout", () => {
  it("should fallback to single task on parse failure", async () => {
    const mockDb = createMockDatabase();
    const kernel = new MeowKernel(mockDb);

    // Mock LLM returns invalid JSON
    const mockAgent = {
      callLLM: vi.fn().mockResolvedValue("This is not JSON { invalid }"),
      buildSystemPrompt: vi.fn().mockResolvedValue("system prompt"),
      model: "test",
      baseUrl: "test",
      apiKey: "test",
      kernel,
      db: mockDb,
      skillManager: { discover: vi.fn(), getSkillsPrompt: () => "", getAllSkills: () => [], getSkillNames: () => [] },
      mcpManager: { getClients: () => new Map(), getToolsPrompt: () => "" },
    } as any;

    const decomposer = new TaskDecomposer(mockAgent);
    const tasks = await decomposer.decompose("Build a REST API", {});

    // Should fallback to single task with original request
    expect(tasks.length).toBe(1);
    expect(tasks[0].description).toBe("Build a REST API");
  });

  it("should handle LLM returning empty response", async () => {
    const mockDb = createMockDatabase();
    const kernel = new MeowKernel(mockDb);

    // Mock LLM returns empty
    const mockAgent = {
      callLLM: vi.fn().mockResolvedValue(""),
      buildSystemPrompt: vi.fn().mockResolvedValue("system prompt"),
      model: "test",
      baseUrl: "test",
      apiKey: "test",
      kernel,
      db: mockDb,
      skillManager: { discover: vi.fn(), getSkillsPrompt: () => "", getAllSkills: () => [], getSkillNames: () => [] },
      mcpManager: { getClients: () => new Map(), getToolsPrompt: () => "" },
    } as any;

    const decomposer = new TaskDecomposer(mockAgent);
    const tasks = await decomposer.decompose("Do something", {});

    // Should fallback to single task
    expect(tasks.length).toBe(1);
  });

  it("documents that LLM timeout can hang the orchestration loop", async () => {
    // This documents the known issue:
    // TaskDecomposer.decompose calls callLLM with no timeout
    // If the LLM hangs, the entire decomposition hangs
    // There's no timeout wrapper on the LLM call

    const mockDb = createMockDatabase();
    const kernel = new MeowKernel(mockDb);

    // Mock agent that never responds
    const mockAgent = {
      callLLM: vi.fn().mockImplementation(() => new Promise(() => {})), // Never resolves
      buildSystemPrompt: vi.fn().mockResolvedValue("system prompt"),
      model: "test",
      baseUrl: "test",
      apiKey: "test",
      kernel,
      db: mockDb,
      skillManager: { discover: vi.fn(), getSkillsPrompt: () => "", getAllSkills: () => [], getSkillNames: () => [] },
      mcpManager: { getClients: () => new Map(), getToolsPrompt: () => "" },
    } as any;

    const decomposer = new TaskDecomposer(mockAgent);

    // Without a timeout, this would hang forever
    // The test verifies the mock is set up correctly
    expect(mockAgent.callLLM).toBeDefined();
  });
});
