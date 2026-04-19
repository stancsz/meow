/**
 * skills/commit.ts
 *
 * Git commit with conventional commits format.
 * Actually stages and commits files.
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

function runGit(cmd: string): string {
  return execSync(cmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
}

function getStagedFiles(): { staged: string; path: string }[] {
  const status = runGit("git status --porcelain");
  if (!status.trim()) return [];

  return status
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      const staged = parts[0];
      const path = parts.slice(1).join(" ");
      return { staged, path };
    });
}

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
      // Handle -m flag for inline message
      if (args.startsWith("-m ")) {
        const message = args.slice(3).trim();
        if (!message) {
          return { content: "", error: "Usage: /commit -m 'feat: add new feature'" };
        }

        // Check if there are staged changes
        const staged = getStagedFiles().filter(f => f.staged.includes("M") || f.staged.includes("A") || f.staged.includes("?"));
        if (staged.length === 0) {
          return { content: "", error: "No staged changes. Use /commit to see status first." };
        }

        // Stage all tracked changes
        runGit("git add -A");

        // Commit
        const result = runGit(`git commit -m "${message.replace(/"/g, '\\"')}"`);
        return { content: `✅ Committed: ${message}\n\n${result}` };
      }

      // No args - show status
      const stagedFiles = getStagedFiles();

      if (stagedFiles.length === 0) {
        return { content: "Nothing to commit - working tree is clean." };
      }

      let output = "## Git Status (staged changes)\n\n";
      stagedFiles.forEach(({ staged, path }) => {
        output += `${staged} ${path}\n`;
      });

      output += "\n## Conventional Commit Types\n\n";
      CONVENTIONAL_TYPES.forEach(({ value, description }) => {
        output += `- **${value}**: ${description}\n`;
      });

      output += "\n**Usage:**\n";
      output += `- \`/commit -m "feat: add new feature"\` - commit with message\n`;
      output += `- Stage files manually with \`git add\` first\n`;

      // Auto-stage if only a few files changed
      const trackedChanged = stagedFiles.filter(f => !f.staged.includes("?"));
      if (trackedChanged.length > 0 && trackedChanged.length <= 5) {
        output += `\n⚡ Auto-staging ${trackedChanged.length} tracked file(s)...\n`;
        try {
          runGit("git add -u");
          const newStaged = getStagedFiles();
          output += `Staged:\n`;
          newStaged.forEach(({ staged, path }) => {
            output += `  ${staged} ${path}\n`;
          });
        } catch {
          // Ignore staging errors
        }
      }

      return { content: output };
    } catch (e: any) {
      return { content: "", error: `Git error: ${e.message}` };
    }
  },
};
