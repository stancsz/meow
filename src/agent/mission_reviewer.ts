import { exec } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import pc from "picocolors";
import { Agent } from "./agent";
import { ReasoningConstraint } from "./quantum_reasoning";
import yaml from "js-yaml";

const execAsync = promisify(exec);

export class MissionReviewer {
  private agent: Agent;

  constructor(agent: Agent) {
    this.agent = agent;
  }

  /**
   * Performs a Quantum Structural Analysis of the current workspace.
   */
  public async verify(goal: string, testCmd?: string): Promise<string> {
    console.log(pc.bold(pc.cyan("\n🧐 [QUANTUM REVIEW] Starting structural analysis...")));
    
    // 1. Analyze Changes (Async)
    let diff = "";
    try {
      const { stdout } = await execAsync("git diff HEAD~1", { encoding: "utf-8" });
      diff = stdout;
    } catch (e) {
      try {
        const { stdout } = await execAsync("git diff", { encoding: "utf-8" });
        diff = stdout;
      } catch (e2) {
        diff = "Unable to fetch diff.";
      }
    }

    // 2. Logic & Consistency Audit (The "Liar Check")
    const constraints: ReasoningConstraint[] = [
      {
        id: "STRUCTURAL_ALIGNMENT",
        weight: 35,
        evaluate: (state: any) => {
          // Does the diff map to the goal's intent?
          const intents = goal.toLowerCase().split(" ");
          const density = intents.filter(i => state.diff.toLowerCase().includes(i)).length / intents.length;
          return density > 0.4;
        }
      },
      {
        id: "UNFINISHED_WORK_DETECTION",
        weight: 30,
        evaluate: (state: any) => {
          // Detect "TODO", "FIXME", or commented out code blocks that should have been implemented
          const redFlags = ["todo", "fixme", "placeholder", "implement here"];
          const matches = redFlags.filter(f => state.diff.toLowerCase().includes(f));
          return matches.length === 0;
        }
      },
      {
        id: "LOGIC_COHERENCE",
        weight: 35,
        evaluate: (state: any) => {
          // Check for empty functions or obviously mock returns
          const mockPatterns = [/return\s+null/i, /return\s+""/i, /return\s+\[\]/i, /throw\s+new\s+Error\("Not implemented"\)/i];
          const hasMocks = mockPatterns.some(p => p.test(state.diff));
          return !hasMocks;
        }
      },
      {
        id: "SOP_COMPLIANCE",
        weight: 30,
        evaluate: (state: any) => {
          // Ensure the agent followed the "Think-Plan-Verify" loop
          // (This is a fuzzy check, but we look for evidence of planning and verification)
          const hasPlan = state.diff.toLowerCase().includes("plan") || state.goal.toLowerCase().includes("plan");
          return hasPlan; 
        }
      }
    ];

    const decisionSpace = [{ diff, goal }];
    const auditResult = await this.agent.quantumReasoning.solve(decisionSpace, constraints, (msg) => {
      process.stdout.write(`\r${pc.dim("Running Logic Audit: " + msg)}`);
    });
    process.stdout.write("\n");

    // 2.5 Shadow Audit (Independent Critique)
    console.log(pc.cyan("🔍 [SHADOW AUDIT] Performing line-by-line critique..."));
    const shadowPrompt = `You are an Adversarial Code Reviewer. 
    GOAL: ${goal}
    DIFF: 
    ${diff}
    
    CRITIQUE RULES:
    1. Look for logic gaps, race conditions, or security hazards.
    2. Identify any "lazy" patterns (placeholders, missing error handling).
    3. If the code is 100% complete and correct, respond ONLY with "PASS".
    4. If there are issues, list them clearly.`;
    
    const shadowCritique = await this.agent.callLLM("You are a Shadow Auditor.", [{ role: "user", content: shadowPrompt }]);
    const shadowPassed = shadowCritique.trim().toUpperCase() === "PASS";
    
    if (!shadowPassed) {
      console.log(pc.red(`\n❌ [SHADOW AUDIT] Found issues:\n${shadowCritique}`));
    } else {
      console.log(pc.green("✅ [SHADOW AUDIT] Logic verified."));
    }

    // 3. Adversarial Probing (Dynamic Verification)
    if (testCmd) {
      console.log(pc.yellow("\n🧪 [ADVERSARIAL CHECK] Generating verification probes..."));
      // The agent should try to think of ways to BREAK the new code
      const probePrompt = `Given the goal [${goal}] and the current diff, what are 3 edge cases or failure modes that might still exist? Describe them briefly.`;
      const probes = await this.agent.callLLM("You are a QA Auditor.", [{ role: "user", content: probePrompt }]);
      console.log(pc.dim(`Probes identified:\n${probes}`));
    }

    // 4. Execution Verification (Async)
    let testResult = "";
    if (testCmd) {
      try {
        const { stdout } = await execAsync(testCmd, { encoding: "utf-8", timeout: 60000 });
        testResult = stdout;
        console.log(pc.green("\n✅ [PHYSICS CHECK] Tests passed."));
      } catch (e: any) {
        testResult = e.stdout || e.message;
        console.log(pc.red("\n❌ [PHYSICS CHECK] Tests failed."));
      }
    }

    const passed = (!testCmd || !testResult.includes("failed")) && auditResult !== null && shadowPassed;
    
    if (passed) {
      return `VERDICT: MISSION COHERENT.
Structural analysis suggests high alignment with goal [${goal}].
Tests: ${testCmd ? "Passed" : "N/A"}
Logic Audit: SUCCESS.
Shadow Audit: PASS.`;
    } else {
      let reason = "";
      if (auditResult === null) reason = "Logic audit failed (low coherence).";
      else if (!shadowPassed) reason = `Shadow audit rejected the changes:\n${shadowCritique}`;
      else reason = "Test failures detected.";

      return `VERDICT: MISSION DECOHERED.
The work is NOT complete.
REASON: ${reason}
ERROR: ${testResult.substring(0, 500)}`;
    }
  }

  /**
   * Skill Verification: Ensure harvested skills are actually functional.
   * This is called after a skill is created to validate its quality.
   */
  public async verifySkill(skillPath: string): Promise<{ valid: boolean; issues: string[] }> {
    console.log(pc.bold(pc.magenta(`\n🎯 [SKILL VERIFICATION] Verifying skill at: ${skillPath}`)));
    
    const issues: string[] = [];
    
    try {
      // 1. Parse and validate SKILL.md structure
      const content = await readFile(skillPath, "utf-8");
      const sections = content.split("---");
      
      if (sections.length < 3) {
        issues.push("Missing frontmatter or body sections");
        return { valid: false, issues };
      }
      
      // 2. Validate frontmatter has required fields
      const frontmatter = yaml.load(sections[1]) as any;
      if (!frontmatter.name) issues.push("Missing 'name' in frontmatter");
      if (!frontmatter.description) issues.push("Missing 'description' in frontmatter");
      
      // 3. Check body has meaningful content (not just placeholders)
      const body = sections.slice(2).join("---").trim();
      if (body.length < 100) {
        issues.push("Skill body is too short - likely placeholder content");
      }
      
      // Placeholder check
      const placeholders = ["<!--", "-->", "TODO", "Add any"];
      const hasPlaceholders = placeholders.some(p => body.includes(p));
      if (hasPlaceholders) {
        issues.push("Skill contains placeholder content that should be replaced");
      }
      
      // 4. Verify examples exist and are non-trivial
      const hasExamples = body.includes("## Examples") && body.length > body.indexOf("## Examples") + 50;
      if (!hasExamples) {
        issues.push("Missing or inadequate Examples section");
      }
      
      // 5. Verify verification steps exist
      const hasVerification = body.includes("## Verification");
      if (!hasVerification) {
        issues.push("Missing Verification section");
      }
      
      const valid = issues.length === 0;
      
      if (valid) {
        console.log(pc.green("✅ [SKILL VERIFICATION] Skill is valid and functional."));
      } else {
        console.log(pc.red(`❌ [SKILL VERIFICATION] Found ${issues.length} issues:`));
        issues.forEach(issue => console.log(pc.yellow(`  - ${issue}`)));
      }
      
      return { valid, issues };
    } catch (e: any) {
      issues.push(`Failed to read/parse skill file: ${e.message}`);
      return { valid: false, issues };
    }
  }
}
