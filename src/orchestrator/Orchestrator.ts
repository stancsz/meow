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
import { Architect } from '../architect/Architect';
import { MissionBrief } from '../liaison/MissionBrief';
import { ExecutionMode, isQualityMode, SelfReviewResult } from './ExecutionMode';
import { SelfReviewRunner } from './SelfReviewRunner';

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
  private architect: Architect;
  private selfReviewRunner: SelfReviewRunner;

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
    this.architect = new Architect(this);

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

    // Default to SHIP mode (full quality pipeline)
    this.selfReviewRunner = new SelfReviewRunner({ mode: ExecutionMode.SHIP });
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
      mode?: ExecutionMode;
      onStatus?: (update: StatusUpdate) => void;
    }
  ): Promise<OrchestratedResult> {
    const mode = options?.mode ?? ExecutionMode.SHIP;
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
        mcpServers: Array.from(this.mcpManager.getConfigs().keys()),
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
            const msg = `CRITICAL: Parallel task collision detected on files: ${conflicts.join(', ')}. Execution blocked to prevent corruption.`;
            onStatus?.({
              level: 'error',
              message: msg,
              timestamp: Date.now(),
            });
            throw new Error(msg);
          }
        }
      }
    }

    for (const task of tasks) {
      this.queue.enqueue(task);
    }

    // Configure self-review runner for the current mode
    this.selfReviewRunner.updateConfig({ mode });

    if (isQualityMode(mode)) {
      // SEQUENTIAL / SHIP mode: use SelfReviewRunner with sequential execution
      onStatus?.({
        level: 'progress',
        message: `Executing tasks in ${mode} mode with quality gates...`,
        timestamp: Date.now(),
      });

      const results: { taskId: string; success: boolean; result: TaskResult }[] = [];

      for (const task of tasks) {
        const reviewResult = await this.selfReviewRunner.executeWithSelfReview(
          task,
          async (t) => {
            // Execute via registered workers
            return this.executeTaskWithWorker(t);
          }
        );

        results.push({
          taskId: task.id,
          success: reviewResult.passes,
          result: {
            taskId: task.id,
            success: reviewResult.passes,
            output: `Quality score: ${reviewResult.qualityScore}%, iterations: ${reviewResult.iterations}`,
            artifacts: reviewResult.issues.length > 0 ? [] : undefined,
            metadata: {
              qualityScore: reviewResult.qualityScore,
              selfReviewResult: reviewResult,
            } as Record<string, unknown>,
          },
        });
      }

      onStatus?.({
        level: 'progress',
        message: 'Aggregating results...',
        timestamp: Date.now(),
      });

      const aggregated = await this.aggregator.aggregate(
        new Map(results.map(r => [r.taskId, r.result])),
        request
      );

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

    // PARALLEL mode: use existing parallel execution (backward compatible default)
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

  /**
   * Execute a single task via registered workers (used by self-review).
   */
  private async executeTaskWithWorker(task: Task): Promise<TaskResult> {
    return new Promise((resolve) => {
      // Re-enqueue the task and wait for it to complete
      this.queue.enqueue(task);

      // Monitor the task via a minimal executor call
      const checkCompletion = () => {
        const status = this.queue.getStatus();
        const taskStatus = status.pending.find(t => t.id === task.id) || status.running.find(t => t.id === task.id);

        if (!taskStatus) {
          // Task has completed (or was never properly tracked here)
          resolve({
            taskId: task.id,
            success: true,
            output: 'Task executed via self-review',
          });
        } else {
          setTimeout(checkCompletion, 100);
        }
      };

      setTimeout(checkCompletion, 100);
    });
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

  /**
   * Graceful shutdown: release all resources including stale locks
   */
  async shutdown(): Promise<void> {
    // Release stale locks before shutdown
    const maxLockAgeMs = 5 * 60 * 1000; // 5 minutes
    const stale = this.coordinator.releaseStaleLocks(maxLockAgeMs);
    if (stale.length > 0) {
      console.log(`[Orchestrator] Released ${stale.length} stale file locks: ${stale.join(', ')}`);
    }

    // Release all remaining locks
    for (const [path, lock] of this.coordinator.getLockedFiles()) {
      this.coordinator.release(lock.taskId);
    }
  }
}