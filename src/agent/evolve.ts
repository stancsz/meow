import { Agent } from "./agent";
import { MissionReviewer } from "./mission_reviewer";
import { QuantumMemory } from "./quantum_memory";
import { Harvester } from "./harvester";
import { ReasoningEngine } from "./reasoning";
import pc from "picocolors";

export interface EvolveOptions {
  maxIterations: number;
  runTests: boolean;
  testCmd?: string;
  onStatus?: (status: string) => void;
}

export class EvolveHarness {
  private agent: Agent;
  private reviewer: MissionReviewer;
  private harvester: Harvester;
  private lastFailurePatterns: string[] = [];

  constructor(agent: Agent) {
    this.agent = agent;
    this.reviewer = new MissionReviewer(agent);
    const quantumMemory = new QuantumMemory(agent.db as any, agent.kernel, agent.reasoningEngine as any);
    this.harvester = new Harvester(quantumMemory);
  }

  /**
   * The Meta-Orchestration Loop.
   * Continuously iterates until the work is verified as "Done" and "Correct".
   */
  public async execute(goal: string, options: EvolveOptions): Promise<string> {
    let iteration = 0;
    let isCoherent = false;
    let lastReviewVerdict = "";

    console.log(pc.bold(pc.magenta(`\n🌀 [EVOLVE] Starting autonomous evolution loop for goal: ${goal}`)));

    while (iteration < options.maxIterations && !isCoherent) {
      iteration++;
      options.onStatus?.(`Iteration ${iteration}/${options.maxIterations}: Reasoning...`);

      // 1. Perform Agent Turn
      // Inject previous review failure as "System Pressure" + learned failure patterns
      const failureContext = this.lastFailurePatterns.length > 0
        ? `\n\nLEARNED FAILURE PATTERNS (from previous attempts):\n${this.lastFailurePatterns.join("\n")}`
        : "";

      const turnInput = iteration === 1
        ? goal
        : `ATTENTION: Your previous attempt failed verification.
           VERDICT: ${lastReviewVerdict}
           REMAINING GOAL: ${goal}
           ACTION: Fix the logic gaps and unfinished work. DO NOT report success until ALL logic is implemented.${failureContext}`;

      const response = await this.agent.chat(turnInput, options.runTests, options.testCmd, options.onStatus);

      // 2. Perform Logic Audit (The Liar Check)
      options.onStatus?.(`Iteration ${iteration}: Verifying logic...`);
      lastReviewVerdict = await this.reviewer.verify(goal, options.testCmd);

      if (lastReviewVerdict.includes("MISSION COHERENT")) {
        isCoherent = true;
        console.log(pc.bold(pc.green(`\n✨ [EVOLVE] Goal achieved and verified in ${iteration} iterations.`)));
      } else {
        // 3. Distill failure pattern into a skill (learning mechanism)
        const failurePattern = `VERDICT: ${lastReviewVerdict} | RESPONSE: ${response.substring(0, 200)}`;
        if (!this.lastFailurePatterns.includes(failurePattern)) {
          this.lastFailurePatterns.push(failurePattern);
        }

        // If we've seen this failure pattern multiple times, distill it into a skill
        const patternFreq = this.lastFailurePatterns.filter(p => p.includes(lastReviewVerdict.split("\n")[0])).length;
        if (patternFreq >= 2 && iteration > 1) {
          console.log(pc.yellow(`\n🌾 [EVOLVE] Distilling repeated failure pattern into skill...`));
          const skillResult = await this.harvester.harvest({
            goal,
            complexity: this.harvester.assessComplexity(goal, iteration),
            sessionLogs: [],
            successfulPatterns: [],
          });
          if (skillResult.success) {
            console.log(pc.green(`  Skill created: ${skillResult.skillName}`));
          }
        }

        console.log(pc.yellow(`\n⚠️ [EVOLVE] Verification failed (Iteration ${iteration}). Restarting loop with feedback...`));
        // Add a small delay to prevent rapid-fire API calls if something is looping
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (!isCoherent) {
      return `❌ [EVOLVE] Failed to reach coherence after ${options.maxIterations} iterations.\nLast Review: ${lastReviewVerdict}`;
    }

    return `✅ Mission Complete.\n${lastReviewVerdict}`;
  }
}
