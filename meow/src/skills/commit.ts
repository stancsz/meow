/**
 * skills/commit.ts
 *
 * Git commit with conventional commits format.
 */
import { execSync } from "node:child_process";
import type { Skill, SkillContext, SkillResult } from "./loader.ts";

const CONVENTIONAL_TYPES = [
  { value: "feat", description: "A new feature" },
  { value: "fix", description: "A bug fix" },
  { value: "docs", description: "Documentation only changes" },
  { value: "style", description: "Code style changes (formatting, semicolons)" },
  { value: "refactor", description: "Code change that neither fixes a bug nor adds a feature" },
  { value: "perf", description: "Performance improvement" },
  { value: "test", description: "Adding or updating tests" },
  { value: "build", description: "Build system or dependency changes" },
  { value: "ci", description: "CI configuration changes" },
  { value: "chore", description: "Other changes that don't modify src" },
];

export const commit: Skill = {
  name: "commit",
  description: "Create a git commit with conventional commits format",
  aliases: ["ci"],

  async execute(args: string, context: SkillContext): Promise<SkillResult> {
    if (!context.dangerous) {
      return {
        content: "",
        error: "[shell:BLOCKED] Git commit requires --dangerous flag",
      };
    }

    try {
      // Get git status
      const status = execSync("git status --porcelain", {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });

      if (!status.trim()) {
        return { content: "Nothing to commit - working tree is clean." };
      }

      // Parse changed files
      const files = status
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const parts = line.trim().split(" ");
          const staged = parts[0];
          const path = parts.slice(1).join(" ");
          return { staged, path };
        });

      let output = "## Git Status\n\n";
      files.forEach(({ staged, path }) => {
        output += `${staged} ${path}\n`;
      });

      output += "\n## Conventional Commit Types\n\n";
      CONVENTIONAL_TYPES.forEach(({ value, description }) => {
        output += `- **${value}**: ${description}\n`;
      });

      output += "\n**Usage:** `/commit feat: add new feature` or `/commit fix: fix bug`\n";

      return { content: output };
    } catch (e: any) {
      return { content: "", error: `Git error: ${e.message}` };
    }
  },
};
