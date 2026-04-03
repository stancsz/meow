/// <reference types="node" />
/**
 * auto-mode.ts - Sidecar for auto-agent.ts tick/auto mode improvements
 *
 * GAP-AUTO-01: Improve the auto-agent.ts tick/auto modes.
 * Make sure the autonomous loop runs smoothly and can handle interrupts.
 *
 * This sidecar:
 * - Re-exports InterruptController from auto-agent.ts (single source of truth)
 * - Wires InterruptController into the autonomous loop
 * - Adds signal handlers (SIGINT/SIGTERM) for graceful shutdown
 * - Provides terminal focus awareness (pause when user away)
 * - Exposes a shared interrupt controller singleton for CLI integration
 * - Adds tick heartbeat monitoring and tick counting
 * - Implements waitForTickInterval with focus-aware pausing
 */

// ============================================================================
// Interrupt Controller (imported from core/interrupt.ts — single source of truth)
// ============================================================================

import { createInterruptController, type InterruptController } from "../core/interrupt.ts";

// Re-export for consumers of auto-mode.ts
export { createInterruptController };
export type { InterruptController };

// Shared Interrupt Controller (singleton)
let sharedInterruptController: InterruptController | null = null;

/**
 * Get or create the shared interrupt controller for the autonomous loop.
 * This allows CLI, REPL, and other components to signal the loop to stop.
 */
export function getInterruptController(): InterruptController {
  if (!sharedInterruptController) {
    sharedInterruptController = createInterruptController();
  }
  return sharedInterruptController;
}

/**
 * Reset the shared interrupt controller (useful between runs).
 */
export function resetInterruptController(): void {
  if (sharedInterruptController) {
    sharedInterruptController.reset();
  }
}

/**
 * Signal the autonomous loop to stop after the current tick.
 */
export function requestStopAfterTick(): void {
  getInterruptController().stopAfterTick();
}

/**
 * Signal the autonomous loop to stop immediately.
 */
export function requestStopNow(): void {
  getInterruptController().stopNow();
}

// Signal Handlers
let _signalsRegistered = false;

/**
 * Register SIGINT/SIGTERM handlers for graceful autonomous loop shutdown.
 * Called automatically when the loop starts; safe to call multiple times.
 */
export function registerSignalHandlers(): void {
  if (_signalsRegistered) return;
  _signalsRegistered = true;

  const ic = getInterruptController();

  const handleSIGINT = () => {
    console.log("\n[sig] SIGINT received -- requesting stop after current tick...");
    ic.stopAfterTick();
  };

  const handleSIGTERM = () => {
    console.log("\n[sig] SIGTERM received -- requesting stop after current tick...");
    ic.stopAfterTick();
  };

  process.on("SIGINT", handleSIGINT);
  process.on("SIGTERM", handleSIGTERM);
}

// Terminal Focus Awareness
const terminalFocusListeners: ((focused: boolean) => void)[] = [];
let terminalFocused = true;

/**
 * Register a listener for terminal focus changes.
 */
export function onFocusChange(listener: (focused: boolean) => void): void {
  terminalFocusListeners.push(listener);
}

/**
 * Set terminal focus state (call when terminal gains/loses focus).
 */
export function setTerminalFocus(focused: boolean): void {
  if (terminalFocused === focused) return;
  terminalFocused = focused;
  for (const listener of terminalFocusListeners) {
    listener(focused);
  }
}

/**
 * Check if terminal is focused.
 */
export function isTerminalFocused(): boolean {
  return terminalFocused;
}

/**
 * Returns true if the autonomous loop should pause due to terminal unfocus.
 */
export function shouldPauseAutonomous(): boolean {
  return !terminalFocused;
}

// Tick Monitor
export interface TickMonitor {
  ticks: number;
  startTime: number;
  lastTickTime: number;
  isPaused: boolean;
  pauseReason: string | null;
}

/**
 * Create a tick monitor to track autonomous loop progress.
 */
export function createTickMonitor(): TickMonitor {
  return {
    ticks: 0,
    startTime: Date.now(),
    lastTickTime: Date.now(),
    isPaused: false,
    pauseReason: null,
  };
}

/**
 * Format tick monitor stats as a string.
 */
export function formatTickMonitor(m: TickMonitor): string {
  const elapsed = ((Date.now() - m.startTime) / 1000).toFixed(1);
  const paused = m.isPaused ? " [PAUSED: " + m.pauseReason + "]" : "";
  return "ticks=" + m.ticks + " elapsed=" + elapsed + "s" + paused;
}

/**
 * Wait for a tick interval with interrupt checking.
 * Returns false if interrupted, true if the full interval elapsed.
 */
export async function waitForTickInterval(
  intervalMs: number,
  shouldStop: () => boolean,
  shouldStopNow: () => boolean,
): Promise<boolean> {
  const step = Math.min(intervalMs, 500);
  let elapsed = 0;

  while (elapsed < intervalMs) {
    if (shouldStopNow()) return false;
    if (shouldStop() && elapsed >= Math.min(step * 2, intervalMs)) return false;
    await new Promise((r) => setTimeout(r, step));
    elapsed += step;
  }

  return true;
}

// Auto Mode Config
export interface AutoModeConfig {
  tickMode?: boolean;
  tickInterval?: number;
  confidenceThreshold?: number;
  ghostMode?: boolean;
  autoCommit?: boolean;
  autoPush?: boolean;
}

/**
 * Build options object for runAutoAgent from config.
 */
export function buildAutoAgentOptions(config: AutoModeConfig): Record<string, unknown> {
  return {
    tickMode: config.tickMode ?? false,
    tickInterval: config.tickInterval ?? 5000,
    confidenceThreshold: config.confidenceThreshold ?? 0.7,
    ghostMode: config.ghostMode ?? true,
    autoCommit: config.autoCommit ?? false,
    autoPush: config.autoPush ?? false,
  };
}