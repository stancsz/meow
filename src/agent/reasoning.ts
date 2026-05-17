import pc from "picocolors";

export interface ReasoningConstraint {
  id: string;
  weight: number;
  evaluate: (state: any) => boolean;
}

/**
 * ConstraintSolver — solves combinatorial optimization using a weighted constraint solver.
 * Maps a decision space to candidates and finds the best fit using constraint scoring.
 */
export class ReasoningEngine {
  /**
   * Solves a combinatorial optimization problem using weighted constraint scoring.
   * Evaluates all candidates against constraints and returns the highest-scoring one.
   */
  public async solve<T>(
    space: T[],
    constraints: ReasoningConstraint[],
    onPulse?: (msg: string) => void
  ): Promise<T | null> {
    if (space.length === 0) return null;
    if (space.length === 1) return space[0];

    let best: T | null = null;
    let bestScore = -1;

    for (const candidate of space) {
      const totalScore = constraints.reduce((acc, c) => {
        try {
          return acc + (c.evaluate(candidate) ? c.weight : 0);
        } catch {
          return acc;
        }
      }, 0);

      if (totalScore > bestScore) {
        bestScore = totalScore;
        best = candidate;
      }
    }

    if (onPulse) {
      onPulse(pc.green(`✓ ConstraintSolver: Best score ${bestScore}, ${space.length} candidates evaluated`));
    }

    return best;
  }

  /**
   * Fast search using keyword-overlap scoring.
   * Returns the best candidate from a list given a query string.
   */
  public async findBest<T>(candidates: T[], query: string, onPulse?: (msg: string) => void): Promise<T | null> {
    if (candidates.length === 0) return null;

    const queryTerms = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);
    if (queryTerms.length === 0) return candidates[0];

    let best: T | null = null;
    let bestScore = -1;

    for (const c of candidates) {
      const content = JSON.stringify(c).toLowerCase();
      const score = queryTerms.filter(q => content.includes(q)).length / queryTerms.length;

      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }

    if (onPulse) {
      onPulse(pc.magenta(`✓ FastSearch: Best match score ${(bestScore * 100).toFixed(1)}%`));
    }

    return best;
  }
}
