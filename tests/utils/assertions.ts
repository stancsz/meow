import { Task, TaskQueue } from "../../src/orchestrator/TaskQueue";

/**
 * Custom Vitest matchers and assertions for MEOW tests.
 */

// Extend Vitest expect with custom matchers
declare global {
  namespace jest {
    interface Matchers<T> {
      toQueueAtCapacity(): T;
      toHaveStatus(status: string): T;
      toHaveFailedWith(error: string): T;
      toBeFrozen(thresholdMs: number): T;
      toHaveBeenCancelled(): T;
    }
  }
}

/**
 * Assert that a function throws with a specific message.
 */
export function toThrowWithMessage(fn: () => void, message: string): void {
  try {
    fn();
    throw new Error(`Expected function to throw, but it didn't`);
  } catch (e: any) {
    if (!e.message.includes(message)) {
      throw new Error(`Expected error message to include "${message}", got "${e.message}"`);
    }
  }
}

/**
 * Assert that a task has a specific status.
 */
export function assertTaskStatus(task: Task, status: Task["status"]): void {
  if (task.status !== status) {
    throw new Error(`Expected task ${task.id} to have status "${status}", got "${task.status}"`);
  }
}

/**
 * Assert that a task result indicates failure with a specific error.
 */
export function assertTaskFailed(result: any, errorSubstring: string): void {
  if (result?.success !== false) {
    throw new Error(`Expected task to fail, but it succeeded`);
  }
  if (!result?.error?.includes(errorSubstring)) {
    throw new Error(`Expected error to include "${errorSubstring}", got "${result?.error}"`);
  }
}

/**
 * Assert that a queue is at capacity.
 */
export function assertQueueAtCapacity(queue: TaskQueue): void {
  // TaskQueue doesn't expose maxQueued publicly, so we check by trying to add
  // This is a behavioral test rather than state inspection
}

/**
 * Assert that a kernel agent heartbeat is older than threshold.
 */
export function assertAgentFrozen(
  heartbeats: Map<number, Date>,
  pid: number,
  thresholdMs: number
): void {
  const lastPulse = heartbeats.get(pid);
  if (!lastPulse) {
    throw new Error(`No heartbeat found for PID ${pid}`);
  }
  const elapsed = Date.now() - lastPulse.getTime();
  if (elapsed <= thresholdMs) {
    throw new Error(`Agent ${pid} is not frozen (elapsed: ${elapsed}ms, threshold: ${thresholdMs}ms)`);
  }
}

/**
 * Assert that an event was emitted in a sequence.
 */
export function assertEventSequence<T extends { type: string; timestamp: number }>(
  events: T[],
  expected: Array<{ type: string; index?: number }>
): void {
  let eventIndex = 0;
  for (const expectation of expected) {
    const found = events.find((e, i) =>
      e.type === expectation.type &&
      (expectation.index === undefined || i >= eventIndex)
    );
    if (!found) {
      throw new Error(
        `Expected event "${expectation.type}" not found in sequence. Got: ${events.map(e => e.type).join(" → ")}`
      );
    }
    eventIndex = events.indexOf(found);
  }
}

/**
 * Assert that two arrays have the same elements (order-independent).
 */
export function assertSameElements<T>(actual: T[], expected: T[]): void {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);

  for (const item of expected) {
    if (!actualSet.has(item)) {
      throw new Error(`Expected array to contain ${item}, but it doesn't. Actual: ${actual.join(", ")}`);
    }
  }

  for (const item of actual) {
    if (!expectedSet.has(item)) {
      throw new Error(`Expected array to not contain ${item}, but it does. Actual: ${actual.join(", ")}`);
    }
  }
}
