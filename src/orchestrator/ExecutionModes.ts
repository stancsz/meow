// ExecutionModes — Mode Routing Infrastructure
//
// Gap 1 fix (architectural-decisions.md): L3 flat — no execution modes
// This module provides the routing stub that dispatches to mode-specific handlers.
// The enum lives in ExecutionMode.ts; this module provides the routing layer.

import { ExecutionMode } from './ExecutionMode';
import { OrchestratorConfig, OrchestratedResult } from './Orchestrator';
import { tuiEvents } from '../cli/tui-events';
import type { Task } from './Task';
import { TaskQueue } from './TaskQueue';
import { ParallelExecutor } from './ParallelExecutor';
import { FileCoordinator } from './FileCoordinator';
import { DelegationProtocol } from './DelegationProtocol';
import { config as envConfig } from '../config/env';
import { MeowKernel } from '../kernel/kernel';
import { MeowDatabase } from '../kernel/database';
import { McpManager } from '../agent/mcp';
import { SkillManager } from '../agent/skills';

export interface ModeHandler {
  readonly mode: ExecutionMode;
  canHandle(mode: ExecutionMode): boolean;
  execute(task: string, config: OrchestratorConfig, handlers: ModeHandlers): Promise<OrchestratedResult>;
}

export interface ModeHandlerConfig {
  mode: ExecutionMode;
  maxConcurrent?: number;
  timeoutMs?: number;
  retries?: number;
}

export class AutopilotHandler implements ModeHandler {
  readonly mode = ExecutionMode.AUTOPILOT;

  canHandle(m: ExecutionMode): boolean {
    return m === ExecutionMode.AUTOPILOT;
  }

  async execute(
    _task: string,
    _config: OrchestratorConfig,
    _handlers: ModeHandlers
  ): Promise<OrchestratedResult> {
    throw new Error('AutopilotHandler not yet implemented — use SHIP or SEQUENTIAL mode');
  }
}

export class EcoModeHandler implements ModeHandler {
  readonly mode = ExecutionMode.ECOMODE;

  canHandle(m: ExecutionMode): boolean {
    return m === ExecutionMode.ECOMODE;
  }

  async execute(
    task: string,
    config: OrchestratorConfig,
    _handlers: ModeHandlers
  ): Promise<OrchestratedResult> {
    const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
    const SONNET_MODEL = 'claude-3-5-sonnet-latest';
    const MAX_RETRIES = 1;
    const TIMEOUT_MS = 30_000;

    const taskId = 'ecomode-' + Date.now();
    tuiEvents.emitTaskStart(taskId, '[ECOMODE] ' + task.substring(0, 60) + '...');

    let lastResult: OrchestratedResult | null = null;
    const models = [HAIKU_MODEL, SONNET_MODEL];

    for (let attempt = 0; attempt < models.length; attempt++) {
      const model = models[attempt];
      const currentTaskId = taskId + '-' + attempt;

      tuiEvents.emitTaskUpdate(currentTaskId, 'running', 'Attempt with ' + model);

      const taskData: Task = {
        id: currentTaskId,
        description: task,
        priority: 'medium',
        dependencies: [],
        createdAt: Date.now(),
        maxRetries: MAX_RETRIES,
        timeoutMs: TIMEOUT_MS,
        status: 'pending',
        producedFiles: [],
        agentConfig: {
          model,
          baseUrl: envConfig.baseUrl,
          apiKey: envConfig.apiKey || '',
        },
      };
      taskData.assignedWorker = DelegationProtocol.determineSpecialistForTask(taskData);

      const taskQueue = new TaskQueue(config.queue);
      const coordinator = new FileCoordinator();

      taskQueue.enqueue(taskData);

      const kernel = new MeowKernel({} as any);
      const db = new MeowDatabase({} as any);

      const executor = new ParallelExecutor(
        taskQueue,
        coordinator,
        config.executor,
        {
          onStatusChange: (tid, status) => {
            if (status === 'running') tuiEvents.emitTaskStart(tid, task);
            else if (status === 'completed') tuiEvents.emitTaskUpdate(tid, 'done');
            else if (status === 'failed') tuiEvents.emitTaskUpdate(tid, 'failed');
          },
          onProgress: (_tid, message) => tuiEvents.emitMessage('info', message),
          onResult: () => {},
          onFileConflict: (_tid, conflicts) =>
            tuiEvents.emitMessage('warn', 'File conflict: ' + conflicts.join(', ')),
        }
      );

      const mcpMgr = new McpManager();
      const skillMgr = new SkillManager();
      executor.registerWorker({
        workerId: 'eco-worker-' + attempt,
        agentConfig: {
          model,
          baseUrl: envConfig.baseUrl,
          apiKey: envConfig.apiKey || '',
        },
        mcpManager: mcpMgr,
        skillManager: skillMgr,
        kernel,
        db,
      } as any);

      const results = await executor.run();
      const taskResult = results.get(currentTaskId);

      if (taskResult?.success) {
        tuiEvents.emitTaskUpdate(currentTaskId, 'done', 'Success with ' + model);
        tuiEvents.emitMessage('info', 'ECOMODE succeeded with ' + model);
        return {
          success: true,
          summary: 'ECOMODE completed with ' + model + ': ' + (taskResult.output || ''),
          details: {
            successfulTasks: [currentTaskId],
            failedTasks: [],
            totalTasks: 1,
          } as any,
        };
      }

      lastResult = {
        success: false,
        summary: 'ECOMODE ' + model + ' failed: ' + (taskResult?.error || 'unknown'),
        details: {
          successfulTasks: [],
          failedTasks: [currentTaskId],
          totalTasks: 1,
        } as any,
      };

      if (attempt < models.length - 1) {
        tuiEvents.emitMessage('info', 'Falling back from Haiku to Sonnet...');
      }
    }

    tuiEvents.emitTaskUpdate(taskId, 'failed', 'Both Haiku and Sonnet failed');
    return lastResult!;
  }
}

export class PipelineHandler implements ModeHandler {
  readonly mode = ExecutionMode.PIPELINE;

  canHandle(m: ExecutionMode): boolean {
    return m === ExecutionMode.PIPELINE;
  }

  async execute(
    _task: string,
    _config: OrchestratorConfig,
    _handlers: ModeHandlers
  ): Promise<OrchestratedResult> {
    throw new Error('PipelineHandler not yet implemented — use SHIP or SEQUENTIAL mode');
  }
}

export class RalphHandler implements ModeHandler {
  readonly mode = ExecutionMode.RALPH;

  canHandle(m: ExecutionMode): boolean {
    return m === ExecutionMode.RALPH;
  }

  async execute(
    _task: string,
    _config: OrchestratorConfig,
    _handlers: ModeHandlers
  ): Promise<OrchestratedResult> {
    throw new Error('RalphHandler not yet implemented — use SHIP or SEQUENTIAL mode');
  }
}

export interface ModeHandlers {
  autopilot: AutopilotHandler;
  ecomode: EcoModeHandler;
  pipeline: PipelineHandler;
  ralph: RalphHandler;
}

export const MODE_HANDLERS: Record<ExecutionMode, ModeHandler | null> = {
  [ExecutionMode.PARALLEL]: null,
  [ExecutionMode.SEQUENTIAL]: null,
  [ExecutionMode.AUDIT_ONLY]: null,
  [ExecutionMode.SHIP]: null,
  [ExecutionMode.AUTOPILOT]: new AutopilotHandler(),
  [ExecutionMode.ECOMODE]: new EcoModeHandler(),
  [ExecutionMode.PIPELINE]: new PipelineHandler(),
  [ExecutionMode.RALPH]: new RalphHandler(),
  [ExecutionMode.SWARM]: null,
  [ExecutionMode.ULTRAWORK]: null,
  [ExecutionMode.ULTRAPILOT]: null,
  [ExecutionMode.SWARM_TEAM]: null,
};

export function getHandler(mode: ExecutionMode): ModeHandler | null {
  return MODE_HANDLERS[mode] ?? null;
}

export function routeToHandler(
  mode: ExecutionMode,
  task: string,
  config: OrchestratorConfig,
  handlers: ModeHandlers
): Promise<OrchestratedResult> | null {
  const handler = getHandler(mode);
  if (!handler) {
    return null;
  }
  return handler.execute(task, config, handlers);
}
