// LLM-based task decomposition

import { Task, TaskPriority } from './Task';
import { Agent } from '../agent/agent';

export interface DecompositionOptions {
  maxSubtasks: number;
  enableImplicitParallel: boolean;
}

export class TaskDecomposer {
  private agent: Agent;
  private defaultOptions: DecompositionOptions = {
    maxSubtasks: 10,
    enableImplicitParallel: true,
  };

  constructor(agent: Agent) {
    this.agent = agent;
  }

  async decompose(
    userRequest: string,
    context: {
      availableFiles?: string[];
      existingSkills?: string[];
      mcpServers?: string[];
    },
    options?: Partial<DecompositionOptions>
  ): Promise<Task[]> {
    const opts = { ...this.defaultOptions, ...options };

    const decompositionPrompt = this.buildDecompositionPrompt(userRequest, context, opts);

    const timeoutMs = 60000; // 60 second timeout for LLM decomposition

    // Complexity threshold for DoD enforcement (tasks above this complexity require success criteria)
    const COMPLEXITY_THRESHOLD = 30;
    const defaultSuccessCriteria = { acceptanceCriteria: [] as string[] };

    const response = await Promise.race([
      this.agent.callLLM(
        await this.agent.buildSystemPrompt(),
        [{ role: 'user', content: decompositionPrompt }]
      ),
      new Promise< never >((_, reject) =>
        setTimeout(() => reject(new Error(`LLM decomposition timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);

    return this.parseTasksFromResponse(response, userRequest, defaultSuccessCriteria, COMPLEXITY_THRESHOLD);
  }

  /**
   * Validate and block execution for tasks that exceed complexity threshold but lack success criteria.
   * Called after task parsing to enforce Definition of Done requirements.
   */
  private validateAndEnforceDoD(tasks: Task[], complexityThreshold: number): void {
    const invalidTasks = tasks.filter(task => {
      const complexity = this.estimateTaskComplexity(task);
      return complexity >= complexityThreshold &&
        (!task.definitionOfDone || task.definitionOfDone.length === 0);
    });

    if (invalidTasks.length > 0) {
      const taskIds = invalidTasks.map(t => t.id).join(', ');
      throw new Error(
        `Execution blocked: ${invalidTasks.length} task(s) exceed complexity threshold (${complexityThreshold}) ` +
        `but have no definitionOfDone: [${taskIds}]. ` +
        `Each task above this complexity requires explicit acceptance criteria. ` +
        `Add definitionOfDone to each task or split into simpler subtasks.`
      );
    }
  }

  /**
   * Estimate task complexity based on description length and structural factors.
   */
  private estimateTaskComplexity(task: Task): number {
    let complexity = Math.min(100, task.description.length / 2);
    complexity += (task.requiredFiles?.length ?? 0) * 5;
    complexity += (task.producedFiles?.length ?? 0) * 5;
    complexity += task.dependencies.length * 10;
    return Math.min(100, complexity);
  }

  private buildDecompositionPrompt(
    request: string,
    context: {
      availableFiles?: string[];
      existingSkills?: string[];
      mcpServers?: string[];
    },
    opts: DecompositionOptions
  ): string {
    return `You are a task decomposition specialist. Analyze the following user request and break it into independent subtasks that can be executed in parallel.

REQUEST: ${request}

CONTEXT:
- Available Files: ${context.availableFiles?.join(', ') || 'None specified'}
- Existing Skills: ${context.existingSkills?.join(', ') || 'None'}
- MCP Servers: ${context.mcpServers?.join(', ') || 'None'}

CONSTRAINTS:
- Maximum ${opts.maxSubtasks} subtasks
- Each subtask must be independently executable
- Identify file access requirements for each subtask
- Mark dependencies between subtasks when they exist
- Tasks that modify the same file have a dependency relationship

Output format - JSON array of tasks:
[
  {
    "description": "Clear description of what this subtask does",
    "priority": "high|medium|low",
    "dependencies": [{"taskId": "task-1", "required": true}],
    "requiredFiles": ["file1.ts", "file2.ts"],
    "producedFiles": [{"path": "file3.ts", "operation": "create"}],
    "reasoning": "Why this is independent/how it relates to other tasks"
  }
]

JSON OUTPUT ONLY - no markdown, no explanation:`;
  }

  private parseTasksFromResponse(
    response: string,
    originalRequest: string,
    successCriteria: { acceptanceCriteria: string[] },
    complexityThreshold: number
  ): Task[] {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      const fallbackCriteria = successCriteria.acceptanceCriteria.length > 0
        ? successCriteria.acceptanceCriteria
        : ['task completed successfully'];
      return [this.createTask(originalRequest, 'high', [], { definitionOfDone: fallbackCriteria })];
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const tasks: Task[] = parsed.map((item: any, idx: number) => {
        const definitionOfDone = this.extractDefinitionOfDone(item, successCriteria.acceptanceCriteria);
        return this.createTask(
          item.description,
          item.priority || 'medium',
          (item.dependencies || []).map((d: any) => ({
            taskId: d.taskId,
            required: d.required ?? true,
          })),
          {
            requiredFiles: item.requiredFiles,
            producedFiles: item.producedFiles,
            definitionOfDone,
          }
        );
      });

      // Enforce DoD blocking for high-complexity tasks
      this.validateAndEnforceDoD(tasks, complexityThreshold);
      return tasks;
    } catch {
      return [this.createTask(originalRequest, 'high', [], { definitionOfDone: ['task completed successfully'] })];
    }
  }

  private createTask(
    description: string,
    priority: TaskPriority,
    dependencies: Task['dependencies'],
    options?: {
      requiredFiles?: string[];
      producedFiles?: Task['producedFiles'];
      definitionOfDone?: string[];
    }
  ): Task {
    return {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      description,
      priority,
      dependencies,
      createdAt: Date.now(),
      maxRetries: 2,
      timeoutMs: 120000,
      status: 'pending',
      requiredFiles: options?.requiredFiles,
      producedFiles: options?.producedFiles,
      definitionOfDone: options?.definitionOfDone || [],
    };
  }

  /**
   * Extract definition of done criteria from task item or fall back to global criteria.
   * Blocks execution if task complexity is above threshold and no criteria are provided.
   */
  private extractDefinitionOfDone(item: any, defaultCriteria: string[]): string[] {
    // Prefer task-specific criteria
    if (item.definitionOfDone && Array.isArray(item.definitionOfDone) && item.definitionOfDone.length > 0) {
      return item.definitionOfDone;
    }
    if (item.successCriteria && Array.isArray(item.successCriteria) && item.successCriteria.length > 0) {
      return item.successCriteria;
    }
    if (item.acceptanceCriteria && Array.isArray(item.acceptanceCriteria) && item.acceptanceCriteria.length > 0) {
      return item.acceptanceCriteria;
    }
    // Fall back to mission-level criteria
    return defaultCriteria.length > 0 ? defaultCriteria : ['task completed successfully'];
  }

  /**
   * Check if task meets complexity threshold for DoD requirement.
   * Returns true if DoD is required (complexity >= threshold).
   */
  private requiresDefinitionOfDone(taskComplexity: number, threshold: number): boolean {
    return taskComplexity >= threshold;
  }

  /**
   * Validate that tasks have definitionOfDone when required by complexity.
   * Throws an error if validation fails.
   */
  public validateTasks(tasks: Task[], complexityThreshold: number = 30): void {
    for (const task of tasks) {
      if (this.requiresDefinitionOfDone(task.description.length, complexityThreshold)) {
        if (!task.definitionOfDone || task.definitionOfDone.length === 0) {
          throw new Error(
            `Task "${task.id}" exceeds complexity threshold (${complexityThreshold}) but has no definitionOfDone. ` +
            `Tasks above this complexity require explicit acceptance criteria.`
          );
        }
      }
    }
  }

  decomposeSimple(taskList: string): Task[] {
    return taskList.split('/').map((desc, idx) => ({
      id: `task-simple-${idx}`,
      description: desc.trim(),
      priority: 'medium' as TaskPriority,
      dependencies: [] as Task['dependencies'],
      createdAt: Date.now(),
      maxRetries: 2,
      timeoutMs: 120000,
      status: 'pending' as const,
      definitionOfDone: ['subtask completed'],
    }));
  }
}