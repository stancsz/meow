// Quality-First Execution Modes
//
// MEOW's SEQUENTIAL/SHIP modes implement the "Kitchen Pattern" from Factory.ai:
//   - One task at a time with embedded self-review
//   - Quality gates must pass before next task starts
//   - Inspired by Anthropic's "Effective Harnesses for Long-Running Agents" (2024)
//     which uses a 2-agent architecture (Initializer + Coding) with JSON feature lists
//     and structured handoffs — if a task's "passes" list is incomplete, it cannot
//     proceed to the next stage.
//
// The AUDIT_ONLY mode corresponds to Anthropic's "passes array" check: a structured
// manifest of which quality gates the task passed. If the passes list is incomplete,
// the task is blocked from proceeding.

export enum ExecutionMode {
  PARALLEL = 'parallel',
  SEQUENTIAL = 'sequential',
  AUDIT_ONLY = 'audit_only',
  SHIP = 'ship',
  AUTOPILOT = 'autopilot',
  RALPH = 'ralph',
  ECOMODE = 'ecomode',
  PIPELINE = 'pipeline',
  SWARM = 'swarm',
  ULTRAWORK = 'ultrawork',
  ULTRAPILOT = 'ultrapilot',
  SWARM_TEAM = 'swarm_team',
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
  runtimeEvidence?: RuntimeEvidence[];
}

export interface FileArtifact {
  path: string;
  operation: 'create' | 'update' | 'delete';
  content?: string;
}

export interface RuntimeEvidence {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timestamp: number;
  artifactType: 'test' | 'build' | 'cli' | 'unknown';
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
  /** Names of gates that passed this run */
  gatesPassed: string[];
  /** Names of gates that failed this run */
  gatesFailed: string[];
  /** Artifacts produced - returned even on stagnation so best effort can be committed */
  artifacts?: FileArtifact[];
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
      // No testResults means no lint data was captured — warn instead of trivially passing
      if (!ctx.testResults || ctx.testResults.length === 0) {
        return {
          passed: false,
          details: 'No lint/test results captured — cannot verify code quality',
          durationMs: Date.now() - start,
          warnings: ['Run tests to populate lint results before quality gates'],
          issues: ['Missing testResults — lint gate has no data to verify'],
        };
      }
      const hasFailures = ctx.testResults.some(r => r.failures && r.failures.length > 0);
      const passed = !hasFailures;
      return {
        passed,
        details: passed ? 'Lint and tests passed' : `Lint errors in ${ctx.testResults.filter(r => r.failures?.length).length} suite(s)`,
        durationMs: Date.now() - start,
        issues: passed ? undefined : ctx.testResults.flatMap(r => r.failures || []),
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

      // No coverage data captured — warn but do not hard-block if tests passed
      // This avoids blocking on projects without coverage instrumentation
      if (!ctx.coverage) {
        if (!ctx.testResults || ctx.testResults.length === 0) {
          return {
            passed: false,
            details: 'No coverage report and no test results — cannot verify quality',
            durationMs: Date.now() - start,
            issues: ['Coverage unknown and no test results — run tests with coverage'],
          };
        }
        // Tests ran but no coverage instrument — warn and pass with caveat
        const allPassed = ctx.testResults.every(r => r.passed);
        return {
          passed: allPassed,
          details: allPassed
            ? 'Tests passed but no coverage data — coverage instrumentation recommended'
            : 'Tests failed (no coverage data)',
          durationMs: Date.now() - start,
          warnings: ['No coverage data — add coverage instrumentation (e.g. --coverage)'],
          issues: allPassed ? undefined : ctx.testResults.flatMap(r => r.failures || []),
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

      // CI/automated mode: auto-approve human sign-off gate
      // Production code requiring human approval would set CI=false
      if (process.env.CI === 'true') {
        return {
          passed: true,
          details: 'CI mode — human sign-off waived for automated workflows',
          durationMs: Date.now() - start,
          warnings: undefined,
          issues: undefined,
        };
      }

      if (!ctx.humanSignoff) {
        return {
          passed: false,
          details: 'No human sign-off — production code requires explicit approval',
          durationMs: Date.now() - start,
          issues: ['Human sign-off missing — cannot ship without human review'],
        };
      }

      // Human sign-off AND visual QA must both be approved when visualQA is present
      const visualApproved = !ctx.visualQA || ctx.visualQA.approved;
      const passed = ctx.humanSignoff.approved && visualApproved;
      const visualDetails = ctx.visualQA
        ? ctx.visualQA.approved
          ? ', visual QA passed'
          : ', visual QA FAILED'
        : '';

      return {
        passed,
        details: passed
          ? `Approved by ${ctx.humanSignoff.approver}${visualDetails} at ${new Date(ctx.humanSignoff.timestamp).toISOString()}`
          : `Rejected by ${ctx.humanSignoff.approver}: ${ctx.humanSignoff.feedback || 'no feedback'}${visualDetails}`,
        durationMs: Date.now() - start,
        issues: passed ? undefined : [`Human rejected: ${ctx.humanSignoff.feedback}`],
      };
    },
  },
  {
    name: 'Visual Verification',
    required: false, // opt-in per task via visualQA context
    blocking: false,
    check: async (ctx): Promise<QualityGateResult> => {
      const start = Date.now();
      // If no visual QA was requested, this gate passes trivially
      if (!ctx.visualQA) {
        return {
          passed: true,
          details: 'No visual QA requested — skipping',
          durationMs: Date.now() - start,
        };
      }
      const passed = ctx.visualQA.approved;
      return {
        passed,
        details: passed
          ? `Visual QA passed (${ctx.visualQA.screenshotsTaken.length} screenshots, diff score: ${ctx.visualQA.diffScore})`
          : `Visual QA failed: ${ctx.visualQA.issues?.join(', ') ?? 'approval=false'}`,
        durationMs: Date.now() - start,
        issues: passed ? undefined : ctx.visualQA.issues,
      };
    },
  },
];

export function isQualityMode(mode: ExecutionMode): boolean {
  return (
    mode === ExecutionMode.SEQUENTIAL ||
    mode === ExecutionMode.SHIP ||
    mode === ExecutionMode.RALPH ||
    mode === ExecutionMode.AUTOPILOT ||
    mode === ExecutionMode.PIPELINE ||
    mode === ExecutionMode.ULTRAWORK ||
    mode === ExecutionMode.ULTRAPILOT
  );
}

export function isBlockingMode(mode: ExecutionMode): boolean {
  return (
    mode !== ExecutionMode.PARALLEL &&
    mode !== ExecutionMode.AUDIT_ONLY &&
    mode !== ExecutionMode.SWARM &&
    mode !== ExecutionMode.SWARM_TEAM &&
    mode !== ExecutionMode.ECOMODE
  );
}