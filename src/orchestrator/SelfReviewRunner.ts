// Self-Review Runner: Sequential execution with quality gates
// "Meow takes things slow and likes quality and tastes."

import { spawn } from 'child_process';
import { Task, TaskResult, FileArtifact } from './Task';
import { ExecutionMode, QualityGate, QualityGateResult, QualityTaskContext, SelfReviewResult, DEFAULT_QUALITY_GATES, isQualityMode } from './ExecutionMode';
import pc from 'picocolors';

export interface SelfReviewConfig {
  mode: ExecutionMode;
  maxIterations: number;
  qualityGates: QualityGate[];
  minQualityScore: number;
  allowHumanOverride: boolean;
}

export const DEFAULT_SELF_REVIEW_CONFIG: SelfReviewConfig = {
  mode: ExecutionMode.SHIP,
  maxIterations: 5,
  qualityGates: DEFAULT_QUALITY_GATES,
  minQualityScore: 80,
  allowHumanOverride: true,
};

export class SelfReviewRunner {
  private config: SelfReviewConfig;

  constructor(config: Partial<SelfReviewConfig> = {}) {
    this.config = { ...DEFAULT_SELF_REVIEW_CONFIG, ...config };
  }

  /**
   * Execute a task with self-review loops.
   * In SEQUENTIAL/SHIP mode: execute, self-review, refine if needed, repeat until gates pass.
   * In PARALLEL mode: just execute (Kitchen-style).
   * In AUDIT_ONLY mode: verify without executing.
   */
  async executeWithSelfReview(
    task: Task,
    executorFn: (task: Task) => Promise<TaskResult>
  ): Promise<SelfReviewResult> {
    const startTime = Date.now();
    let iteration = 0;
    let lastResult: TaskResult | null = null;
    let artifacts: FileArtifact[] = [];

    console.log(pc.bold(pc.cyan(`\n🍽️  [SELF-REVIEW] Starting ${this.config.mode} execution for task: ${task.id}`)));

    // AUDIT_ONLY mode: verify without executing
    if (this.config.mode === ExecutionMode.AUDIT_ONLY) {
      console.log(pc.dim('[SELF-REVIEW] Audit-only mode — verifying without executing'));
      return this.runAuditOnly(task);
    }

    // PARALLEL mode: just execute (no self-review)
    if (this.config.mode === ExecutionMode.PARALLEL) {
      console.log(pc.dim('[SELF-REVIEW] Parallel mode — executing without self-review'));
      const result = await executorFn(task);
      return {
        passes: result.success,
        qualityScore: result.success ? 100 : 0,
        issues: result.error ? [result.error] : [],
        warnings: [],
        gates: [],
        iterations: 1,
        timeSpentMs: Date.now() - startTime,
      };
    }

    // SEQUENTIAL / SHIP mode: execute with self-review loops
    while (iteration < this.config.maxIterations) {
      iteration++;
      console.log(pc.cyan(`\n📦 [ITERATION ${iteration}/${this.config.maxIterations}] Executing task...`));

      // Execute the task
      lastResult = await executorFn(task);

      if (!lastResult.success) {
        console.log(pc.red(`❌ [ITERATION ${iteration}] Execution failed: ${lastResult.error}`));
        break;
      }

      // Collect artifacts from result
      artifacts = lastResult.artifacts || [];

      // Run self-review
      console.log(pc.cyan(`\n🔍 [ITERATION ${iteration}] Running self-review...`));
      const reviewContext: QualityTaskContext = {
        taskId: task.id,
        goal: task.description,
        artifacts,
        diff: lastResult.output || undefined,
      };

      const gateResults = await this.runQualityGates(reviewContext);
      const qualityScore = this.computeQualityScore(gateResults);
      const issues = gateResults.flatMap(g => g.issues || []);
      const warnings = gateResults.flatMap(g => g.warnings || []);

      console.log(pc.cyan(`\n📊 [ITERATION ${iteration}] Quality Score: ${qualityScore}% | Gates: ${gateResults.filter(g => g.passed).length}/${gateResults.length}`));

      // Check if all required gates passed
      const allRequiredPassed = gateResults
        .filter(g => g.passed || !this.config.qualityGates.find(qg => qg.name === g.details.split(':')[0])?.required)
        .length === gateResults.length;

      const blockingFailed = gateResults.some(g => {
        const gate = this.config.qualityGates.find(qg => qg.name === g.details.split(':')[0]);
        return gate?.blocking && !g.passed;
      });

      if (!blockingFailed && qualityScore >= this.config.minQualityScore) {
        console.log(pc.green(`\n✅ [ITERATION ${iteration}] Quality gates PASSED — ready to ship`));
        return {
          passes: true,
          qualityScore,
          issues,
          warnings,
          gates: gateResults,
          iterations: iteration,
          timeSpentMs: Date.now() - startTime,
        };
      }

      // Quality gates failed — check if we should refine or abort
      if (iteration >= this.config.maxIterations) {
        console.log(pc.red(`\n🚫 [ITERATION ${iteration}] Max iterations reached. Quality gates FAILED.`));
        console.log(pc.red(`   Issues: ${issues.join(', ') || 'none'}`));
        console.log(pc.red(`   Score: ${qualityScore}% (min: ${this.config.minQualityScore}%)`));

        if (this.config.allowHumanOverride) {
          console.log(pc.yellow(`\n⚠️  [SELF-REVIEW] Prompting for human override...`));
          // In SHIP mode, this would trigger human sign-off request
          // For now, we block on max iterations
        }

        return {
          passes: false,
          qualityScore,
          issues,
          warnings,
          gates: gateResults,
          iterations: iteration,
          timeSpentMs: Date.now() - startTime,
        };
      }

      // Refine and retry
      console.log(pc.yellow(`\n🔧 [ITERATION ${iteration}] Quality gates FAILED — refining and retrying...`));
      if (issues.length > 0) {
        console.log(pc.dim(`   Issues to fix: ${issues.join('; ')}`));
      }

      // Sleep before retry to avoid tight loops
      await this.sleep(1000);
    }

    // Should not reach here, but defensive
    return {
      passes: false,
      qualityScore: 0,
      issues: ['Max iterations exceeded'],
      warnings: [],
      gates: [],
      iterations: iteration,
      timeSpentMs: Date.now() - startTime,
    };
  }

  /**
   * Run all quality gates against a task context.
   */
  private async runQualityGates(ctx: QualityTaskContext): Promise<QualityGateResult[]> {
    const results: QualityGateResult[] = [];

    for (const gate of this.config.qualityGates) {
      try {
        console.log(pc.dim(`   Checking gate: ${gate.name}...`));
        const result = await gate.check(ctx);
        results.push(result);

        if (result.passed) {
          console.log(pc.green(`   ✅ ${gate.name}: ${result.details}`));
        } else {
          console.log(pc.red(`   ❌ ${gate.name}: ${result.details}`));
          if (result.issues) {
            result.issues.forEach(issue => console.log(pc.red(`      - ${issue}`)));
          }
        }
      } catch (error: any) {
        console.log(pc.red(`   ❌ ${gate.name}: Error — ${error.message}`));
        results.push({
          passed: false,
          details: `Gate error: ${error.message}`,
          durationMs: 0,
          issues: [error.message],
        });
      }
    }

    return results;
  }

  /**
   * Compute overall quality score from gate results (0-100).
   */
  private computeQualityScore(gates: QualityGateResult[]): number {
    if (gates.length === 0) return 0;

    const weights: Record<string, number> = {
      'Placeholder Detection': 15,
      'Lint Check': 20,
      'Test Coverage': 25,
      'Human Sign-Off': 25,
      'Coherence Check': 15,
    };

    let totalWeight = 0;
    let weightedScore = 0;

    for (const gate of gates) {
      const gateName = gate.details.split(':')[0].trim();
      const weight = weights[gateName] || 10;
      totalWeight += weight;
      weightedScore += gate.passed ? weight : 0;
    }

    return totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 100) : 0;
  }

  /**
   * Audit-only mode: verify existing work without executing.
   */
  private async runAuditOnly(task: Task): Promise<SelfReviewResult> {
    const startTime = Date.now();

    // For audit mode, we need artifacts from a previous run
    // This would be passed in via task.producedFiles or similar
    const artifacts = task.producedFiles || [];

    const ctx: QualityTaskContext = {
      taskId: task.id,
      goal: task.description,
      artifacts,
    };

    const gateResults = await this.runQualityGates(ctx);
    const qualityScore = this.computeQualityScore(gateResults);

    return {
      passes: qualityScore >= this.config.minQualityScore,
      qualityScore,
      issues: gateResults.flatMap(g => g.issues || []),
      warnings: gateResults.flatMap(g => g.warnings || []),
      gates: gateResults,
      iterations: 0,
      timeSpentMs: Date.now() - startTime,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getConfig(): SelfReviewConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<SelfReviewConfig>): void {
    this.config = { ...this.config, ...config };
  }
}