/**
 * skills/remember.ts — Structured Memory Recording Skill
 */
import { storeMemory } from "../sidecars/memory-fts";
import type { Skill, SkillContext, SkillResult } from "./loader.ts";

export const remember: Skill = {
  name: "remember",
  description: "Store a specific fact into the Sovereign Palace",
  aliases: ["learn-fact", "memorize"],

  async execute(args: string, ctx: SkillContext): Promise<SkillResult> {
    const parts = args.split(/\s+/);
    const factParts = [];
    const options: any = { source: "user", tags: [] };

    for (let i = 0; i < parts.length; i++) {
        if (parts[i] === "--wing") {
          options.wing = parts[++i];
        } else if (parts[i] === "--room") {
          options.room = parts[++i];
        } else if (parts[i] === "--tags") {
          options.tags = parts[++i]?.split(",") || [];
        } else {
          factParts.push(parts[i]);
        }
    }

    const fact = factParts.join(" ");
    if (!fact) {
        return { content: "", error: "Usage: /remember <fact> [--wing <wing>] [--room <room>] [--tags <t1,t2>]" };
    }

    try {
        const id = storeMemory("Fact", fact, {
            ...options,
            drawer: "Remembered"
        });
        return { content: `Memory stored successfully (ID: ${id}) in Wing: ${options.wing || "default"}` };
    } catch (e: any) {
        return { content: "", error: `Failed to store memory: ${e.message}` };
    }
  },
};
