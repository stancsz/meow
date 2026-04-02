/**
 * skills/simplify.ts
 *
 * Simplify/refactor code while preserving behavior.
 */
import { readFileSync } from "node:fs";
import type { Skill, SkillContext, SkillResult } from "./loader.ts";

export const simplify: Skill = {
  name: "simplify",
  description: "Simplify and refactor code while preserving behavior",
  aliases: ["refactor", "clean"],

  async execute(args: string, context: SkillContext): Promise<SkillResult> {
    if (!args) {
      return { content: "", error: "Usage: /simplify <filepath>" };
    }

    const path = args.trim();

    try {
      const content = readFileSync(path, "utf-8");

      // For now, just return a prompt for the model to simplify
      // A full implementation would use an AST parser
      return {
        content: `## Simplify Request

File: ${path}

Would you like me to simplify this code? I can:
1. Remove redundant logic
2. Simplify complex conditionals
3. Extract repeated patterns into functions
4. Use more idiomatic patterns

Read the file and suggest improvements.`,
      };
    } catch (e: any) {
      return { content: "", error: `Failed to read ${path}: ${e.message}` };
    }
  },
};
