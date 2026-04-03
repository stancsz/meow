/**
 * skills/index.ts
 *
 * Central export for all skills. Import this to register all skills.
 */
import { registerSkill, getAllSkills, findSkill, type Skill } from "./loader.ts";
import { simplify } from "./simplify.ts";
import { review } from "./review.ts";
import { commit } from "./commit.ts";
import { learn } from "./learn.ts";
import { mcp } from "./mcp.ts";
import { perms } from "./perms.ts";
import { permissions } from "./permissions.ts";
import { help } from "./help.ts";
import { auto } from "./auto.ts";

// Register all skills
const allSkills: Skill[] = [
  simplify,
  review,
  commit,
  learn,
  mcp,
  perms,
  permissions,
  help,
  auto,
];

// Auto-register on import
for (const skill of allSkills) {
  registerSkill(skill);
}

export const skills = allSkills;
export { getAllSkills, findSkill, registerSkill, formatSkillsList } from "./loader.ts";
export type { Skill, SkillContext, SkillResult } from "./loader.ts";
