// Worker pool execution engine

import { Task, TaskResult, TaskEvents } from './Task';
import { TaskQueue } from './TaskQueue';
import { FileCoordinator } from './FileCoordinator';
import { Agent, AgentConfig } from '../agent/agent';
import { McpManager } from '../agent/mcp';
import { SkillManager } from '../agent/skills';
import { DEFAULT_TOOLS } from '../types/tool';
import { MeowKernel } from '../kernel/kernel';
import { DatabasePort } from '../extensions/database/manifest';

export interface WorkerConfig {
  workerId: string;
  agentConfig: AgentConfig;
  mcpManager?: McpManager;
  skillManager?: SkillManager;
  kernel: MeowKernel;
  db: DatabasePort;
}

export interface ExecutorConfig {
  maxWorkers: number;
  taskTimeoutMs: number;
  enableParallelTools: boolean;
}

export class ParallelExecutor {
  private queue: TaskQueue;
  private coordinator: FileCoordinator;
  private workers: Map<string, WorkerConfig> = new Map();
  private runningTasks: Map<string, { task: Task; workerId: string; timeout: NodeJS.Timeout }> = new Map();
  private executorConfig: ExecutorConfig;
  private taskEvents?: TaskEvents;

  constructor(
    queue: TaskQueue,
    coordinator: FileCoordinator,
    executorConfig: ExecutorConfig,
    taskEvents?: TaskEvents
  ) {
    this.queue = queue;
    this.coordinator = coordinator;
    this.executorConfig = executorConfig;
    this.taskEvents = taskEvents;
  }

  registerWorker(worker: WorkerConfig): void {
    this.workers.set(worker.workerId, worker);
  }

  async run(): Promise<Map<string, TaskResult>> {
    return new Promise((resolve) => {
      const results = new Map<string, TaskResult>();
      let pendingCompletions = 0;

      const checkDone = () => {
        if (pendingCompletions > 0) return;
        if (this.queue.canAcceptWork()) return;
        resolve(results);
      };

      const startTask = (task: Task, worker: WorkerConfig) => {
        pendingCompletions++;
        const timeout = setTimeout(() => {
          this.handleTaskTimeout(task.id);
        }, task.timeoutMs || this.executorConfig.taskTimeoutMs);

        this.runningTasks.set(task.id, { task, workerId: worker.workerId, timeout });
        this.taskEvents?.onStatusChange?.(task.id, 'running');

        this.executeTask(task, worker).then((result: TaskResult) => {
          results.set(task.id, result);
          clearTimeout(timeout);
          this.runningTasks.delete(task.id);
          this.taskEvents?.onResult?.(task.id, result);
          pendingCompletions--;
          checkDone();
        }).catch((error: any) => {
          const failedResult: TaskResult = {
            taskId: task.id,
            success: false,
            error: error.message || String(error),
          };
          results.set(task.id, failedResult);
          clearTimeout(timeout);
          this.runningTasks.delete(task.id);
          this.taskEvents?.onResult?.(task.id, failedResult);
          pendingCompletions--;
          checkDone();
        });
      };

      const dispatch = () => {
        while (this.queue.canAcceptWork()) {
          const task = this.queue.dequeue();
          if (!task) break;
          const worker = this.selectWorker(task);
          if (!worker) {
            this.queue.cancel(task.id);
            this.queue.enqueue(task);
            break;
          }
          startTask(task, worker);
        }
      };

      dispatch();
      checkDone();
    });
  }

  private async executeTask(task: Task, worker: WorkerConfig): Promise<TaskResult> {
    try {
      let result: TaskResult;

      if (task.toolName) {
        result = await this.executeToolTask(task, worker);
      } else {
        result = await this.executeAgentTask(task, worker);
      }

      this.coordinator.release(task.id);
      this.queue.complete(task.id, result);
      return result;

    } catch (error: any) {
      const failedResult: TaskResult = {
        taskId: task.id,
        success: false,
        error: error.message || String(error),
      };

      this.coordinator.release(task.id);
      this.queue.complete(task.id, failedResult);
      return failedResult;
    }
  }

  private async executeAgentTask(task: Task, worker: WorkerConfig): Promise<TaskResult> {
    const agent = new Agent({
      ...worker.agentConfig,
      kernel: worker.kernel,
      db: worker.db
    });

    if (worker.skillManager) {
      agent.skillManager = worker.skillManager;
    }
    if (worker.mcpManager) {
      agent.mcpManager = worker.mcpManager;
    }

    if (task.requiredFiles) {
      task.requiredFiles.forEach(f => agent.addFile(f));
    }

    const output = await agent.chat(
      task.description,
      false,
      undefined,
      (status) => this.taskEvents?.onProgress?.(task.id, status)
    );

    const artifacts = agent.getEditedFiles().map(path => ({
      path,
      operation: 'update' as const,
    }));

    return {
      taskId: task.id,
      success: true,
      output,
      artifacts,
    };
  }

  private async executeToolTask(task: Task, worker: WorkerConfig): Promise<TaskResult> {
    const tool = DEFAULT_TOOLS.find(t => t.name === task.toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${task.toolName}`);
    }

    const output = await tool.execute(task.toolArgs || '', undefined);

    return {
      taskId: task.id,
      success: true,
      output,
    };
  }

  private selectWorker(task: Task): WorkerConfig | null {
    const available = Array.from(this.workers.values());
    if (available.length === 0) return null;

    const workerLoads = available.map(w => {
      let count = 0;
      for (const exec of this.runningTasks.values()) {
        if (exec.workerId === w.workerId) count++;
      }
      return { worker: w, load: count };
    });

    workerLoads.sort((a, b) => a.load - b.load);
    return workerLoads[0].load < this.executorConfig.maxWorkers ? workerLoads[0].worker : null;
  }

  private handleTaskTimeout(taskId: string): void {
    const execution = this.runningTasks.get(taskId);
    if (!execution) return;

    this.coordinator.release(taskId);

    const timeoutResult: TaskResult = {
      taskId,
      success: false,
      error: `Task timed out after ${execution.task.timeoutMs}ms`,
    };

    this.queue.complete(taskId, timeoutResult);
    this.taskEvents?.onResult?.(taskId, timeoutResult);
    this.runningTasks.delete(taskId);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async executeToolsParallel(
    tools: Array<{ name: string; args: string }>
  ): Promise<Array<{ name: string; result: string; error?: string }>> {
    const results = await Promise.allSettled(
      tools.map(async ({ name, args }) => {
        const tool = DEFAULT_TOOLS.find(t => t.name === name);
        if (!tool) throw new Error(`Tool not found: ${name}`);
        return { name, result: await tool.execute(args, undefined) };
      })
    );

    return results.map((r, i) => {
      if (r.status === 'fulfilled') {
        return { name: tools[i].name, result: r.value.result };
      }
      return { name: tools[i].name, result: '', error: String(r.reason) };
    });
  }
}