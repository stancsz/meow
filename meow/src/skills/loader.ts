/**
 * skills/loader.ts
 *
 * Skill system for Meow. Skills are modular capabilities that extend
 * the core agent without bloating it.
 */
import { existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================================
// Types
// ============================================================================

export interface Skill {
  name: string;           // slash command name (e.g., "simplify")
  description: string;    // description for the model
  aliases?: string[];     // alternative names
  execute: (args: string, context: SkillContext) => Promise<SkillResult>;
}

export interface SkillContext {
  cwd: string;
  dangerous: boolean;
}

export interface SkillResult {
  content: string;
  error?: string;
}

// ============================================================================
// Built-in Skills
// ============================================================================

export { simplify } from "./simplify.ts";
export { review } from "./review.ts";
export { commit } from "./commit.ts";

// ============================================================================
// Skill Loader
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));

const builtInSkills: Skill[] = [];

function loadBuiltInSkills(): Skill[] {
  // Import and register built-in skills
  // These are imported statically to keep things lean
  return [
    // Skills will be auto-registered here
  ];
}

export function registerSkill(skill: Skill): void {
  builtInSkills.push(skill);
}

export function getAllSkills(): Skill[] {
  return [...builtInSkills];
}

export function findSkill(name: string): Skill | undefined {
  const lower = name.toLowerCase();
  return builtInSkills.find(
    (s) =>
      s.name.toLowerCase() === lower ||
      s.aliases?.some((a) => a.toLowerCase() === lower)
  );
}

export function formatSkillsList(): string {
  const skills = getAllSkills();
  if (skills.length === 0) return "No skills available.";

  let output = "## Available Skills\n\n";
  for (const skill of skills) {
    output += `  /${skill.name} - ${skill.description}`;
    if (skill.aliases?.length) {
      output += ` (alias: ${skill.aliases.map((a) => "/" + a).join(", ")})`;
    }
    output += "\n";
  }
  return output;
}

// ============================================================================
// Skill Registry (auto-initialize)
// ============================================================================

// Auto-load skills from directory
export function initializeSkills(): void {
  const skillsDir = join(__dirname);

  if (!existsSync(skillsDir)) return;

  const files = readdirSync(skillsDir).filter(
    (f) => f.endsWith(".ts") && f !== "loader.ts" && f !== "index.ts"
  );

  // In a full implementation, we'd dynamically import these
  // For now, skills are registered via registerSkill()
}
