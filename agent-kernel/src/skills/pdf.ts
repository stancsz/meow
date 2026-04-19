/**
 * pdf.ts
 *
 * PDF skill - loads SKILL.md from the pdf skill directory.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Skill, SkillContext, SkillResult } from "./loader.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const pdf: Skill = {
  name: "pdf",
  description: "Extract text and tables from PDFs, create new PDFs, merge/split documents, and fill PDF forms.",
  aliases: ["document"],

  async execute(_args: string, _ctx: SkillContext): Promise<SkillResult> {
    try {
      const skillPath = join(__dirname, "pdf", "SKILL.md");
      const content = readFileSync(skillPath, "utf-8");
      return { content: content.slice(0, 8000) };
    } catch (e: any) {
      return { content: "", error: `PDF skill not available: ${e.message}` };
    }
  },
};
