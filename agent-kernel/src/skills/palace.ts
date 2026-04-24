/**
 * skills/palace.ts — Sovereign Memory Recall Skill
 */
import { searchMemory, formatSearchResults } from "../sidecars/memory-fts";
import type { Skill, SkillContext, SkillResult } from "./loader.ts";

export const palace: Skill = {
  name: "palace",
  description: "Search the Sovereign Palace memory hierarchy",
  aliases: ["recall", "memory-search"],

  async execute(args: string, _ctx: SkillContext): Promise<SkillResult> {
    const parts = args.split(/\s+/);
    const queryParts = [];
    const filters: any = {};

    for (let i = 0; i < parts.length; i++) {
        if (parts[i] === "--wing") {
          filters.wing = parts[++i];
        } else if (parts[i] === "--room") {
          filters.room = parts[++i];
        } else {
          queryParts.push(parts[i]);
        }
    }

    const query = queryParts.join(" ");
    if (!query) {
        return { content: "", error: "Usage: /palace <query> [--wing <wing>] [--room <room>]" };
    }

    try {
        const results = searchMemory(query, 10, filters);
        return { content: formatSearchResults(results) };
    } catch (e: any) {
        return { content: "", error: `Memory search failed: ${e.message}` };
    }
  },
};
