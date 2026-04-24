/**
 * skill-distiller.ts - Autonomous Skill Generation (Voyager style)
 *
 * Takes a successful job run and distills it into a reusable 'Skill'
 * in the .claude/skills/ format.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runLeanAgent } from "../../agent-kernel/src/core/lean-agent.ts";
import { installSkillFromPath } from "./skill-manager.ts";

export interface DistillationResult {
  success: boolean;
  skillName?: string;
  message: string;
}

/**
 * Distills a successful job into a reusable skill.
 */
export async function distillJobToSkill(
  jobName: string,
  prompt: string,
  output: string,
  cwd: string
): Promise<DistillationResult> {
  console.log(`[distiller] Distilling skill from successful job: ${jobName}...`);

  const librarianPrompt = `You are a Skill Librarian. 
  A mission was completed successfully. Your goal is to distill this mission into a reusable "Skill" for Claude Code.
  
  MISSION NAME: ${jobName}
  INITIAL PROMPT: ${prompt}
  MISSION OUTPUT (truncated): ${output.slice(-2000)}
  
  A "Skill" consists of:
  1. A unique, short name (e.g., "refactor-react-hooks", "fix-ts-imports").
  2. A description of what the skill does.
  3. A set of specific, technical instructions (the "Core Pattern") that worked.
  
  Respond with a JSON block:
  {
    "name": "unique-skill-name",
    "description": "Short description",
    "instructions": "Markdown formatted instructions for future agents"
  }`;

  try {
    const result = await runLeanAgent(librarianPrompt, { maxIterations: 1 });
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, message: "Could not parse Librarian response" };
    }

    const { name, description, instructions } = JSON.parse(jsonMatch[0]);
    const skillName = name.toLowerCase().replace(/[^a-z0-9-]/g, "-");

    // Create temporary skill structure
    const tmpDir = join(cwd, "tmp", `skill-distill-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    const skillMd = `# ${skillName}\n\n${description}\n\n## Instructions\n\n${instructions}`;
    writeFileSync(join(tmpDir, "SKILL.md"), skillMd);

    // Install using existing manager
    const installed = installSkillFromPath(tmpDir, skillName, cwd);

    if (installed) {
      return {
        success: true,
        skillName,
        message: `Successfully distilled and installed skill: ${skillName}`,
      };
    } else {
      return { success: false, message: "Installation failed" };
    }
  } catch (e: any) {
    console.error("[distiller] Error:", e);
    return { success: false, message: e.message };
  }
}
