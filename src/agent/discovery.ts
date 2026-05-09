import { readFile, access } from "fs/promises";
import { join, resolve } from "path";
import { homedir, platform } from "os";
import { McpConfig } from "./mcp";
import { Skill } from "./skills";
import yaml from "js-yaml";
import { globby } from "globby";

export interface HostEnvironment {
  mcpServers: McpConfig[];
  globalSkills: Skill[];
}

export class DiscoveryModule {
  private home = homedir();
  private osPlatform = platform();

  /**
   * Discovers MCP servers configured in Claude Desktop
   */
  async discoverMcpServers(): Promise<McpConfig[]> {
    const configPath = this.getClaudeDesktopConfigPath();
    if (!configPath) return [];

    try {
      await access(configPath);
      const content = await readFile(configPath, "utf-8");
      const config = JSON.parse(content);
      
      const servers: McpConfig[] = [];
      if (config.mcpServers) {
        for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
          const cfg = serverConfig as any;
          servers.push({
            name,
            command: cfg.command,
            args: cfg.args || [],
            env: cfg.env || {}
          });
        }
      }
      return servers;
    } catch (e) {
      // Config not found or invalid
      return [];
    }
  }

  /**
   * Discovers skills installed globally
   */
  async discoverGlobalSkills(): Promise<Skill[]> {
    const globalPaths = [
      join(this.home, ".claude", "skills"),
      join(this.home, ".meow", "skills"),
      join(this.home, ".agents", "skills"),
    ];

    const skills: Skill[] = [];
    for (const path of globalPaths) {
      try {
        await access(path);
        const patterns = [join(path, "**/SKILL.md")];
        const files = await globby(patterns, { absolute: true });

        for (const file of files) {
          try {
            const content = await readFile(file, "utf-8");
            const sections = content.split("---");
            if (sections.length < 3) continue;

            const frontmatter = yaml.load(sections[1]) as { name: string; description: string };
            const body = sections.slice(2).join("---").trim();

            if (frontmatter.name) {
              skills.push({
                name: frontmatter.name,
                description: frontmatter.description || "",
                content: body,
                path: file,
              });
            }
          } catch (e) {
            // Error parsing individual skill
          }
        }
      } catch (e) {
        // Global path not found
      }
    }
    return skills;
  }

  private getClaudeDesktopConfigPath(): string | null {
    if (this.osPlatform === "win32") {
      const appData = process.env.APPDATA;
      if (!appData) return null;
      return join(appData, "Claude", "claude_desktop_config.json");
    } else if (this.osPlatform === "darwin") {
      return join(this.home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
    } else if (this.osPlatform === "linux") {
      return join(this.home, ".config", "Claude", "claude_desktop_config.json");
    }
    return null;
  }
}
