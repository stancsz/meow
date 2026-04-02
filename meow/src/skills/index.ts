/**
 * skills/index.ts
 *
 * Central export for all skills. Import this to register all skills.
 */
import { registerSkill, type Skill } from "./loader.ts";
import { simplify } from "./simplify.ts";
import { review } from "./review.ts";
import { commit } from "./commit.ts";

// Register all skills
export const skills: Skill[] = [
  simplify,
  review,
  commit,
];

// Auto-register on import
for (const skill of skills) {
  registerSkill(skill);
}

export { simplify, review, commit } from "./loader.ts";
export type { Skill, SkillContext, SkillResult } from "./loader.ts";
