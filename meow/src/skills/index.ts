/**
 * skills/index.ts
 *
 * Central export for all skills. Import this to register all skills.
 */
import { registerSkill, getAllSkills, findSkill, type Skill } from "./loader.ts";
import { simplify } from "./simplify.ts";
import { review } from "./review.ts";
import { commit } from "./commit.ts";

// Register all skills
const allSkills: Skill[] = [
  simplify,
  review,
  commit,
];

// Auto-register on import
for (const skill of allSkills) {
  registerSkill(skill);
}

export const skills = allSkills;
export { getAllSkills, findSkill, registerSkill, formatSkillsList } from "./loader.ts";
export type { Skill, SkillContext, SkillResult } from "./loader.ts";
