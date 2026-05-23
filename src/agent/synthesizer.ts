/**
 * KnowledgeSynthesizer — AI-Native Phase 3.1
 *
 * Diarizes episodic_memory + audit_log into synthesized SKILL.md updates.
 * "Software is ephemeral, context is sacred" — SKILL.md files are regenerated
 * from data, not hand-maintained.
 */

import { MeowDatabase } from "../kernel/database";
import { config } from "../config/env";
import fs from "fs";
import path from "path";

export class KnowledgeSynthesizer {
  private db: MeowDatabase;
  private runId: string;

  constructor(db: MeowDatabase) {
    this.db = db;
    this.runId = `synth-${Date.now()}`;
  }

  /**
   * Synthesize learned patterns into updated SKILL.md files.
   */
  async synthesize(): Promise<void> {
    console.log("[KnowledgeSynthesizer] Starting synthesis...");

    // 1. Query recent task outcomes grouped by skill usage
    const outcomes = this.db.getTaskOutcomes(undefined, 200);

    // 2. Group by skill effectiveness
    const skillStats = this.computeSkillStats(outcomes);

    // 3. Ask LLM to propose SKILL.md updates based on data
    for (const [skillName, stats] of Object.entries(skillStats)) {
      if (stats.totalUses < 5) continue; // Skip low-sample skills
      const update = await this.proposeSkillUpdate(skillName, stats);
      if (update) {
        await this.updateSkillFile(skillName, update);
      }
    }

    // 4. Regenerate CLAUDE.md sections
    await this.regenerateClaudeMd(outcomes);

    console.log("[KnowledgeSynthesizer] Synthesis complete.");
  }

  private computeSkillStats(outcomes: any[]): Record<string, { success: number; failure: number; totalUses: number }> {
    const stats: Record<string, { success: number; failure: number; totalUses: number }> = {};
    for (const o of outcomes) {
      if (!o.skills_used) continue;
      try {
        const skills = JSON.parse(o.skills_used) as string[];
        for (const s of skills) {
          if (!stats[s]) stats[s] = { success: 0, failure: 0, totalUses: 0 };
          stats[s].totalUses++;
          if (o.result === "success") stats[s].success++;
          else stats[s].failure++;
        }
      } catch {}
    }
    return stats;
  }

  private async proposeSkillUpdate(skillName: string, stats: { success: number; failure: number; totalUses: number }): Promise<string | null> {
    const successRate = stats.success / stats.totalUses;
    const prompt = `A skill called "${skillName}" was used ${stats.totalUses} times in meow-swarm.
Success rate: ${(successRate * 100).toFixed(1)}}%
Failures: ${stats.failure}

Based on this data, propose a concise improvement to the SKILL.md content for this skill.
Respond with the improved markdown content (just the body, no frontmatter).
If no improvement is needed, respond with "NO_CHANGE".`;

    try {
      const result = await this.callLLM(prompt);
      if (result.trim() === "NO_CHANGE") return null;
      return result;
    } catch {
      return null;
    }
  }

  private async updateSkillFile(skillName: string, content: string): Promise<void> {
    const skillFile = path.join(process.cwd(), ".meow", "skills", `${skillName}.md`);
    if (!fs.existsSync(skillFile)) {
      console.log(`[KnowledgeSynthesizer] Skill file not found: ${skillFile}`);
      return;
    }
    const existing = fs.readFileSync(skillFile, "utf8");
    const frontmatterMatch = existing.match(/^---\n[\s\S]*?\n---\n/);
    const frontmatter = frontmatterMatch ? frontmatterMatch[0] : "";
    fs.writeFileSync(skillFile, frontmatter + content.trim() + "\n");
    console.log(`[KnowledgeSynthesizer] Updated: ${skillFile}`);
  }

  /**
   * Regenerate CLAUDE.md sections from recent episodic memory.
   */
  async regenerateClaudeMd(outcomes: any[]): Promise<void> {
    const prompt = `You are synthesizing recent meow-swarm task history into an updated context document.

Recent task outcomes (${outcomes.length} tasks):
${outcomes.slice(0, 50).map((o: any) => `- [${o.result}] ${o.task_text?.substring(0, 100)}`).join("\n")}

Generate a "Learned Patterns" section for CLAUDE.md that:
1. Lists patterns that have worked well (high success rate task types)
2. Lists known failure modes to avoid
3. Is concise and actionable (bullet points, max 30 lines total)

Respond with ONLY the markdown content to append to CLAUDE.md.`;

    try {
      const result = await this.callLLM(prompt);
      const claudeMdPath = path.join(process.cwd(), "CLAUDE.md");
      const existing = fs.readFileSync(claudeMdPath, "utf8");

      // Remove old "Learned Patterns" section if it exists
      const cleaned = existing.replace(/## Learned Patterns\n[\s\S]*?(?=\n##|\n#|$)/, "").trim();
      const updated = cleaned + "\n\n## Learned Patterns\n" + result.trim() + "\n";

      fs.writeFileSync(claudeMdPath, updated);
      console.log("[KnowledgeSynthesizer] Regenerated CLAUDE.md Learned Patterns section.");
    } catch (err) {
      console.warn("[KnowledgeSynthesizer] Failed to regenerate CLAUDE.md:", err);
    }
  }

  private async callLLM(prompt: string): Promise<string> {
    const url = `${config.baseUrl}/v1/messages`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: config.model || "minimax",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1024,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      if (!response.ok) throw new Error(`LLM error: ${response.status}`);
      const data = await response.json() as any;
      return data.content?.[0]?.text ?? "";
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }
}