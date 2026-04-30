// Main orchestrator facade

import { EventEmitter } from 'events';
import { Task, TaskResult } from './Task';
import { TaskQueue, QueueConfig } from './TaskQueue';
import { TaskDecomposer, DecompositionOptions } from './TaskDecomposer';
import { ParallelExecutor, ExecutorConfig, WorkerConfig } from './ParallelExecutor';
import { FileCoordinator } from './FileCoordinator';
import { ResultAggregator, AggregatedResult } from './ResultAggregator';
import { Agent } from '../agent/agent';
import { McpManager } from '../agent/mcp';
import { SkillManager } from '../agent/skills';

export interface OrchestratorConfig {
  queue: QueueConfig;
  executor: ExecutorConfig;
  decomposition: Partial<DecompositionOptions>;
  enableParallelMcpCalls: boolean;
  enableFileCoordination: boolean;
}

export interface OrchestratedResult {
  success: boolean;
  summary: string;
  details: AggregatedResult;
}

export interface StatusUpdate {
  level: 'info' | 'progress' | 'warning' | 'error' | 'success';
  message: string;
  taskId?: string;
  progress?: { current: number; total: number; label: string };
  timestamp: number;
}

export class Orchestrator {
  private config: OrchestratorConfig;
  private queue: TaskQueue;
  private decomposer: TaskDecomposer;
  private executor: ParallelExecutor;
  private coordinator: FileCoordinator;
  private aggregator: ResultAggregator;

  private agent: Agent;
  private skillManager: SkillManager;
  private mcpManager: McpManager;
  private workers: WorkerConfig[] = [];

  constructor(
    baseAgent: Agent,
    config?: Partial<OrchestratorConfig>
  ) {
    this.config = {
      queue: { maxConcurrent: 4, maxQueued: 100 },
      executor: { maxWorkers: 4, taskTimeoutMs: 120000, enableParallelTools: true },
      decomposition: { maxSubtasks: 10, enableImplicitParallel: true },
      enableParallelMcpCalls: true,
      enableFileCoordination: true,
      ...config,
    };

    this.agent = baseAgent;
    this.skillManager = baseAgent.skillManager;
    this.mcpManager = baseAgent.mcpManager;

    this.queue = new TaskQueue(this.config.queue);
    this.coordinator = new FileCoordinator();
    this.aggregator = new ResultAggregator();
    this.decomposer = new TaskDecomposer(baseAgent);

    this.executor = new ParallelExecutor(
      this.queue,
      this.coordinator,
      this.config.executor,
      {
        onStatusChange: (taskId, status) => {
          if (status === 'running') {
            this.emitTaskStart(taskId, '');
          } else if (status === 'completed' || status === 'failed') {
            this.emitTaskComplete(taskId, status === 'completed');
          }
        },
        onProgress: (taskId, message) => {
          // progress callbacks handled via onStatus in execute()
        },
        onResult: (taskId, result) => {
          this.emitTaskComplete(taskId, result.success);
        },
        onFileConflict: (taskId, conflicts) => {
          // file conflict handling
        },
      }
    );
  }

  private emitTaskStart(taskId: string, description: string): void {
    // Stub for event callbacks
  }

  private emitTaskComplete(taskId: string, success: boolean): void {
    // Stub for event callbacks
  }

  registerWorkers(configs: WorkerConfig[]): void {
    this.workers = configs;
    for (const worker of configs) {
      this.executor.registerWorker(worker);
    }
  }

  async execute(
    request: string,
    options?: {
      tasks?: string;
      runTests?: boolean;
      onStatus?: (update: StatusUpdate) => void;
    }
  ): Promise<OrchestratedResult> {
    const onStatus = options?.onStatus;

    onStatus?.({
      level: 'info',
      message: `Orchestrating: ${request}`,
      timestamp: Date.now(),
    });

    let tasks: Task[];
    if (options?.tasks) {
      tasks = this.decomposer.decomposeSimple(options.tasks);
      onStatus?.({
        level: 'info',
        message: `Executing ${tasks.length} explicit tasks`,
        timestamp: Date.now(),
      });
    } else {
      onStatus?.({
        level: 'progress',
        message: 'Decomposing task into parallel subtasks...',
        timestamp: Date.now(),
      });
      tasks = await this.decomposer.decompose(request, {
        availableFiles: this.agent.getFiles(),
        existingSkills: this.skillManager.getAllSkills().map(s => s.name),
        mcpServers: Array.from(this.mcpManager.getClients().keys()),
      });
      onStatus?.({
        level: 'info',
        message: `Decomposed into ${tasks.length} parallel subtasks`,
        timestamp: Date.now(),
      });
    }

    if (this.config.enableFileCoordination) {
      for (const task of tasks) {
        if (task.producedFiles) {
          const conflicts = this.coordinator.wouldConflict(task.id, task.producedFiles);
          if (conflicts.length > 0) {
            onStatus?.({
              level: 'warning',
              message: `File conflicts: ${conflicts.join(', ')}`,
              timestamp: Date.now(),
            });
          }
        }
      }
    }

    for (const task of tasks) {
      this.queue.enqueue(task);
    }

    onStatus?.({
      level: 'progress',
      message: 'Executing tasks in parallel...',
      timestamp: Date.now(),
    });

    if (this.workers.length === 0) {
      this.registerWorkers([{
        workerId: 'default',
        agentConfig: {
          model: this.agent.model,
          baseUrl: this.agent.baseUrl,
          apiKey: this.agent.apiKey,
        } as any,
        mcpManager: this.mcpManager,
        skillManager: this.skillManager,
        kernel: this.agent.kernel,
        db: this.agent.db,
      }]);
    }

    const results = await this.executor.run();

    onStatus?.({
      level: 'progress',
      message: 'Aggregating results...',
      timestamp: Date.now(),
    });
    const aggregated = await this.aggregator.aggregate(results, request);

    const success = aggregated.success;
    onStatus?.({
      level: success ? 'success' : 'warning',
      message: success ? 'All tasks completed successfully' : `Completed with ${aggregated.failedTasks.length} failures`,
      timestamp: Date.now(),
    });

    return {
      success,
      summary: aggregated.summary,
      details: aggregated,
    };
  }

  async executeMcpParallel(
    calls: Array<{ server: string; tool: string; args: any }>
  ): Promise<Array<{ server: string; tool: string; result: any; error?: string }>> {
    return Promise.all(
      calls.map(async (call) => {
        try {
          const result = await this.mcpManager.callTool(call.server, call.tool, call.args);
          return { server: call.server, tool: call.tool, result };
        } catch (e: any) {
          return { server: call.server, tool: call.tool, result: null, error: e.message };
        }
      })
    );
  }

  getStatus() {
    return {
      queue: this.queue.getStatus(),
      workers: this.workers.length,
      lockedFiles: this.coordinator.getLockedFiles().size,
    };
  }
}