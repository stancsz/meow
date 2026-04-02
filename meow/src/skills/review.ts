/**
 * skills/review.ts
 *
 * Code review skill - analyzes code and provides feedback.
 */
import { readFileSync } from "node:fs";
import type { Skill, SkillContext, SkillResult } from "./loader.ts";

export const review: Skill = {
  name: "review",
  description: "Review code and provide constructive feedback",
  aliases: ["cr", "analyze"],

  async execute(args: string, context: SkillContext): Promise<SkillResult> {
    if (!args) {
      return { content: "", error: "Usage: /review <filepath>" };
    }

    const path = args.trim();

    try {
      const content = readFileSync(path, "utf-8");
      const lines = content.split("\n");

      // Simple review heuristics
      const issues: string[] = [];
      let todoCount = 0;
      let fixmeCount = 0;
      let longFunctions = 0;

      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.includes("TODO")) todoCount++;
        if (trimmed.includes("FIXME")) fixmeCount++;
      });

      // Check for very long files
      if (lines.length > 500) {
        issues.push(`📄 File has ${lines.length} lines - consider splitting`);
      }

      // Check for TODO/FIXME
      if (todoCount > 0) issues.push(`📝 ${todoCount} TODO(s) found`);
      if (fixmeCount > 0) issues.push(`🔧 ${fixmeCount} FIXME(s) found`);

      // Generate review
      let output = `## Code Review: ${path}\n\n`;
      output += `**Lines:** ${lines.length}\n\n`;

      if (issues.length > 0) {
        output += `### Observations\n`;
        issues.forEach((issue) => {
          output += `- ${issue}\n`;
        });
        output += "\n";
      }

      output += `### Suggestions\n`;
      output += `- Consider adding JSDoc comments for public functions\n`;
      output += `- Check error handling patterns\n`;
      output += `- Look for opportunities to extract reusable utilities\n`;

      return { content: output };
    } catch (e: any) {
      return { content: "", error: `Failed to read ${path}: ${e.message}` };
    }
  },
};
