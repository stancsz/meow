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
import { execSkill } from "./exec.ts";
import { database } from "./database.ts";
import { context7 } from "./context7.ts";
import { pptx } from "./pptx.ts";
import { docx } from "./docx.ts";
import { pdf } from "./pdf.ts";
import { xlsx } from "./xlsx.ts";
import { tutorial } from "./tutorial.ts";

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
  execSkill,
  database,
  context7,
  pptx,
  docx,
  pdf,
  xlsx,
  tutorial,
];

// Auto-register on import
for (const skill of allSkills) {
  registerSkill(skill);
}

export const skills = allSkills;
export { getAllSkills, findSkill, registerSkill, formatSkillsList } from "./loader.ts";
export type { Skill, SkillContext, SkillResult } from "./loader.ts";
