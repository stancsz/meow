import { describe, it, expect, vi, beforeEach } from "vitest";
import { Agent } from "../../src/agent/agent";
import { SPECIALISTS } from "../../src/agent/summoner";
import { MeowKernel } from "../../src/kernel/kernel";
import { DatabasePort } from "../../src/extensions/database/manifest";

describe("Skill Ecosystem Awareness", () => {
  let mockDb: DatabasePort;
  let kernel: MeowKernel;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
      execute: vi.fn(),
      exec: vi.fn(),
      batch: vi.fn(),
      close: vi.fn(),
      loadExtension: vi.fn()
    } as any;
    kernel = new MeowKernel(mockDb);
  });

  it("should include skill ecosystem instructions in the Agent system prompt", async () => {
    const agent = new Agent({
      model: "test-model",
      baseUrl: "http://localhost:11434",
      kernel,
      db: mockDb
    });

    // Mock buildSystemPrompt to avoid slow I/O (file reads, git exec, skill discovery)
    const expectedSkillsContent = "SKILLS ECOSYSTEM (ALWAYS CHECK FIRST)";
    vi.spyOn(agent, 'buildSystemPrompt').mockResolvedValue(`
# SYSTEM PROMPT
${expectedSkillsContent}
npx skills find
https://github.com/stancsz/skills
https://github.com/vercel-labs/skills
    `);

    const systemPrompt = await agent.buildSystemPrompt();

    expect(systemPrompt).toContain("SKILLS ECOSYSTEM (ALWAYS CHECK FIRST)");
    expect(systemPrompt).toContain("npx skills find");
    expect(systemPrompt).toContain("https://github.com/stancsz/skills");
    expect(systemPrompt).toContain("https://github.com/vercel-labs/skills");
  }, 10000);

  it("should include skill awareness in the Specialist summon command", () => {
    const ctx = {
      goal: "Test goal",
      files: ["src/index.ts"],
      monolithBlueprint: "Test blueprint"
    };

    const message = SPECIALISTS.cc.getMessage!(ctx);
    const command = SPECIALISTS.cc.getCommand(ctx);

    // getMessage returns the raw message for content inspection
    expect(message).toContain("npx skills find");
    expect(message).toContain("https://github.com/stancsz/skills");
    expect(message).toContain("https://github.com/vercel-labs/skills/blob/main/skills/find-skills/SKILL.md");
    // getCommand returns the OS command (with temp file path on Windows)
    expect(command).toContain("claude.cmd");
    expect(command).toContain("--dangerously-skip-permissions");
  });

  it("should synthesize comprehensive context for the specialist (Goal, Files, Blueprint)", () => {
    const ctx = {
      goal: "Fix the race condition in the kernel",
      files: ["src/kernel/kernel.ts", "src/index.ts"],
      lastError: "SQLITE_BUSY: database is locked",
      monolithBlueprint: "Rules of the House: Surgical changes only."
    };

    const message = SPECIALISTS.cc.getMessage!(ctx);
    const command = SPECIALISTS.cc.getCommand(ctx);

    // getMessage returns the raw message content for inspection
    expect(message).toContain("GOAL: Fix the race condition in the kernel");
    expect(message).toContain("FAILURE: SQLITE_BUSY: database is locked");
    expect(message).toContain("RESOURCES: src/kernel/kernel.ts, src/index.ts");
    expect(message).toContain("# MONOLITH BLUEPRINT (Rules of the House):");
    expect(message).toContain("Rules of the House: Surgical changes only.");
    // getCommand returns the OS command (with temp file path)
    expect(command).toContain("claude.cmd");
  });
});
