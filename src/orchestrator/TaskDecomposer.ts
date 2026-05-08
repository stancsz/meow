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
    const response = await Promise.race([
      this.agent.callLLM(
        await this.agent.buildSystemPrompt(),
        [{ role: 'user', content: decompositionPrompt }]
      ),
      new Promise< never >((_, reject) =>
        setTimeout(() => reject(new Error(`LLM decomposition timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);

    return this.parseTasksFromResponse(response, userRequest);
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

  private parseTasksFromResponse(response: string, originalRequest: string): Task[] {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [this.createTask(originalRequest, 'high', [])];
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.map((item: any, idx: number) =>
        this.createTask(
          item.description,
          item.priority || 'medium',
          (item.dependencies || []).map((d: any) => ({
            taskId: d.taskId,
            required: d.required ?? true,
          })),
          {
            requiredFiles: item.requiredFiles,
            producedFiles: item.producedFiles,
          }
        )
      );
    } catch {
      return [this.createTask(originalRequest, 'high', [])];
    }
  }

  private createTask(
    description: string,
    priority: TaskPriority,
    dependencies: Task['dependencies'],
    options?: {
      requiredFiles?: string[];
      producedFiles?: Task['producedFiles'];
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
    };
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
    }));
  }
}