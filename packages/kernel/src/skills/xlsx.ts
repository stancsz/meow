/**
 * xlsx.ts
 *
 * XLSX skill - loads SKILL.md from the xlsx skill directory.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Skill, SkillContext, SkillResult } from "./loader.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const xlsx: Skill = {
  name: "xlsx",
  description: "Create and edit Excel spreadsheets (.xlsx). Supports formulas, formatting, data analysis, and visualization.",
  aliases: ["excel", "spreadsheet"],

  async execute(_args: string, _ctx: SkillContext): Promise<SkillResult> {
    try {
      const skillPath = join(__dirname, "xlsx", "SKILL.md");
      const content = readFileSync(skillPath, "utf-8");
      return { content: content.slice(0, 8000) };
    } catch (e: any) {
      return { content: "", error: `XLSX skill not available: ${e.message}` };
    }
  },
};
