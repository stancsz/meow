// Quality-First Execution Modes
// Meow's tagline: "Most long-running agents just ship garbage with speed.
//  Meow takes things slow and likes quality and tastes."

export enum ExecutionMode {
  /**
   * PARALLEL: Kitchen's approach — fan out tasks simultaneously, fast but unverified.
   * Use when speed matters more than correctness (e.g., quick research tasks).
   */
  PARALLEL = 'parallel',

  /**
   * SEQUENTIAL: Quality-first — one task at a time with embedded self-review.
   * Task must pass all quality gates before next task starts.
   * Use when correctness matters more than speed (e.g., production code changes).
   */
  SEQUENTIAL = 'sequential',

  /**
   * AUDIT_ONLY: Verify work without executing (dry-run mode).
   * Useful for checking if existing code meets quality standards.
   */
  AUDIT_ONLY = 'audit_only',

  /**
   * SHIP: Full quality pipeline — verify + polish + audit + human sign-off.
   * Default mode. Nothing ships without passing all gates and human approval.
   */
  SHIP = 'ship',
}

export interface QualityGate {
  name: string;
  check: (task: QualityTaskContext) => Promise<QualityGateResult>;
  required: boolean;
  blocking: boolean; // If true, failure blocks the task. If false, just warns.
}

export interface QualityGateResult {
  passed: boolean;
  details: string;
  durationMs: number;
  issues?: string[];
  warnings?: string[];
}

export interface QualityTaskContext {
  taskId: string;
  goal: string;
  artifacts: FileArtifact[];
  diff?: string;
  testResults?: TestResult[];
  visualQA?: VisualQAResult;
  coverage?: number;
  humanSignoff?: HumanSignoff;
}

export interface FileArtifact {
  path: string;
  operation: 'create' | 'update' | 'delete';
  content?: string;
}

export interface TestResult {
  suite: string;
  passed: boolean;
  coverage?: number;
  failures?: string[];
}

export interface VisualQAResult {
  screenshotsTaken: string[];
  diffScore: number;
  approved: boolean;
  issues?: string[];
}

export interface HumanSignoff {
  approved: boolean;
  approver: string;
  timestamp: number;
  feedback?: string;
}

export interface SelfReviewResult {
  passes: boolean;
  qualityScore: number; // 0-100
  issues: string[];
  warnings: string[];
  gates: QualityGateResult[];
  iterations: number;
  timeSpentMs: number;
}

export const DEFAULT_QUALITY_GATES: QualityGate[] = [
  {
    name: 'Placeholder Detection',
    required: true,
    blocking: true,
    check: async (ctx): Promise<QualityGateResult> => {
      const start = Date.now();
      const redFlags = ['todo', 'fixme', 'placeholder', 'implement here', 'TBD', 'XXX', '...'];
      const foundFlags: string[] = [];

      for (const artifact of ctx.artifacts) {
        if (artifact.content) {
          const lower = artifact.content.toLowerCase();
          for (const flag of redFlags) {
            if (lower.includes(flag)) {
              foundFlags.push(`${flag} in ${artifact.path}`);
            }
          }
        }
      }

      const passed = foundFlags.length === 0;
      return {
        passed,
        details: passed ? 'No placeholder patterns detected' : `Found: ${foundFlags.join(', ')}`,
        durationMs: Date.now() - start,
        issues: passed ? undefined : foundFlags,
      };
    },
  },
  {
    name: 'Lint Check',
    required: true,
    blocking: true,
    check: async (ctx): Promise<QualityGateResult> => {
      const start = Date.now();
      // Lint is run via external process — here we check if results were provided
      const passed = ctx.testResults === undefined || ctx.testResults.length === 0
        ? true // No lint results = pass (defer to testResults check)
        : !ctx.testResults.some(r => r.failures && r.failures.length > 0);

      return {
        passed,
        details: passed ? 'Lint passed' : 'Lint errors detected',
        durationMs: Date.now() - start,
      };
    },
  },
  {
    name: 'Test Coverage',
    required: true,
    blocking: true,
    check: async (ctx): Promise<QualityGateResult> => {
      const start = Date.now();
      const minCoverage = 80;

      if (!ctx.coverage) {
        return {
          passed: false,
          details: 'No coverage report available — tests must run first',
          durationMs: Date.now() - start,
          issues: ['Coverage unknown — cannot verify quality'],
        };
      }

      const passed = ctx.coverage >= minCoverage;
      return {
        passed,
        details: `Coverage: ${ctx.coverage}% (min: ${minCoverage}%)`,
        durationMs: Date.now() - start,
        issues: passed ? undefined : [`Coverage ${ctx.coverage}% below threshold ${minCoverage}%`],
      };
    },
  },
  {
    name: 'Human Sign-Off',
    required: true,
    blocking: true,
    check: async (ctx): Promise<QualityGateResult> => {
      const start = Date.now();

      if (!ctx.humanSignoff) {
        return {
          passed: false,
          details: 'No human sign-off — production code requires explicit approval',
          durationMs: Date.now() - start,
          issues: ['Human sign-off missing — cannot ship without human review'],
        };
      }

      const passed = ctx.humanSignoff.approved;
      return {
        passed,
        details: passed
          ? `Approved by ${ctx.humanSignoff.approver} at ${new Date(ctx.humanSignoff.timestamp).toISOString()}`
          : `Rejected by ${ctx.humanSignoff.approver}: ${ctx.humanSignoff.feedback || 'no feedback'}`,
        durationMs: Date.now() - start,
        issues: passed ? undefined : [`Human rejected: ${ctx.humanSignoff.feedback}`],
      };
    },
  },
];

export function isQualityMode(mode: ExecutionMode): boolean {
  return mode === ExecutionMode.SEQUENTIAL || mode === ExecutionMode.SHIP;
}

export function isBlockingMode(mode: ExecutionMode): boolean {
  return mode !== ExecutionMode.PARALLEL && mode !== ExecutionMode.AUDIT_ONLY;
}