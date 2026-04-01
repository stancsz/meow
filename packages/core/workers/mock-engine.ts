import { Task, ExecutionContext, TaskResult } from "../core/types";
import { ExecutionEngine } from "../core/execution-engine";
import { EngineUnavailableError } from "./delegation";

export interface MockEngineOptions {
  simulateTimeout?: boolean;
  simulateError?: boolean;
  simulateUnavailable?: boolean;
  executionDelayMs?: number;
  onProgress?: (progress: number, message: string) => void;
}

export class MockExecutionEngine implements ExecutionEngine {
  private options: MockEngineOptions;

  constructor(options: MockEngineOptions = {}) {
    this.options = {
      executionDelayMs: 100,
      ...options
    };
  }

  async execute(task: Task, context: ExecutionContext): Promise<TaskResult> {
    const { executionDelayMs, simulateTimeout, simulateError, simulateUnavailable, onProgress } = this.options;

    if (simulateUnavailable) {
      throw new EngineUnavailableError("Mock engine is currently unavailable.");
    }

    if (onProgress) {
      onProgress(10, `Engine received task ${task.id}`);
    }

    // Simulate work
    if (executionDelayMs && executionDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, executionDelayMs));
    }

    if (simulateTimeout) {
      // Just wait forever to force a timeout
      await new Promise(() => {});
    }

    if (onProgress) {
      onProgress(90, `Engine finished task ${task.id}`);
    }

    if (simulateError) {
      throw new Error(`Simulated engine error for task ${task.id}`);
    }

    return {
      status: "success",
      message: `Successfully executed mock task ${task.id}`,
      skills_used: task.skills || [],
      delegated_to: "mock-engine",
      output: {
        simulated: true,
        credentialsPassed: Object.keys(context.credentials)
      }
    };
  }
}
