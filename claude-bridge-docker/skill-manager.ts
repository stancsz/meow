/**
 * skill-manager.ts - Skill Management for Meow
 *
 * Handles skill installation and management via bash commands.
 * Skills are installed to .claude/skills/ in CLAUDE_CWD
 */

import { existsSync, readFileSync, cpSync, rmSync, mkdirSync, chownSync } from "node:fs";
import { join } from "node:path";

const SKILLS_DIR = ".claude/skills";

export interface InstalledSkill {
  name: string;
  description: string;
  installedAt: number;
}

/**
 * Read description from a SKILL.md file
 */
function readDescription(skillPath: string): string {
  try {
    const content = readFileSync(skillPath, "utf-8");
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        return trimmed.slice(0, 100);
      }
    }
    return "No description";
  } catch {
    return "Could not read description";
  }
}

/**
 * Ensure skills directory exists
 */
function ensureSkillsDir(cwd: string): string {
  const dir = join(cwd, SKILLS_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * List all installed skills
 */
export function listInstalledSkills(cwd: string): InstalledSkill[] {
  const skillsDir = join(cwd, SKILLS_DIR);
  if (!existsSync(skillsDir)) {
    return [];
  }

  const skills: InstalledSkill[] = [];
  try {
    const entries = require("node:fs").readdirSync(skillsDir);

    for (const entry of entries) {
      const skillPath = join(skillsDir, entry);
      const stat = require("node:fs").statSync(skillPath);

      if (stat.isDirectory()) {
        const skMd = join(skillPath, "SKILL.md");
        if (existsSync(skMd)) {
          skills.push({
            name: entry,
            description: readDescription(skMd),
            installedAt: stat.birthtimeMs
          });
        }
      }
    }
  } catch (e) {
    console.error("[skill-manager] Error listing skills:", e);
  }

  return skills;
}

/**
 * Build context for skill management
 */
export function getSkillContext(cwd: string): string {
  const skills = listInstalledSkills(cwd);

  let context = "## Installed Skills\n";
  if (skills.length === 0) {
    context += "No skills installed yet.\n";
  } else {
    context += "Available skills:\n";
    for (const skill of skills) {
      context += `- **${skill.name}**: ${skill.description}\n`;
    }
  }

  context += "\n### How to Install Skills\n";
  context += "Skills are installed to `.claude/skills/` in the working directory.\n";
  context += "To install a skill from a GitHub repo:\n";
  context += "```bash\n";
  context += "# Clone the repo\n";
  context += "git clone <repo-url> /tmp/skill-repo\n";
  context += "# Copy SKILL.md to skills directory\n";
  context += "mkdir -p .claude/skills/<skill-name>\n";
  context += "cp /tmp/skill-repo/.claude/skills/<skill-name>/SKILL.md .claude/skills/<skill-name>/\n";
  context += "# Cleanup\n";
  context += "rm -rf /tmp/skill-repo\n";
  context += "```\n";
  context += "\nTo list installed skills, check `.claude/skills/` directory.\n";

  return context;
}

/**
 * Install a skill from a cloned repository path
 */
export function installSkillFromPath(
  sourcePath: string,
  skillName: string,
  cwd: string
): boolean {
  try {
    const skillsDir = ensureSkillsDir(cwd);
    const destDir = join(skillsDir, skillName);
    const sourceSkMd = join(sourcePath, "SKILL.md");

    if (!existsSync(sourceSkMd)) {
      console.error(`[skill-manager] SKILL.md not found in ${sourcePath}`);
      return false;
    }

    // Create skill directory
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    // Copy SKILL.md
    cpSync(sourceSkMd, join(destDir, "SKILL.md"), { overwrite: true });

    // Copy other files in the skill directory
    try {
      const files = require("node:fs").readdirSync(sourcePath);
      for (const file of files) {
        if (file !== "SKILL.md") {
          const srcFile = join(sourcePath, file);
          const stat = require("node:fs").statSync(srcFile);
          if (stat.isFile()) {
            cpSync(srcFile, join(destDir, file), { overwrite: true });
          }
        }
      }
    } catch {
      // No other files to copy
    }

    console.log(`[skill-manager] Installed skill: ${skillName}`);
    return true;
  } catch (e) {
    console.error(`[skill-manager] Failed to install skill:`, e);
    return false;
  }
}
