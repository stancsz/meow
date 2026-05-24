// ExecutionModes — Mode Routing Infrastructure
//
// Gap 1 fix (architectural-decisions.md): L3 flat — no execution modes
// This module provides the routing stub that dispatches to mode-specific handlers.
// The enum lives in ExecutionMode.ts; this module provides the routing layer.

import { ExecutionMode } from './ExecutionMode';
import { OrchestratorConfig, OrchestratedResult } from './Orchestrator';

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

/**
 * AUTOPILOT handler: analyst → architect → executor → qa (full pipeline, quality-gated)
 */
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
    // TODO: Implement AUTOPILOT pipeline (analyst → architect → executor → qa)
    throw new Error('AutopilotHandler not yet implemented — use SHIP or SEQUENTIAL mode');
  }
}

/**
 * ECOMODE handler: always Haiku, fallback Sonnet — cost-optimized
 */
export class EcoModeHandler implements ModeHandler {
  readonly mode = ExecutionMode.ECOMODE;

  canHandle(m: ExecutionMode): boolean {
    return m === ExecutionMode.ECOMODE;
  }

  async execute(
    _task: string,
    _config: OrchestratorConfig,
    _handlers: ModeHandlers
  ): Promise<OrchestratedResult> {
    // TODO: Implement ECOMODE (Haiku-first, fallback Sonnet)
    throw new Error('EcoModeHandler not yet implemented — use PARALLEL mode');
  }
}

/**
 * PIPELINE handler: analyst → architect → executor → qa → writer (sequential chain)
 */
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
    // TODO: Implement PIPELINE (sequential chain)
    throw new Error('PipelineHandler not yet implemented — use SHIP or SEQUENTIAL mode');
  }
}

/**
 * RALPH handler: ultrawork loop + architect_verify (never gives up, max 100 iterations)
 */
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
    // TODO: Implement RALPH (ultrawork, 100 retries, architect verify)
    throw new Error('RalphHandler not yet implemented — use SHIP or SEQUENTIAL mode');
  }
}

export interface ModeHandlers {
  autopilot: AutopilotHandler;
  ecomode: EcoModeHandler;
  pipeline: PipelineHandler;
  ralph: RalphHandler;
}

/**
 * Routing table: maps ExecutionMode to ModeHandler
 */
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

/**
 * Get handler for a given mode, or null if no specialized handler exists.
 */
export function getHandler(mode: ExecutionMode): ModeHandler | null {
  return MODE_HANDLERS[mode] ?? null;
}

/**
 * Route execution to the appropriate mode handler.
 * Falls back to Orchestrator's built-in execution if no specialized handler exists.
 */
export function routeToHandler(
  mode: ExecutionMode,
  task: string,
  config: OrchestratorConfig,
  handlers: ModeHandlers
): Promise<OrchestratedResult> | null {
  const handler = getHandler(mode);
  if (!handler) {
    return null; // Signal to use default execution
  }
  return handler.execute(task, config, handlers);
}