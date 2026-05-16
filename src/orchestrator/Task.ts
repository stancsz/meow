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

export interface TaskResult {
  taskId: string;
  success: boolean;
  output?: string;
  error?: string;
  artifacts?: FileArtifact[];
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
  agentConfig?: {
    model: string;
    baseUrl: string;
    apiKey?: string;
  };
  result?: TaskResult;
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

export interface TaskSpec {
  description: string;
  passes: boolean;
  qualityScore?: number;
  selfReviewNotes?: string;
  humanSignoff?: HumanSignoff;
}