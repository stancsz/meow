import { describe, it, expect, vi, beforeEach } from "vitest";
import { DiscoveryModule } from "../../src/agent/discovery";
import * as fs from "fs/promises";
import * as os from "os";
import { globby } from "globby";

// Mock dependencies
vi.mock("fs/promises");
vi.mock("os");
vi.mock("globby", () => ({
  globby: vi.fn()
}));

describe("DiscoveryModule", () => {
  let discovery: DiscoveryModule;

  beforeEach(() => {
    vi.clearAllMocks();
    (os.homedir as any).mockReturnValue("/mock/home");
    (os.platform as any).mockReturnValue("win32");
    process.env.APPDATA = "/mock/appdata";
    discovery = new DiscoveryModule();
  });

  it("should discover MCP servers from Claude Desktop config", async () => {
    const mockConfig = {
      mcpServers: {
        "test-server": {
          command: "node",
          args: ["test.js"],
          env: { TEST: "true" }
        }
      }
    };

    (fs.access as any).mockResolvedValue(undefined);
    (fs.readFile as any).mockResolvedValue(JSON.stringify(mockConfig));

    const servers = await discovery.discoverMcpServers();

    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe("test-server");
    expect(servers[0].command).toBe("node");
    expect(fs.readFile).toHaveBeenCalledWith(
      expect.stringContaining("claude_desktop_config.json"),
      "utf-8"
    );
  });

  it("should discover global skills", async () => {
    const mockSkillContent = `---
name: test-skill
description: A test skill
---
Skill content here`;

    (fs.access as any).mockResolvedValue(undefined);
    (fs.readFile as any).mockResolvedValue(mockSkillContent);
    (globby as any).mockResolvedValueOnce(["/mock/home/.claude/skills/test-skill/SKILL.md"]);
    (globby as any).mockResolvedValueOnce([]); // Second path empty

    const skills = await discovery.discoverGlobalSkills();

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("test-skill");
    expect(skills[0].description).toBe("A test skill");
  });

  it("should return empty array if config is missing", async () => {
    (fs.access as any).mockRejectedValue(new Error("Not found"));

    const servers = await discovery.discoverMcpServers();
    expect(servers).toEqual([]);
  });
});
