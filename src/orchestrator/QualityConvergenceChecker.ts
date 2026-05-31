// Quality convergence detector — stops grinding when ROI drops
// "Meow keeps investing tokens where they make sense, and stops when they don't."

import pc from 'picocolors';

export interface ConvergenceConfig {
  /** Minimum score delta to count as genuine improvement (default: 3) */
  minQualityDelta: number;
  /** Consecutive iterations below minQualityDelta before early exit (default: 2) */
  stagnationWindow: number;
  /** Hard token cap per task (default: 50000) */
  tokenBudgetPerTask: number;
  /** Min quality delta per 1000 tokens to continue investing (default: 0.5) */
  minQualityPerToken: number;
  /** Enable early exit on diminishing returns (default: true) */
  enableDiminishingReturnsExit: boolean;
}

export const DEFAULT_CONVERGENCE_CONFIG: ConvergenceConfig = {
  minQualityDelta: 3,
  stagnationWindow: 2,
  tokenBudgetPerTask: 50000,
  minQualityPerToken: 0.5,
  enableDiminishingReturnsExit: true,
};

export interface QualitySnapshot {
  iteration: number;
  qualityScore: number;
  tokensUsed: number;
  gatesPassed: number;
  gatesTotal: number;
}

export type ConvergenceReason =
  | 'improving'
  | 'stagnating'
  | 'diminishing_returns'
  | 'token_budget_exceeded'
  | 'gates_passed'
  | 'max_iterations';

export interface ConvergenceDecision {
  shouldContinue: boolean;
  reason: ConvergenceReason;
  qualityDelta: number;
  cumulativeQualityDelta: number;
  tokensInvested: number;
  tokenEfficiency: number; // quality_delta per 1000 tokens
  stagnationCount: number;
  iteration: number;
  message: string;
}

/**
 * QualityConvergenceChecker
 *
 * Tracks quality progress across self-review iterations and decides when
 * continued investment is no longer worth it. Implements the "invest where
 * it makes sense" philosophy — keeps grinding when ROI is good, stops
 * immediately when it drops.
 *
 * Exits early on:
 * - All gates passed (done)
 * - Token budget exhausted
 * - Quality stagnating for N consecutive iterations
 * - Diminishing returns (quality improving but too expensive)
 */
export class QualityConvergenceChecker {
  private config: ConvergenceConfig;
  private history: QualitySnapshot[] = [];
  private stagnationCount: number = 0;

  constructor(config: Partial<ConvergenceConfig> = {}) {
    this.config = { ...DEFAULT_CONVERGENCE_CONFIG, ...config };
  }

  /**
   * Called after each iteration to decide if we should keep investing.
   */
  check(
    currentScore: number,
    tokensThisIteration: number,
    gatesPassed: number,
    gatesTotal: number
  ): ConvergenceDecision {
    const iteration = this.history.length + 1;
    const prevScore = this.history.length > 0 ? this.history[this.history.length - 1].qualityScore : 0;
    const qualityDelta = currentScore - prevScore;

    const snapshot: QualitySnapshot = {
      iteration,
      qualityScore: currentScore,
      tokensUsed: tokensThisIteration,
      gatesPassed,
      gatesTotal,
    };
    this.history.push(snapshot);

    const totalTokens = this.history.reduce((sum, s) => sum + s.tokensUsed, 0);
    const cumulativeQualityDelta = currentScore - (this.history[0]?.qualityScore ?? 0);
    const tokenEfficiency = tokensThisIteration > 0 ? (qualityDelta / tokensThisIteration) * 1000 : 0;

    // Case 1: All gates passed — done
    if (gatesPassed === gatesTotal && gatesTotal > 0) {
      return {
        shouldContinue: false,
        reason: 'gates_passed',
        qualityDelta,
        cumulativeQualityDelta,
        tokensInvested: totalTokens,
        tokenEfficiency,
        stagnationCount: this.stagnationCount,
        iteration,
        message: pc.green(`All ${gatesTotal} quality gates passed — ready to ship`),
      };
    }

    // Case 2: Token budget exceeded
    if (totalTokens > this.config.tokenBudgetPerTask) {
      return {
        shouldContinue: false,
        reason: 'token_budget_exceeded',
        qualityDelta,
        cumulativeQualityDelta,
        tokensInvested: totalTokens,
        tokenEfficiency,
        stagnationCount: this.stagnationCount,
        iteration,
        message: pc.red(`Token budget exceeded: ${totalTokens} > ${this.config.tokenBudgetPerTask} — stopping`),
      };
    }

    // Case 3: Quality is stagnant (no meaningful improvement)
    if (qualityDelta < this.config.minQualityDelta) {
      this.stagnationCount++;
      if (this.stagnationCount >= this.config.stagnationWindow) {
        return {
          shouldContinue: false,
          reason: 'stagnating',
          qualityDelta,
          cumulativeQualityDelta,
          tokensInvested: totalTokens,
          tokenEfficiency,
          stagnationCount: this.stagnationCount,
          iteration,
          message: pc.yellow(
            `Quality stagnating: +${qualityDelta} pts for ${this.stagnationCount} consecutive iterations — stopping to preserve tokens`
          ),
        };
      }
    } else {
      this.stagnationCount = 0; // reset on meaningful improvement
    }

    // Case 4: Diminishing returns — improving but inefficient
    if (
      this.config.enableDiminishingReturnsExit &&
      qualityDelta > 0 &&
      tokenEfficiency < this.config.minQualityPerToken
    ) {
      return {
        shouldContinue: false,
        reason: 'diminishing_returns',
        qualityDelta,
        cumulativeQualityDelta,
        tokensInvested: totalTokens,
        tokenEfficiency,
        stagnationCount: this.stagnationCount,
        iteration,
        message: pc.yellow(
          `Diminishing returns: +${qualityDelta} pts but token efficiency ${tokenEfficiency.toFixed(3)} < ${this.config.minQualityPerToken} pts/1k tokens — stopping`
        ),
      };
    }

    // Case 5: Still improving — worth investing more
    return {
      shouldContinue: true,
      reason: 'improving',
      qualityDelta,
      cumulativeQualityDelta,
      tokensInvested: totalTokens,
      tokenEfficiency,
      stagnationCount: this.stagnationCount,
      iteration,
      message: pc.cyan(
        `Quality improving: +${qualityDelta} pts (${tokenEfficiency.toFixed(3)} pts/1k tokens), stagnation=${this.stagnationCount} — continuing`
      ),
    };
  }

  /** Human-readable convergence report for audit logs */
  getReport(): string {
    if (this.history.length === 0) return 'No quality history recorded.';

    const lines = ['\n📈 Quality Convergence Report', '─'.repeat(44)];
    for (const snap of this.history) {
      const delta =
        snap.iteration > 1
          ? snap.qualityScore - this.history[snap.iteration - 2].qualityScore
          : 0;
      lines.push(
        `  Iter ${snap.iteration}: score=${snap.qualityScore}% ` +
          `gates=${snap.gatesPassed}/${snap.gatesTotal} ` +
          `tokens=${snap.tokensUsed} ` +
          `delta=${delta >= 0 ? '+' : ''}${delta}`
      );
    }
    const totalTokens = this.history.reduce((s, h) => s + h.tokensUsed, 0);
    lines.push('─'.repeat(44));
    lines.push(
      `  Total: ${this.history.length} iterations, ${totalTokens.toLocaleString()} tokens invested`
    );
    lines.push(
      `  Final score: ${this.history[this.history.length - 1].qualityScore}%`
    );
    return lines.join('\n');
  }

  getHistory(): ReadonlyArray<QualitySnapshot> {
    return [...this.history];
  }

  reset(): void {
    this.history = [];
    this.stagnationCount = 0;
  }
}