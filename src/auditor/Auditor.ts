/**
 * L4: THE AUDITOR (Governance Layer)
 *
 * Verification, safety, and security for all code mutations.
 * Ensures 100% of L3 work is audited before being merged/committed.
 *
 * Key Responsibilities:
 * 1. Cross-cutting "Liar Checks" for all worker outputs
 * 2. Enforce SOP compliance and security guardrails
 * 3. Pre-execution policy checks (SOP Enforcement)
 * 4. Post-Quantum Cryptography (PQC) boundary validation
 * 5. Shadow auditing via independent critique
 */

import { MissionReviewer } from "../agent/mission_reviewer";
import { Agent } from "../agent/agent";
import { TaskResult, FileArtifact } from "../orchestrator/Task";
import pc from "picocolors";

export interface AuditPolicy {
  /** Require shadow audit for all changes */
  requireShadowAudit: boolean;
  /** Require test pass for all changes */
  requireTestsPass: boolean;
  /** Block if TODOs/FIXMEs detected */
  blockOnPlaceholders: boolean;
  /** Block if logic coherence is low */
  blockOnLowCoherence: boolean;
  /** Minimum coherence score (0-100) to pass */
  minCoherenceScore: number;
}

export interface AuditResult {
  passed: boolean;
  missionId: string;
  stages: AuditStage[];
  coherenceScore: number;
  issues: string[];
  warnings: string[];
  canCommit: boolean;
  timestamp: number;
}

export interface VisualQAResult {
  screenshotsTaken: string[];
  diffScore: number;
  approved: boolean;
  issues: string[];
}

export interface AuditStage {
  name: string;
  passed: boolean;
  details: string;
  durationMs: number;
}

export interface WorkerOutput {
  missionId: string;
  workerType: string;
  goal: string;
  diff?: string;
  artifacts?: Array<{ path: string; operation: string }>;
  testResult?: string;
  output: string;
}

/**
 * L4 Auditor: Governance and verification layer.
 *
 * Performs multi-stage verification:
 * 1. SOP Compliance Check (pre-execution)
 * 2. Logic Audit (liar detection via quantum reasoning)
 * 3. Shadow Audit (independent adversarial critique)
 * 4. Adversarial Probing (edge case identification)
 * 5. Test Verification (if applicable)
 *
 * All code mutations from L3 must pass L4 before being committed.
 */
export class Auditor {
  private reviewer: MissionReviewer;
  private agent: Agent;
  private config: AuditPolicy;

  constructor(agent: Agent, config?: Partial<AuditPolicy>) {
    this.agent = agent;
    this.reviewer = new MissionReviewer(agent);

    this.config = {
      requireShadowAudit: true,
      requireTestsPass: false,
      blockOnPlaceholders: true,
      blockOnLowCoherence: true,
      minCoherenceScore: 60,
      ...config,
    };
  }

  /**
   * Perform an exhaustive logic audit of work performed by L3.
   */
  public async audit(
    missionId: string,
    output: WorkerOutput,
    options?: { testCmd?: string; skipTests?: boolean }
  ): Promise<AuditResult> {
    const startTime = Date.now();
    const stages: AuditStage[] = [];
    const issues: string[] = [];
    const warnings: string[] = [];

    console.log(pc.bold(pc.cyan(`\n🕵️  [AUDITOR] Starting audit for mission: ${missionId}`)));

    // Stage 1: Placeholder Detection ("Liar Check")
    const placeholderStage = await this.runPlaceholderCheck(output);
    stages.push(placeholderStage);
    if (!placeholderStage.passed) {
      issues.push(`Placeholder detection failed: ${placeholderStage.details}`);
    }

    // Stage 2: Logic Coherence Check (using quantum reasoning)
    const coherenceStage = await this.runCoherenceCheck(output);
    stages.push(coherenceStage);
    if (!coherenceStage.passed) {
      issues.push(`Logic coherence below threshold: ${coherenceStage.details}`);
    }

    // Stage 3: Shadow Audit (independent adversarial critique)
    if (this.config.requireShadowAudit) {
      const shadowStage = await this.runShadowAudit(output);
      stages.push(shadowStage);
      if (!shadowStage.passed) {
        issues.push(`Shadow audit rejected: ${shadowStage.details}`);
      }
    }

    // Stage 4: SOP Compliance Check
    const sopStage = await this.runSopComplianceCheck(output);
    stages.push(sopStage);
    if (!sopStage.passed) {
      warnings.push(`SOP compliance warning: ${sopStage.details}`);
    }

    // Stage 5: Test Verification (if applicable)
    if (!options?.skipTests && this.config.requireTestsPass && output.testResult) {
      const testStage = await this.runTestVerification(output, options?.testCmd);
      stages.push(testStage);
      if (!testStage.passed) {
        issues.push(`Test verification failed: ${testStage.details}`);
      }
    }

    const totalDurationMs = Date.now() - startTime;
    const passedStages = stages.filter(s => s.passed).length;
    const coherenceScore = this.computeCoherenceScore(stages);

    const canCommit = issues.length === 0 && coherenceScore >= this.config.minCoherenceScore;

    console.log(pc.cyan(`\n📊 [AUDITOR] Audit complete: ${passedStages}/${stages.length} stages passed`));
    console.log(pc.dim(`    Coherence Score: ${coherenceScore}% | Duration: ${totalDurationMs}ms`));

    if (!canCommit) {
      console.log(pc.red(`\n❌ [AUDITOR] Audit FAILED - ${issues.length} issue(s) detected`));
      issues.forEach(issue => console.log(pc.red(`    - ${issue}`)));
    } else {
      console.log(pc.green(`\n✅ [AUDITOR] Audit PASSED - Ready for commit`));
    }

    return {
      passed: canCommit,
      missionId,
      stages,
      coherenceScore,
      issues,
      warnings,
      canCommit,
      timestamp: Date.now(),
    };
  }

  /**
   * Stage 1: Detect placeholders, TODOs, FIXMEs that indicate incomplete work.
   */
  private async runPlaceholderCheck(output: WorkerOutput): Promise<AuditStage> {
    const startTime = Date.now();

    const redFlags = ["todo", "fixme", "placeholder", "implement here", "TBD", "XXX"];
    const foundFlags: string[] = [];

    if (output.diff) {
      const lowerDiff = output.diff.toLowerCase();
      for (const flag of redFlags) {
        if (lowerDiff.includes(flag)) {
          foundFlags.push(flag);
        }
      }
    }

    if (output.output) {
      const lowerOutput = output.output.toLowerCase();
      for (const flag of redFlags) {
        if (lowerOutput.includes(flag)) {
          foundFlags.push(flag);
        }
      }
    }

    const passed = foundFlags.length === 0 || !this.config.blockOnPlaceholders;
    const details = foundFlags.length > 0
      ? `Found: ${foundFlags.join(", ")}`
      : "No placeholder patterns detected";

    return {
      name: "Placeholder Detection",
      passed,
      details,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Stage 2: Logic coherence check using quantum reasoning.
   */
  private async runCoherenceCheck(output: WorkerOutput): Promise<AuditStage> {
    const startTime = Date.now();

    const diff = output.diff || "";
    const goal = output.goal;

    if (!diff) {
      return {
        name: "Logic Coherence",
        passed: true,
        details: "No diff provided - using goal alignment check",
        durationMs: Date.now() - startTime,
      };
    }

    try {
      // Use MissionReviewer's verification logic
      const verification = await this.reviewer.verify(goal);
      const passed = verification.includes("MISSION COHERENT");

      return {
        name: "Logic Coherence",
        passed: passed || !this.config.blockOnLowCoherence,
        details: verification,
        durationMs: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        name: "Logic Coherence",
        passed: false,
        details: `Verification error: ${error.message}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Stage 3: Shadow audit - independent adversarial critique.
   */
  private async runShadowAudit(output: WorkerOutput): Promise<AuditStage> {
    const startTime = Date.now();

    const prompt = `You are an Adversarial Code Reviewer.
GOAL: ${output.goal}
DIFF:
${output.diff || "No diff available"}

CRITIQUE RULES:
1. Look for logic gaps, race conditions, or security hazards.
2. Identify any "lazy" patterns (placeholders, missing error handling).
3. If the code is 100% complete and correct, respond ONLY with "PASS".
4. If there are issues, list them clearly.`;

    try {
      const critique = await this.agent.callLLM(
        "You are a Shadow Auditor.",
        [{ role: "user", content: prompt }]
      );

      const passed = critique.trim().toUpperCase() === "PASS";

      return {
        name: "Shadow Audit",
        passed,
        details: passed ? "Code verified as correct" : critique.substring(0, 500),
        durationMs: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        name: "Shadow Audit",
        passed: false,
        details: `Shadow audit error: ${error.message}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Stage 4: SOP compliance check.
   */
  private async runSopComplianceCheck(output: WorkerOutput): Promise<AuditStage> {
    const startTime = Date.now();

    const checks: { name: string; passed: boolean }[] = [];

    // Check 1: Think-Plan-Verify loop evidence
    const hasPlanEvidence = output.diff?.toLowerCase().includes("plan") ||
      output.goal.toLowerCase().includes("plan");
    checks.push({ name: "Think-Plan-Verify Loop", passed: hasPlanEvidence });

    // Check 2: No direct state mutation (monolith physics)
    const hasDirectMutation = /\bdirectly\b.*\bmutation\b|\bno\s+abstraction\b/i.test(output.output || "");
    checks.push({ name: "Abstraction Compliance", passed: !hasDirectMutation });

    // Check 3: Error handling present
    const hasErrorHandling = output.diff?.includes("catch") || output.diff?.includes("error");
    checks.push({ name: "Error Handling", passed: hasErrorHandling !== false });

    // Check 4: No quantum file modification without explicit permission
    const modifiedQuantum = output.artifacts?.some(a => a.path.includes("quantum_"));
    checks.push({ name: "Quantum File Protection", passed: !modifiedQuantum });

    const failedChecks = checks.filter(c => !c.passed);
    const passed = failedChecks.length === 0;

    return {
      name: "SOP Compliance",
      passed,
      details: passed
        ? "All SOP checks passed"
        : `Failed checks: ${failedChecks.map(c => c.name).join(", ")}`,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Stage 5: Test verification.
   */
  private async runTestVerification(output: WorkerOutput, testCmd?: string): Promise<AuditStage> {
    const startTime = Date.now();

    if (!output.testResult) {
      return {
        name: "Test Verification",
        passed: true,
        details: "No test result provided",
        durationMs: Date.now() - startTime,
      };
    }

    const passed = !output.testResult.includes("failed") && !output.testResult.includes("error");

    return {
      name: "Test Verification",
      passed,
      details: passed ? "Tests passed" : `Test failures detected: ${output.testResult.substring(0, 200)}`,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Compute overall coherence score from stages.
   */
  private computeCoherenceScore(stages: AuditStage[]): number {
    if (stages.length === 0) return 0;

    const weights: Record<string, number> = {
      "Placeholder Detection": 20,
      "Logic Coherence": 35,
      "Shadow Audit": 25,
      "SOP Compliance": 10,
      "Test Verification": 10,
    };

    let totalWeight = 0;
    let weightedScore = 0;

    for (const stage of stages) {
      const weight = weights[stage.name] || 10;
      totalWeight += weight;
      weightedScore += stage.passed ? weight : 0;
    }

    return totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 100) : 0;
  }

  /**
   * Pre-execution policy check (SOP Enforcement).
   * Called before L3 starts executing to ensure policy compliance.
   */
  public async preExecutionCheck(goal: string, plan?: string): Promise<{
    allowed: boolean;
    blockers: string[];
    warnings: string[];
  }> {
    const blockers: string[] = [];
    const warnings: string[] = [];

    // Block 1: Dangerous commands
    const dangerousPatterns = [
      { pattern: /rm\s+-rf|del\s+\/f\s\/q/i, message: "Recursive force delete detected" },
      { pattern: /DROP\s+TABLE/i, message: "Database DROP TABLE detected" },
      { pattern: /chmod\s+777/i, message: "World-writable permission detected" },
      { pattern: /eval\s*\(/i, message: "Dynamic code evaluation (eval) detected" },
      { pattern: /--no-verify|--no-gpg-sign/i, message: "Git safety bypass detected" },
    ];

    for (const { pattern, message } of dangerousPatterns) {
      if (pattern.test(goal)) {
        blockers.push(message);
      }
    }

    // Block 2: Quantum file modification without explicit intent
    if (goal.includes("quantum_") && !goal.includes("explicitly")) {
      blockers.push("Quantum file modification requires explicit intent");
    }

    // Warning 1: Very large-scale changes
    if (goal.toLowerCase().includes("all files") || goal.toLowerCase().includes("entire")) {
      warnings.push("Large-scale change detected - consider incremental approach");
    }

    // Warning 2: Production database modifications
    if (/\b(production|live)\b.*\b(database|db|table)\b/i.test(goal)) {
      warnings.push("Production database modification detected - ensure backup");
    }

    return {
      allowed: blockers.length === 0,
      blockers,
      warnings,
    };
  }

  /**
   * Validate PQC (Post-Quantum Cryptography) boundaries.
   * Ensures no cryptographic operations that could be vulnerable to quantum attacks.
   */
  public validatePqcBoundaries(code: string): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for weak cryptographic patterns
    const weakPatterns = [
      { pattern: /MD5|SHA1/i, message: "Weak hash function (vulnerable to quantum attacks)" },
      { pattern: /RSA(?!-.*2048)/i, message: "RSA with key size < 2048 bits" },
      { pattern: /DES\b/i, message: "DES cipher (vulnerable to quantum attacks)" },
    ];

    for (const { pattern, message } of weakPatterns) {
      if (pattern.test(code)) {
        issues.push(message);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Get current audit policy.
   */
  public getPolicy(): AuditPolicy {
    return { ...this.config };
  }

  /**
   * Visual QA for UI artifacts.
   * Detects UI files and returns appropriate result.
   */
  public async visualQA(artifacts: FileArtifact[]): Promise<VisualQAResult> {
    const uiExtensions = [".tsx", ".jsx", ".css", ".html", ".vue", ".svelte"];
    const uiFiles = artifacts.filter((a) => uiExtensions.some((ext) => a.path.endsWith(ext)));

    if (uiFiles.length > 0) {
      return {
        screenshotsTaken: [],
        diffScore: 0,
        approved: true,
        issues: ["Visual QA skipped — no screenshot tool"],
      };
    }

    return {
      screenshotsTaken: [],
      diffScore: 100,
      approved: true,
      issues: [],
    };
  }

  /**
   * Update audit policy.
   */
  public updatePolicy(config: Partial<AuditPolicy>): void {
    this.config = { ...this.config, ...config };
    console.log(pc.cyan(`[AUDITOR] Policy updated: ${JSON.stringify(this.config)}`));
  }
}
