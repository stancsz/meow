/**
 * interrupt.ts
 *
 * Shared interrupt controller for the autonomous loop.
 * Single source of truth — imported by both auto-agent.ts and auto-mode.ts
 * to avoid circular dependencies.
 *
 * GAP-AUTO-01: Interrupt handling for the autonomous loop.
 */
export interface InterruptController {
  /** Set to true to request the loop stop after the current tick */
  stopAfterTick: () => void;
  /** Set to true to request immediate stop */
  stopNow: () => void;
  /** Returns true if stop has been requested */
  shouldStop: () => boolean;
  /** Returns true if immediate stop was requested */
  shouldStopNow: () => boolean;
  /** AbortController signal for LLM calls */
  signal: AbortSignal;
  /** Resume a stopped interrupt controller */
  reset: () => void;
}

export function createInterruptController(): InterruptController {
  let stopRequested = false;
  let stopNowRequested = false;
  const ac = new AbortController();

  return {
    stopAfterTick: () => { stopRequested = true; },
    stopNow: () => { stopNowRequested = true; ac.abort(); },
    shouldStop: () => stopRequested || stopNowRequested || ac.signal.aborted,
    shouldStopNow: () => stopNowRequested || ac.signal.aborted,
    get signal() { return ac.signal; },
    reset: () => {
      stopRequested = false;
      stopNowRequested = false;
    },
  };
}
