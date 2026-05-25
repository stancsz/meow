// Self-Review Runner: Sequential execution with quality gates
// "Meow takes things slow and likes quality and tastes."

import { spawn } from 'child_process';
import { Task, TaskResult, FileArtifact, RuntimeEvidence } from './Task';
import { ExecutionMode, QualityGate, QualityGateResult, QualityTaskContext, SelfReviewResult, DEFAULT_QUALITY_GATES, isQualityMode, TestResult } from './ExecutionMode';
import { QualityConvergenceChecker } from './QualityConvergenceChecker';
import { JudgeAgent, JudgeContext } from '../agent/judge';
import pc from 'picocolors';

export interface SelfReviewConfig {
  mode: ExecutionMode;
  maxIterations: number;
  qualityGates: QualityGate[];
  minQualityScore: number;
  allowHumanOverride: boolean;
  tokenBudgetPerTask?: number;
  enableConvergenceCheck?: boolean;
  enableJudge?: boolean;
  enableTestExecution?: boolean;
}

export const DEFAULT_SELF_REVIEW_CONFIG: SelfReviewConfig = {
  mode: ExecutionMode.SHIP,
  maxIterations: 5,
  qualityGates: DEFAULT_QUALITY_GATES,
  minQualityScore: 80,
  allowHumanOverride: true,
  tokenBudgetPerTask: 50000,
  enableConvergenceCheck: true,
  enableJudge: true,
  enableTestExecution: true,
};

export class SelfReviewRunner {
  private config: SelfReviewConfig;
  private convergenceChecker: QualityConvergenceChecker;
  private judgeAgent: JudgeAgent;

  constructor(config: Partial<SelfReviewConfig> = {}) {
    this.config = { ...DEFAULT_SELF_REVIEW_CONFIG, ...config };
    this.convergenceChecker = new QualityConvergenceChecker({
      tokenBudgetPerTask: this.config.tokenBudgetPerTask ?? 50000,
    });
    this.judgeAgent = new JudgeAgent();
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
        gatesPassed: [],
        gatesFailed: [],
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

      // Capture test results and coverage before running gates
      const { testResults, coverage } = await this.runTestsAndGetCoverage();

      // Capture runtime evidence from the changed artifacts
      const runtimeEvidence = await this.captureRuntimeEvidence(artifacts);

      // Attach evidence to the task result for surfacing in output
      lastResult.runtimeEvidence = runtimeEvidence;

      const reviewContext: QualityTaskContext = {
        taskId: task.id,
        goal: task.description,
        artifacts,
        diff: lastResult.output || undefined,
        testResults,
        coverage,
        runtimeEvidence,
      };

      const gateResults = await this.runQualityGates(reviewContext);
      const qualityScore = this.computeQualityScore(gateResults);
      const issues = gateResults.flatMap(g => g.issues || []);
      const warnings = gateResults.flatMap(g => g.warnings || []);

      console.log(pc.cyan(`\n📊 [ITERATION ${iteration}] Quality Score: ${qualityScore}% | Gates: ${gateResults.filter(g => g.passed).length}/${gateResults.length}`));

      if (this.config.enableConvergenceCheck) {
        const tokensThisIteration = this.estimateTokens(lastResult);
        const gatesPassedCount = gateResults.filter(g => g.passed).length;
        const decision = this.convergenceChecker.check(qualityScore, tokensThisIteration, gatesPassedCount, gateResults.length);
        console.log(pc.dim('   ' + decision.message));
        if (!decision.shouldContinue) {
          console.log(pc.yellow('\n⚠️  [ITERATION ' + iteration + '] ' + decision.reason.toUpperCase() + ' — stopping quality loop'));
          return {
            passes: false,
            qualityScore,
            issues: [...issues, 'Convergence exit: ' + decision.reason],
            warnings,
            gates: gateResults,
            iterations: iteration,
            timeSpentMs: Date.now() - startTime,
            gatesPassed: gateResults.filter(g => g.passed).map(g => g.details.split(':')[0].trim()),
            gatesFailed: gateResults.filter(g => !g.passed).map(g => g.details.split(':')[0].trim()),
          };
        }
      }

      // Check if all required gates passed
      const allRequiredPassed = gateResults
        .filter(g => g.passed || !this.config.qualityGates.find(qg => qg.name === g.details.split(':')[0])?.required)
        .length === gateResults.length;

      const blockingFailed = gateResults.some(g => {
        const gate = this.config.qualityGates.find(qg => qg.name === g.details.split(':')[0]);
        return gate?.blocking && !g.passed;
      });

if (!blockingFailed && qualityScore >= this.config.minQualityScore) {
        // Final quality gate: LLM-as-judge evaluation (skipped if enableJudge is false)
        if (this.config.enableJudge !== false) {
          console.log(pc.magenta(`\n⚖️  [ITERATION ${iteration}] Running LLM-as-judge final evaluation...`));
          const judgeCtx: JudgeContext = {
            taskId: task.id,
            goal: task.description,
            diff: lastResult.output ?? "",
            artifacts: artifacts,
            testResults: testResults,
            coverage: coverage,
            runtimeEvidence: runtimeEvidence,
          };
          const verdict = await this.judgeAgent.judge(judgeCtx);

          if (verdict.blocked) {
            // Judge blocked — do not ship, feed critique back
            console.log(pc.red(`\n🚫 [JUDGE] Output BLOCKED — score ${verdict.score}/100 below threshold ${this.judgeAgent.getThreshold()}`));
            console.log(pc.red(`   Critique: ${verdict.critique.substring(0, 200)}`));
            return {
              passes: false,
              qualityScore: verdict.score,
              issues: [...issues, `JUDGE BLOCKED: ${verdict.critique}`],
              warnings,
              gates: gateResults,
              gatesPassed: gateResults.filter(g => g.passed).map(g => g.details.split(':')[0].trim()),
              gatesFailed: [...gateResults.filter(g => !g.passed).map(g => g.details.split(':')[0].trim()), 'LLM-as-judge'],
              iterations: iteration,
              timeSpentMs: Date.now() - startTime,
            };
          }
        } else {
          console.log(pc.dim('\n⚖️  [ITERATION ${iteration}] Judge skipped (enableJudge: false)'));
        }

        console.log(pc.green(`\n✅ [ITERATION ${iteration}] Quality gates PASSED — ready to ship`));
        return {
          passes: true,
          qualityScore,
          issues,
          warnings,
          gates: gateResults,
          gatesPassed: gateResults.filter(g => g.passed).map(g => g.details.split(':')[0].trim()),
          gatesFailed: gateResults.filter(g => !g.passed).map(g => g.details.split(':')[0].trim()),
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
          gatesPassed: gateResults.filter(g => g.passed).map(g => g.details.split(':')[0].trim()),
          gatesFailed: gateResults.filter(g => !g.passed).map(g => g.details.split(':')[0].trim()),
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
      gatesPassed: [],
      gatesFailed: [],
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
      gatesPassed: gateResults.filter(g => g.passed).map(g => g.details.split(':')[0].trim()),
      gatesFailed: gateResults.filter(g => !g.passed).map(g => g.details.split(':')[0].trim()),
      iterations: 0,
      timeSpentMs: Date.now() - startTime,
    };
  }

  /**
   * Run vitest and capture results + coverage, parsing into TestResult[].
   * Returns { testResults, coverage } — coverage is the overall percentage or undefined.
*/
  private async runTestsAndGetCoverage(): Promise<{
    testResults: TestResult[];
    coverage: number | undefined;
  }> {
    if (this.config.enableTestExecution === false) {
      return { testResults: [], coverage: undefined };
    }

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const testResults: TestResult[] = [];

    // Run with JSON reporter first to capture structured test results
    let jsonOutput = '';
    let coverageOutput: number | undefined;

    try {
      const { stdout } = await execAsync('npx vitest run --reporter=json 2>&1', { cwd: process.cwd() });
      jsonOutput = stdout;
    } catch (error: any) {
      // Vitest exits non-zero if tests fail — still parse what we can
      jsonOutput = error.stdout || error.stderr || '';
    }

    // Try to parse JSON reporter output
    try {
      // Find JSON block in output (vitest JSON reporter outputs to stdout)
      const jsonMatch = jsonOutput.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
      if (jsonMatch) {
        const report = JSON.parse(jsonMatch[0]);
        if (report.testResults) {
          for (const suite of report.testResults) {
            const suiteResult: TestResult = {
              suite: suite.name || suite.fullName || 'unknown',
              passed: suite.status === 'passed',
              failures: [],
            };
            if (suite.assertionResults) {
              for (const assertion of suite.assertionResults) {
                if (assertion.status === 'failed') {
                  suiteResult.failures = suiteResult.failures || [];
                  suiteResult.failures.push(
                    `${assertion.fullName}: ${assertion.failureMessages?.join('; ') || 'assertion failed'}`
                  );
                }
              }
            }
            testResults.push(suiteResult);
          }
        }
      }
    } catch {
      // JSON parse failed — fall through to line-by-line parsing
    }

    // Try to extract coverage from output (common formats)
    // Vitest coverage output typically has "Coverage: X%" or similar
    const coverageMatch = jsonOutput.match(/coverage:\s*(\d+(?:\.\d+)?)\s*%/i) ||
      jsonOutput.match(/(\d+(?:\.\d+)?)\s*%\s*coverage/i);
    if (coverageMatch) {
      coverageOutput = parseFloat(coverageMatch[1]) as any;
    }

    // If no structured results, do a simple parse of the text output
    if (testResults.length === 0) {
      const passed = jsonOutput.includes('✓') || jsonOutput.includes('PASS');
      const failed = jsonOutput.includes('✗') || jsonOutput.includes('FAIL') || jsonOutput.includes('failed');
      testResults.push({
        suite: 'vitest',
        passed: passed && !failed,
        failures: failed ? ['Test suite had failures — check output'] : undefined,
        coverage: coverageOutput,
      });
    }

    return { testResults, coverage: coverageOutput };
  }

  /**
   * Capture runtime evidence by running minimal commands against changed artifacts.
   * Detects artifact types and runs the appropriate command:
   *   - 'test' or test-related files  → npm test / npx vitest
   *   - build config / dist files     → npm run build
   *   - CLI tools (bin in package.json) → run the binary with --help
   * Returns an array of RuntimeEvidence (one per command run).
   */
  private async captureRuntimeEvidence(artifacts: FileArtifact[]): Promise<RuntimeEvidence[]> {
    if (!artifacts || artifacts.length === 0) return [];

    const evidence: RuntimeEvidence[] = [];
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Determine which commands to run based on artifact paths
    const artifactTypes = this.inferArtifactTypes(artifacts);
    const commands = this.determineRuntimeCommands(artifactTypes);

    for (const cmd of commands) {
      try {
        console.log(pc.dim(`   [Runtime] Running: ${cmd.command}`));
        const start = Date.now();
        const result = await execAsync(cmd.command, { cwd: process.cwd(), timeout: 60000 });
        evidence.push({
          command: cmd.command,
          exitCode: 0,
          stdout: result.stdout || '',
          stderr: result.stderr || '',
          durationMs: Date.now() - start,
          timestamp: Date.now(),
          artifactType: cmd.type,
        });
      } catch (error: any) {
        // Non-zero exit is not an error — the command ran, we just capture the exit code
        evidence.push({
          command: error.cmd || cmd.command,
          exitCode: error.code ?? -1,
          stdout: error.stdout || '',
          stderr: error.stderr || '',
          durationMs: 0,
          timestamp: Date.now(),
          artifactType: cmd.type,
        });
      }
    }

    return evidence;
  }

  /**
   * Infer artifact types from file paths (test, build, cli).
   */
  private inferArtifactTypes(artifacts: FileArtifact[]): Set<string> {
    const types = new Set<string>();
    for (const artifact of artifacts) {
      const p = artifact.path.toLowerCase();
      if (/\btest\b|\bspec\b|\b__tests__\b/.test(p)) types.add('test');
      else if (/\bbuild\b|\bdist\b|\bout\b|\.config\.(ts|js)$/.test(p)) types.add('build');
      else if (/bin|cli|cmd/.test(p)) types.add('cli');
    }
    return types;
  }

  /**
   * Determine which runtime commands to run based on detected artifact types.
   */
  private determineRuntimeCommands(types: Set<string>): Array<{ command: string; type: 'test' | 'build' | 'cli' | 'unknown' }> {
    const commands: Array<{ command: string; type: 'test' | 'build' | 'cli' | 'unknown' }> = [];
    if (types.has('test')) {
      commands.push({ command: 'npx vitest run --reporter=json 2>&1', type: 'test' });
    }
    if (types.has('build')) {
      commands.push({ command: 'npm run build 2>&1', type: 'build' });
    }
    if (types.has('cli')) {
      commands.push({ command: 'npm run --help 2>&1 || node --help 2>&1', type: 'cli' });
    }
    // Default: if no specific type detected, try vitest (common for most projects)
    if (commands.length === 0) {
      commands.push({ command: 'npx vitest run --reporter=json 2>&1', type: 'test' });
    }
    return commands;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private estimateTokens(result: TaskResult): number {
    const outputLen = result.output?.length ?? 0;
    const artifactsLen = (result.artifacts ?? []).reduce((sum, a) => sum + (a.content?.length ?? 0), 0);
    return Math.round((outputLen + artifactsLen) / 4);
  }

  getConfig(): SelfReviewConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<SelfReviewConfig>): void {
    this.config = { ...this.config, ...config };
  }
}