/**
 * Harvester Specialist
 * 
 * Reads recent session logs from QuantumMemory and "distills" successful logic 
 * into reusable SKILL.md files following the agentskills.io standard format.
 */

import { QuantumMemory } from "./quantum_memory";
import { execSync } from "child_process";
import { writeFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import pc from "picocolors";
import yaml from "js-yaml";
import { config } from "../config/env";

export interface HarvestContext {
  goal: string;
  complexity: "low" | "medium" | "high";
  sessionLogs: string[];
  successfulPatterns: string[];
  skillName?: string;
}

export interface HarvestResult {
  success: boolean;
  skillPath?: string;
  skillName?: string;
  error?: string;
}

export class Harvester {
  private quantumMemory: QuantumMemory;

  constructor(quantumMemory: QuantumMemory) {
    this.quantumMemory = quantumMemory;
  }

  /**
   * Distill session logs into a SKILL.md file.
   * Called after a mission is marked "COHERENT" for complex goals.
   */
  async harvest(ctx: HarvestContext): Promise<HarvestResult> {
    console.log(pc.bold(pc.magenta("\n🌾 [HARVESTER] Starting skill distillation...")));

    try {
      // 1. Extract key patterns from recent memories
      const memories = await this.recallRecentMemories(ctx.goal);
      
      // 2. Generate skill name from goal if not provided
      const skillName = ctx.skillName || this.deriveSkillName(ctx.goal);
      
      // 3. Distill patterns into SKILL.md format
      const skillContent = await this.distillSkillContent(skillName, ctx, memories);
      
      // 4. Write SKILL.md to .meow/skills/<skill-name>/SKILL.md
      const skillPath = await this.writeSkillFile(skillName, skillContent);
      
      console.log(pc.green(`✅ [HARVESTER] Skill created at: ${skillPath}`));
      
      return {
        success: true,
        skillPath,
        skillName
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(pc.red(`❌ [HARVESTER] Failed: ${errorMsg}`));
      return {
        success: false,
        error: errorMsg
      };
    }
  }

  /**
   * Recall recent memories related to the goal.
   */
  private async recallRecentMemories(goal: string): Promise<string[]> {
    // Use a simple embedding proxy for recall
    const mockEmbedding = (text: string): number[] => {
      const dim = config.embeddingDimension;
      const arr = new Array(dim).fill(0);
      const words = text.toLowerCase().split(/\W+/);
      words.forEach(word => {
        if (!word) return;
        let hash = 0;
        for (let i = 0; i < word.length; i++) {
          hash = (hash << 5) - hash + word.charCodeAt(i);
          hash |= 0;
        }
        const idx = Math.abs(hash) % dim;
        arr[idx] += 1;
      });
      if (arr.every(v => v === 0)) arr[0] = 0.0001;
      const magnitude = Math.sqrt(arr.reduce((sum, val) => sum + val * val, 0)) || 1;
      return arr.map(v => v / magnitude);
    };

    const memories = await this.quantumMemory.recall(goal, mockEmbedding(goal));
    return memories.map(m => m.content);
  }

  /**
   * Derive a skill name from a goal string.
   */
  private deriveSkillName(goal: string): string {
    // Convert goal to snake-case skill name
    const words = goal.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 4);
    
    return words.join('-');
  }

  /**
   * Distill the collected information into SKILL.md format.
   */
  private async distillSkillContent(
    skillName: string, 
    ctx: HarvestContext, 
    memories: string[]
  ): Promise<string> {
    const frontmatter = {
      name: skillName,
      description: ctx.goal.split('.').slice(0, 2).join('.') + '.',
      category: this.categorizeGoal(ctx.goal)
    };

    const body = this.buildSkillBody(skillName, ctx, memories);

    return `---\n${yaml.dump(frontmatter)}---\n\n${body}`;
  }

  /**
   * Categorize the goal into a standard skill category.
   */
  private categorizeGoal(goal: string): string {
    const goalLower = goal.toLowerCase();
    if (goalLower.includes('test') || goalLower.includes('verify')) return 'testing';
    if (goalLower.includes('deploy') || goalLower.includes('build')) return 'deployment';
    if (goalLower.includes('fix') || goalLower.includes('bug')) return 'debugging';
    if (goalLower.includes('refactor') || goalLower.includes('clean')) return 'refactoring';
    if (goalLower.includes('api') || goalLower.includes('endpoint')) return 'api-design';
    if (goalLower.includes('auth') || goalLower.includes('security')) return 'security';
    if (goalLower.includes('db') || goalLower.includes('database')) return 'database';
    if (goalLower.includes('config') || goalLower.includes('setup')) return 'configuration';
    return 'general';
  }

  /**
   * Build the main body of the SKILL.md file.
   */
  private buildSkillBody(skillName: string, ctx: HarvestContext, memories: string[]): string {
    const patterns = ctx.successfulPatterns.length > 0 
      ? ctx.successfulPatterns.join('\n')
      : memories.slice(0, 3).join('\n\n');

    return `# ${skillName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}

## Goal
${ctx.goal}

## Patterns Discovered
${patterns}

## Implementation Notes
<!-- Add any specific implementation notes here -->

## Verification
<!-- Add verification steps to ensure the skill works correctly -->

## Examples
<!-- Add usage examples if applicable -->
`;
  }

  /**
   * Write the SKILL.md file to disk.
   */
  private async writeSkillFile(skillName: string, content: string): Promise<string> {
    const skillsDir = resolve(process.cwd(), ".meow", "skills", skillName);
    
    // Ensure directory exists
    await mkdir(skillsDir, { recursive: true });
    
    const skillPath = resolve(skillsDir, "SKILL.md");
    await writeFile(skillPath, content, "utf-8");
    
    return skillPath;
  }

  /**
   * Assess whether a goal is complex enough to warrant a new skill.
   */
  assessComplexity(goal: string, iterations: number): "low" | "medium" | "high" {
    const goalLength = goal.split(/\s+/).length;
    const hasComplexKeywords = /multi-file|refactor|architecture|system design/i.test(goal);
    
    if (iterations > 3 || goalLength > 20 || hasComplexKeywords) {
      return "high";
    } else if (iterations > 1 || goalLength > 10) {
      return "medium";
    }
    return "low";
  }
}
