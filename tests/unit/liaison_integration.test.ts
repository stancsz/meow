import { describe, it, expect, vi, beforeEach } from "vitest";
import { Agent } from "../../src/agent/agent";
import { Liaison } from "../../src/liaison/Liaison";
import { MissionBrief } from "../../src/liaison/MissionBrief";

/**
 * L1 Liaison Integration Test
 *
 * Ensures: L1 correctly distills intent into a MissionBrief.
 * Test: Mock a complex user request and verify the JSON schema output.
 */
describe("Liaison Integration", () => {
  let liaison: Liaison;
  let mockAgent: Partial<Agent>;

  beforeEach(() => {
    mockAgent = {
      callLLM: vi.fn().mockResolvedValue("Acknowledged: I'll implement the new feature."),
    } as any;

    liaison = new Liaison(mockAgent as Agent);
  });

  it("should extract intent 'implement' from create request", async () => {
    const response = await liaison.chat("Create a new authentication module for the API");

    expect(response.brief.intent).toBe("implement");
    expect(response.brief.desiredOutcome).toContain("authentication module");
  });

  it("should extract intent 'debug' from bug fix request", async () => {
    const response = await liaison.chat("Fix the race condition in the kernel");

    expect(response.brief.intent).toBe("debug");
    expect(response.brief.domain).toBe("general"); // kernel doesn't match agent/swarm patterns
  });

  it("should extract intent 'test' from testing request", async () => {
    const response = await liaison.chat("Write tests for the database extension");

    expect(response.brief.intent).toBe("test");
    expect(response.brief.domain).toBe("database");
    expect(response.brief.successCriteria).toBeDefined();
    expect(response.brief.successCriteria?.acceptanceCriteria).toContain("tests pass");
  });

  it("should identify domain from keywords", async () => {
    const testCases = [
      { input: "Add a new database migration", expectedDomain: "database" },
      { input: "Create an API endpoint for users", expectedDomain: "api" },
      { input: "Implement JWT authentication", expectedDomain: "auth" },
      { input: "Build a button component for the UI", expectedDomain: "frontend" },
      { input: "Deploy to kubernetes", expectedDomain: "devops" },
    ];

    for (const { input, expectedDomain } of testCases) {
      const response = await liaison.chat(input);
      expect(response.brief.domain).toBe(expectedDomain, `Failed for: ${input}`);
    }
  });

  it("should detect critical priority", async () => {
    const response = await liaison.chat("URGENT: Fix the production database crash");

    expect(response.brief.priority).toBe("critical");
  });

  it("should detect low priority", async () => {
    const response = await liaison.chat("Someday when you have time, refactor the old code");

    expect(response.brief.priority).toBe("low");
  });

  it("should estimate complexity based on request content", async () => {
    const simpleResponse = await liaison.chat("Fix a typo in the README");
    expect(simpleResponse.brief.complexity).toBeLessThanOrEqual(20);

    const complexResponse = await liaison.chat(
      "Implement a distributed caching layer with multiple API endpoints and concurrent database writes"
    );
    expect(complexResponse.brief.complexity).toBeGreaterThan(50);
  });

  it("should populate targetFiles from quoted paths", async () => {
    const response = await liaison.chat(
      'Implement the feature in "src/auth/login.ts" and "src/auth/session.ts"'
    );

    expect(response.brief.targetFiles).toContain("src/auth/login.ts");
    expect(response.brief.targetFiles).toContain("src/auth/session.ts");
  });

  it("should create a unique missionId", async () => {
    const response1 = await liaison.chat("Task 1");
    const response2 = await liaison.chat("Task 2");

    expect(response1.brief.missionId).not.toBe(response2.brief.missionId);
  });

  it("should include rawInput in mission brief", async () => {
    const userInput = "Create a new feature";
    const response = await liaison.chat(userInput);

    expect(response.brief.rawInput).toBe(userInput);
  });

  it("should set createdAt timestamp", async () => {
    const before = Date.now();
    const response = await liaison.chat("Simple task");
    const after = Date.now();

    expect(response.brief.createdAt).toBeGreaterThanOrEqual(before);
    expect(response.brief.createdAt).toBeLessThanOrEqual(after);
  });

  it("should return response with text and streamed=false for non-streaming", async () => {
    const response = await liaison.chat("Simple task");

    expect(response.text).toBeTruthy();
    expect(response.streamed).toBe(false);
    expect(response.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("should return response with streamed=true when callback provided", async () => {
    vi.useRealTimers();

    const chunks: string[] = [];
    const response = await liaison.chat(
      "Task",
      (chunk) => {
        if (chunk.text) chunks.push(chunk.text);
      }
    );

    expect(response.streamed).toBe(true);
  }, 10000);
});
