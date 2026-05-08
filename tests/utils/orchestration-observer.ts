import { EventEmitter } from "events";
import type { Orchestrator, StatusUpdate } from "../../src/orchestrator/Orchestrator";

export type OrchestrationEventType =
  | "taskStart"
  | "taskComplete"
  | "taskFail"
  | "taskCancel"
  | "fileConflict"
  | "queueFull"
  | "workerRegistered"
  | "decompositionComplete"
  | "aggregationComplete"
  | "statusUpdate";

export interface OrchestrationEvent {
  type: OrchestrationEventType;
  taskId?: string;
  timestamp: number;
  data?: Record<string, any>;
}

/**
 * OrchestrationObserver replaces stub emitters in Orchestrator with real event collection.
 * Use attachTo() to wire up an observer to an Orchestrator instance.
 */
export class OrchestrationObserver {
  private events: OrchestrationEvent[] = [];
  private emitter: EventEmitter;
  private originalMethods: Map<string, Function> = new Map();

  constructor() {
    this.emitter = new EventEmitter();
  }

  /**
   * Attach observer to an Orchestrator instance.
   * Replaces stub methods with real event emitters.
   */
  attachTo(orchestrator: Orchestrator): void {
    // Capture emitTaskStart
    const origEmitTaskStart = (orchestrator as any).emitTaskStart;
    if (origEmitTaskStart) {
      this.originalMethods.set("emitTaskStart", origEmitTaskStart);
      (orchestrator as any).emitTaskStart = (taskId: string, description: string) => {
        this.record({
          type: "taskStart",
          taskId,
          data: { description },
        });
        return origEmitTaskStart.call(orchestrator, taskId, description);
      };
    }

    // Capture emitTaskComplete
    const origEmitTaskComplete = (orchestrator as any).emitTaskComplete;
    if (origEmitTaskComplete) {
      this.originalMethods.set("emitTaskComplete", origEmitTaskComplete);
      (orchestrator as any).emitTaskComplete = (taskId: string, success: boolean) => {
        this.record({
          type: success ? "taskComplete" : "taskFail",
          taskId,
          data: { success },
        });
        return origEmitTaskComplete.call(orchestrator, taskId, success);
      };
    }

    // Also capture onStatus updates from execute()
    // The orchestrator uses onStatus callback internally, we can hook into it
    const origExecute = orchestrator.execute.bind(orchestrator);
    (orchestrator as any).execute = async (request: string, options?: any) => {
      const origOnStatus = options?.onStatus;
      options.onStatus = (update: StatusUpdate) => {
        this.record({
          type: "statusUpdate",
          data: { update },
        });
        origOnStatus?.(update);
      };
      return origExecute(request, options);
    };
  };

  /**
   * Detach observer from orchestrator, restoring original methods.
   */
  detach(orchestrator: Orchestrator): void {
    const emitTaskStart = (orchestrator as any).emitTaskStart;
    if (emitTaskStart && this.originalMethods.has("emitTaskStart")) {
      (orchestrator as any).emitTaskStart = this.originalMethods.get("emitTaskStart");
    }

    const emitTaskComplete = (orchestrator as any).emitTaskComplete;
    if (emitTaskComplete && this.originalMethods.has("emitTaskComplete")) {
      (orchestrator as any).emitTaskComplete = this.originalMethods.get("emitTaskComplete");
    }

    this.originalMethods.clear();
  }

  /**
   * Record an event.
   */
  private record(event: OrchestrationEvent): void {
    event.timestamp = Date.now();
    this.events.push(event);
  }

  /**
   * Get all recorded events.
   */
  getEvents(): OrchestrationEvent[] {
    return [...this.events];
  }

  /**
   * Get events filtered by type.
   */
  getEventsByType(type: OrchestrationEventType): OrchestrationEvent[] {
    return this.events.filter(e => e.type === type);
  }

  /**
   * Get events for a specific task.
   */
  getEventsForTask(taskId: string): OrchestrationEvent[] {
    return this.events.filter(e => e.taskId === taskId);
  }

  /**
   * Clear all recorded events.
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Assert that events occurred in a specific sequence.
   */
  assertSequence(expected: Array<{ type: OrchestrationEventType; index?: number }>): void {
    let eventIndex = 0;
    for (const expectation of expected) {
      const found = this.events.find((e, i) =>
        e.type === expectation.type &&
        (expectation.index === undefined || i >= eventIndex)
      );
      if (!found) {
        const actual = this.events.map(e => e.type).join(" → ");
        throw new Error(
          `Expected event "${expectation.type}" not found in sequence. Got: ${actual}`
        );
      }
      eventIndex = this.events.indexOf(found);
    }
  }

  /**
   * Assert that a specific event occurred at least once.
   */
  assertOccurred(type: OrchestrationEventType, message?: string): void {
    const found = this.events.some(e => e.type === type);
    if (!found) {
      const actual = this.events.map(e => e.type).join(", ");
      throw new Error(
        message ||
        `Expected event "${type}" to have occurred. Got: ${actual}`
      );
    }
  }

  /**
   * Assert that a specific event never occurred.
   */
  assertNeverOccurred(type: OrchestrationEventType): void {
    const found = this.events.some(e => e.type === type);
    if (found) {
      const actual = this.events.map(e => e.type).join(", ");
      throw new Error(
        `Expected event "${type}" to never have occurred. Got: ${actual}`
      );
    }
  }

  /**
   * Get the number of events recorded.
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * Get a summary of event counts by type.
   */
  getEventSummary(): Record<OrchestrationEventType, number> {
    const summary: Record<OrchestrationEventType, number> = {
      taskStart: 0,
      taskComplete: 0,
      taskFail: 0,
      taskCancel: 0,
      fileConflict: 0,
      queueFull: 0,
      workerRegistered: 0,
      decompositionComplete: 0,
      aggregationComplete: 0,
      statusUpdate: 0,
    };
    for (const event of this.events) {
      summary[event.type]++;
    }
    return summary;
  }
}

/**
 * Create a new observer attached to an orchestrator.
 */
export function observeOrchestrator(orchestrator: Orchestrator): OrchestrationObserver {
  const observer = new OrchestrationObserver();
  observer.attachTo(orchestrator);
  return observer;
}
