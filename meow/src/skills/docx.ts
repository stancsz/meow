/**
 * docx.ts
 *
 * DOCX skill - loads SKILL.md from the docx skill directory.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Skill, SkillContext, SkillResult } from "./loader.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const docx: Skill = {
  name: "docx",
  description: "Create, edit, and analyze Word documents (.docx). Supports tracked changes, comments, and formatting.",
  aliases: ["word", "document"],

  async execute(_args: string, _ctx: SkillContext): Promise<SkillResult> {
    try {
      const skillPath = join(__dirname, "docx", "SKILL.md");
      const content = readFileSync(skillPath, "utf-8");
      return { content: content.slice(0, 8000) }; // Limit to avoid context overflow
    } catch (e: any) {
      return { content: "", error: `DOCX skill not available: ${e.message}` };
    }
  },
};
