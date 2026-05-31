// Task definition and state machine for parallel orchestrator

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'high' | 'medium' | 'low';

export interface TaskDependency {
  taskId: string;
  required: boolean;  // hard vs soft dependency
}

export interface FileArtifact {
  path: string;
  operation: 'create' | 'update' | 'delete';
  content?: string;
  originalHash?: string;
}

export interface ValidationContract {
  testSuite?: string;      // vitest/jest test suite name or filter
  validationScript?: string; // custom script to run
  expectedOutputs?: string[]; // expected string matches in file or output
  mustFail?: boolean;      // if true, validation script must exit non-zero (used when no test file exists)
}

export interface TaskResult {
  taskId: string;
  taskLabel?: string; // human-readable label for TUI display
  success: boolean;
  passes?: boolean; // quality gate passed status
  output?: string;
  error?: string;
  artifacts?: FileArtifact[];
  runtimeEvidence?: RuntimeEvidence[];  // Evidence from post-edit runtime execution
  metadata?: Record<string, unknown>;
}

export interface Task {
  id: string;
  description: string;
  priority: TaskPriority;
  dependencies: TaskDependency[];
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  maxRetries: number;
  timeoutMs: number;
  status: TaskStatus;
  assignedWorker?: string;
  requiredFiles?: string[];
  producedFiles?: FileArtifact[];
  toolName?: string;
  toolArgs?: string;
  validationContract?: ValidationContract;
  passes?: boolean; // TDD quality gate assertion
  agentConfig?: {
    model: string;
    baseUrl: string;
    apiKey?: string;
  };
  result?: TaskResult;
  /** Explicit acceptance criteria for task completion (Definition of Done) */
  definitionOfDone?: string[];
  feedbackHistory?: FeedbackReport[];
}

export interface FeedbackReport {
  iteration: number;
  qualityScore: number;
  failedGates: string[];
  issues: string[];
  judgeCritique?: string;
  testFailures?: string[];
}


export interface TaskEvents {
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onProgress?: (taskId: string, message: string) => void;
  onResult?: (taskId: string, result: TaskResult) => void;
  onFileConflict?: (taskId: string, conflicts: string[]) => void;
}

export interface HumanSignoff {
  approved: boolean;
  approver: string;
  timestamp: number;
  feedback?: string;
}

export interface TestResult {
  suite: string;
  passed: boolean;
  coverage?: number;
  failures?: string[];
}

/** Runtime evidence from executing a task's artifacts after edits */
export interface RuntimeEvidence {
  command: string;           // The command that was run (e.g. "npm test", "npm run build")
  exitCode: number;          // 0 = success, non-zero = failure
  stdout: string;            // Truncated if very long
  stderr: string;            // Truncated if very long
  durationMs: number;        // Execution time
  timestamp: number;         // When it was captured
  artifactType: 'test' | 'build' | 'cli' | 'unknown';
}

export interface TaskSpec {
  description: string;
  passes: boolean;
  qualityScore?: number;
  selfReviewNotes?: string;
  humanSignoff?: HumanSignoff;
}