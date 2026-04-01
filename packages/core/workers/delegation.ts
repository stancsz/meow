import { Task, ExecutionContext, TaskResult } from "../core/types";
import { ExecutionEngine } from "../core/execution-engine";
import { DBClient } from "../db/client";

// Standardized error types
export class EngineUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineUnavailableError";
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

export class DelegationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelegationError";
  }
}

// Interfaces for callbacks and hooks
export type ProgressCallback = (progress: number, message: string) => void;
export type CleanupHook = () => Promise<void>;

export interface DelegationOptions {
  engine: ExecutionEngine;
  db: DBClient;
  timeoutMs?: number;
  onProgress?: ProgressCallback;
  onCleanup?: CleanupHook;
}

export async function delegateExecution(
  task: Task,
  context: ExecutionContext,
  options: DelegationOptions
): Promise<TaskResult> {
  const { engine, db, timeoutMs = 30000, onProgress, onCleanup } = options;
  const sessionId = context.sessionId;

  // 1. Idempotency Check
  if (task.action_type === "WRITE") {
    const isCompleted = db.checkIdempotency(task.id);
    if (isCompleted) {
      db.writeAuditLog(sessionId, "delegation_skipped_idempotent", { task_id: task.id });
      return {
        status: "skipped",
        message: "Task skipped due to idempotency check.",
        skills_used: [],
        delegated_to: "none"
      };
    }
  }

  // 2. Context Preparation (Secure credentials mask for logging)
  db.writeAuditLog(sessionId, "delegation_started", {
    task_id: task.id,
    skills: task.skills,
    credentials_provided: Object.keys(context.credentials)
  });

  if (onProgress) {
    onProgress(0, "Starting delegation");
  }

  // 3. Execution with Timeout
  let result: TaskResult;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    // Add a catch to prevent unhandled promise rejections if the engine fails after the timeout
    const executePromise = engine.execute(task, context).catch((err) => {
      throw err;
    });

    // We attach a dummy catch here to swallow any late rejections from the engine
    // to avoid UnhandledPromiseRejection errors when Promise.race has already rejected via timeout
    executePromise.catch(() => {});

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new TimeoutError(`Execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    if (onProgress) {
      onProgress(50, "Waiting for engine execution to complete");
    }

    result = await Promise.race([executePromise, timeoutPromise]);

    // 4. Result Aggregation and Logging
    db.writeAuditLog(sessionId, "delegation_completed", {
      task_id: task.id,
      status: result.status
    });

    if (onProgress) {
      onProgress(100, "Delegation completed successfully");
    }

    return result;

  } catch (error: any) {
    db.writeAuditLog(sessionId, "delegation_failed", {
      task_id: task.id,
      error: error.message
    });

    if (error instanceof TimeoutError) {
      throw error;
    }
    if (error instanceof EngineUnavailableError) {
      throw error;
    }

    throw new DelegationError(`Delegation failed: ${error.message}`);

  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // 5. Resource Cleanup
    if (onCleanup) {
      try {
        await onCleanup();
      } catch (cleanupError: any) {
        db.writeAuditLog(sessionId, "delegation_cleanup_failed", {
          task_id: task.id,
          error: cleanupError.message
        });
      }
    }
  }
}
