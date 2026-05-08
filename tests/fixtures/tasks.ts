import { Task, TaskPriority, TaskDependency, FileArtifact } from "../../src/orchestrator/Task";

export interface TaskOptions {
  id?: string;
  description?: string;
  priority?: TaskPriority;
  dependencies?: TaskDependency[];
  requiredFiles?: string[];
  producedFiles?: FileArtifact[];
  toolName?: string;
  toolArgs?: string;
  maxRetries?: number;
  timeoutMs?: number;
  status?: Task["status"];
  assignedWorker?: string;
  createdAt?: number;
}

let taskCounter = 0;
function nextId(): string {
  return `task-${Date.now()}-${++taskCounter}`;
}

/**
 * Factory for creating Task objects in tests.
 * Replaces inline task objects scattered across test files.
 */
export function makeTask(options: TaskOptions = {}): Task {
  const now = Date.now();
  return {
    id: options.id ?? nextId(),
    description: options.description ?? "Test task",
    priority: options.priority ?? "medium",
    dependencies: options.dependencies ?? [],
    createdAt: options.createdAt ?? now,
    maxRetries: options.maxRetries ?? 2,
    timeoutMs: options.timeoutMs ?? 120000,
    status: options.status ?? "pending",
    requiredFiles: options.requiredFiles,
    producedFiles: options.producedFiles,
    toolName: options.toolName,
    toolArgs: options.toolArgs,
    assignedWorker: options.assignedWorker,
  };
}

export function makeTaskWithDeps(dependents: string[], required: boolean = true): TaskDependency[] {
  return dependents.map(taskId => ({ taskId, required }));
}

/**
 * Create a task that depends on other tasks.
 */
export function makeDependentTask(
  id: string,
  dependencies: TaskDependency[],
  options: Partial<TaskOptions> = {}
): Task {
  return makeTask({ id, dependencies, ...options });
}

/**
 * Create multiple tasks with a dependency chain.
 * E.g., makeTaskChain(["t1", "t2", "t3"]) creates t3 depending on t2, t2 depending on t1
 */
export function makeTaskChain(
  ids: string[],
  options: Partial<TaskOptions> = {}
): Task[] {
  return ids.map((id, index) => {
    const dependencies: TaskDependency[] =
      index > 0 ? [{ taskId: ids[index - 1], required: true }] : [];
    return makeTask({ id, dependencies, ...options });
  });
}

/**
 * Create tasks that produce files.
 */
export function makeTaskWithFiles(
  id: string,
  files: Array<{ path: string; operation: "create" | "update" | "delete" }>,
  options: Partial<TaskOptions> = {}
): Task {
  return makeTask({
    id,
    producedFiles: files.map(f => ({ path: f.path, operation: f.operation })),
    ...options,
  });
}

/**
 * Create a "hanging" task that will never complete on its own.
 * Useful for timeout testing.
 */
export function makeHangingTask(id: string = "hanging"): Task {
  return makeTask({
    id,
    timeoutMs: 100, // Very short timeout
    description: "Task that hangs",
  });
}

/**
 * Create a task that simulates failure.
 */
export function makeFailingTask(id: string, error: string = "Simulated failure"): Task {
  return makeTask({
    id,
    maxRetries: 0,
    description: error,
  });
}

/**
 * Create a high-priority task.
 */
export function makeUrgentTask(id: string, options: Partial<TaskOptions> = {}): Task {
  return makeTask({ id, priority: "high", ...options });
}
