/**
 * pptx.ts
 *
 * PPTX skill - loads SKILL.md from the pptx skill directory.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Skill, SkillContext, SkillResult } from "./loader.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const pptx: Skill = {
  name: "pptx",
  description: "Create, edit, and analyze PowerPoint presentations (.pptx). Supports layouts, slides, and visual elements.",
  aliases: ["powerpoint", "presentation"],

  async execute(_args: string, _ctx: SkillContext): Promise<SkillResult> {
    try {
      const skillPath = join(__dirname, "pptx", "SKILL.md");
      const content = readFileSync(skillPath, "utf-8");
      return { content: content.slice(0, 8000) };
    } catch (e: any) {
      return { content: "", error: `PPTX skill not available: ${e.message}` };
    }
  },
};
