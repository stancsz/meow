export type FaultType =
  | "llm-timeout"
  | "llm-parse-error"
  | "agent-crash"
  | "db-busy"
  | "db-batch-fail"
  | "file-lock-conflict"
  | "process-spawn-fail"
  | "task-timeout"
  | "heartbeat-miss";

export interface FaultConfig {
  type: FaultType;
  probability?: number; // 0-1, default 1.0 (always inject)
  delay?: number; // ms before fault triggers
  count?: number; // max times fault triggers (default: infinite)
  errorMessage?: string; // custom error message
}

/**
 * Counter for tracking how many times a fault has been triggered.
 */
interface TriggerRecord {
  count: number;
  lastTriggered: number;
}

/**
 * FaultInjector enables chaos engineering-style fault injection.
 * Composable fault scenarios with probability-based injection.
 */
export class FaultInjector {
  private faults: FaultConfig[] = [];
  private triggers: Map<string, TriggerRecord> = new Map();

  /**
   * Add a fault configuration.
   */
  addFault(config: FaultConfig): void {
    this.faults.push({
      probability: config.probability ?? 1.0,
      delay: config.delay ?? 0,
      count: config.count ?? Infinity,
      ...config,
    });
  }

  /**
   * Check if a fault should be injected.
   */
  shouldInject(faultType: FaultType): boolean {
    const fault = this.faults.find(f => f.type === faultType);
    if (!fault) return false;

    const record = this.triggers.get(faultType) || { count: 0, lastTriggered: 0 };

    // Check count limit
    if (record.count >= (fault.count ?? Infinity)) {
      return false;
    }

    // Check probability
    if (fault.probability !== undefined && Math.random() > fault.probability) {
      return false;
    }

    return true;
  }

  /**
   * Record that a fault was triggered.
   */
  recordTrigger(faultType: FaultType): void {
    const record = this.triggers.get(faultType) || { count: 0, lastTriggered: 0 };
    record.count++;
    record.lastTriggered = Date.now();
    this.triggers.set(faultType, record);
  }

  /**
   * Get the number of times a fault has been triggered.
   */
  getTriggerCount(faultType: FaultType): number {
    return this.triggers.get(faultType)?.count ?? 0;
  }

  /**
   * Reset all fault triggers.
   */
  reset(): void {
    this.triggers.clear();
  }

  /**
   * Clear all faults.
   */
  clear(): void {
    this.faults = [];
    this.triggers.clear();
  }

  /**
   * Get all configured faults.
   */
  getFaults(): FaultConfig[] {
    return [...this.faults];
  }
}

// Preset fault configurations for common scenarios

export const QueueOverflowFault: FaultConfig = {
  type: "db-busy",
  count: 4,
  errorMessage: "SQLITE_BUSY",
};

export const LLMTimeoutFault: FaultConfig = {
  type: "llm-timeout",
  delay: 30000,
  errorMessage: "LLM request timed out",
};

export const AgentCrashFault: FaultConfig = {
  type: "agent-crash",
  probability: 1.0,
  errorMessage: "Agent process terminated unexpectedly",
};

export const DBBatchDropFault: FaultConfig = {
  type: "db-batch-fail",
  count: 4, // Matches maxRetries in kernel.ts
  errorMessage: "Kernel reached max retries",
};

export const TaskTimeoutFault: FaultConfig = {
  type: "task-timeout",
  delay: 100,
  errorMessage: "Task timed out",
};

export const HeartbeatMissFault: FaultConfig = {
  type: "heartbeat-miss",
  delay: 1200000 + 1, // 20 min + 1ms
  errorMessage: "Agent frozen - no heartbeat",
};

/**
 * Create a fault injector with common presets.
 */
export function createFaultInjector(...faults: FaultConfig[]): FaultInjector {
  const injector = new FaultInjector();
  faults.forEach(f => injector.addFault(f));
  return injector;
}
