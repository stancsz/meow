import { vi } from "vitest";

/**
 * Control fake timers for time-sensitive tests.
 * Use as() wrapper for vitest's act() equivalent.
 */
export function useFakeTimers() {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
}

/**
 * Advance timer by ms milliseconds.
 * Wraps vi.advanceTimersByTime with act() equivalent.
 */
export function advanceTime(ms: number) {
  vi.advanceTimersByTime(ms);
}

/**
 * Advance to just past the frozen threshold (20 min + 1ms).
 * Only use if frozenThresholdMs is at default 1200000 (20 min).
 */
export function toFrozenThreshold() {
  vi.advanceTimersByTime(20 * 60 * 1000 + 1);
}

/**
 * Advance to a specific time past threshold.
 * @param thresholdMs - threshold in ms
 * @param additionalMs - additional time beyond threshold
 */
export function pastThreshold(thresholdMs: number, additionalMs: number = 1) {
  vi.advanceTimersByTime(thresholdMs + additionalMs);
}

/**
 * Run all pending timers and promises.
 */
export function flushTimers() {
  vi.runAllTimers();
}

/**
 * Run only pending timers (not promises).
 */
export function runPendingTimers() {
  vi.runOnlyPendingTimers();
}

/**
 * Get the current fake time.
 */
export function getFakeTime() {
  return vi.getRealTime();
}

/**
 * Set fake time to a specific Date.
 */
export function setFakeTime(date: Date) {
  vi.setSystemTime(date);
}

/**
 * Advance time by a human-readable duration string.
 * @param duration - string like "30s", "5m", "1h"
 */
export function advanceTimeByDuration(duration: string) {
  const match = duration.match(/^(\d+)(s|m|h)$/);
  if (!match) {
    throw new Error(`Invalid duration: ${duration}. Use format like "30s", "5m", "1h"`);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const ms = unit === "s" ? value * 1000 : unit === "m" ? value * 60 * 1000 : value * 60 * 60 * 1000;
  vi.advanceTimersByTime(ms);
}
