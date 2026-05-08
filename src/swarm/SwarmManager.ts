/**
 * L3: THE SWARM (Execution Layer)
 *
 * Manages the pool of specialized agents (internal workers + external specialists).
 * Handles ephemeral session management and real-time telemetry.
 *
 * Key Responsibilities:
 * 1. Manage pool of specialized agents (Claude, Aider, BrowserOS)
 * 2. Implement ephemeral session management for specialists
 * 3. Add telemetry for worker performance and token usage
 * 4. Handle session heartbeats to monitor L3 workers in real-time
 */

import { exec } from "child_process";
import { Task, TaskResult, FileArtifact } from "../orchestrator/Task";
import { MeowKernel } from "../kernel/kernel";
import { Agent, AgentConfig } from "../agent/agent";
import { DatabasePort } from "../extensions/database/manifest";
import { McpManager } from "../agent/mcp";
import { SkillManager } from "../agent/skills";
import { SPECIALISTS, SummonContext, SummonResult, summonAsync } from "../agent/summoner";
import pc from "picocolors";

export type WorkerType = "claude" | "aider" | "opencode" | "browseros" | "qa";

export interface WorkerSession {
  sessionId: string;
  workerId: string;
  workerType: WorkerType;
  pid?: number;
  status: "initializing" | "running" | "completed" | "failed" | "timed_out";
  startedAt: number;
  lastPulse: number;
  goal: string;
  output?: string;
  exitCode?: number;
}

export interface SwarmConfig {
  maxConcurrentWorkers: number;
  sessionTimeoutMs: number;
  heartbeatIntervalMs: number;
  enableEphemeralSessions: boolean;
}

export interface WorkerMetrics {
  workerId: string;
  tasksCompleted: number;
  tasksFailed: number;
  totalTokens: number;
  averageTaskDurationMs: number;
  lastTaskAt?: number;
}

export interface DispatchResult {
  sessionId: string;
  success: boolean;
  output: string;
  durationMs: number;
  metrics?: WorkerMetrics;
}

/**
 * L3 SwarmManager: Manages ephemeral worker pool for parallel execution.
 *
 * Integrates with:
 * - L2 Architect: receives tasks and execution plans
 * - L4 Auditor: submits work for verification
 * - MeowKernel: registers missions, sends heartbeats
 */
export class SwarmManager {
  private kernel: MeowKernel;
  private db: DatabasePort;
  private config: Required<SwarmConfig>;
  private sessions: Map<string, WorkerSession> = new Map();
  private metrics: Map<string, WorkerMetrics> = new Map();
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();

  // Pre-configured agent templates for internal workers
  private agentTemplates: Map<WorkerType, Partial<AgentConfig>> = new Map();

  constructor(kernel: MeowKernel, db: DatabasePort, config?: Partial<SwarmConfig>) {
    this.kernel = kernel;
    this.db = db;

    this.config = {
      maxConcurrentWorkers: config?.maxConcurrentWorkers ?? 4,
      sessionTimeoutMs: config?.sessionTimeoutMs ?? 300000, // 5 minutes
      heartbeatIntervalMs: config?.heartbeatIntervalMs ?? 15000, // 15 seconds
      enableEphemeralSessions: config?.enableEphemeralSessions ?? true,
    };

    this.initializeAgentTemplates();
  }

  /**
   * Initialize pre-configured agent templates for each worker type.
   */
  private initializeAgentTemplates(): void {
    // Default templates - can be overridden via configureWorker
    this.agentTemplates.set("claude", {
      // Uses default model from config
    });

    this.agentTemplates.set("aider", {
      // Aider uses its own connection
    });

    this.agentTemplates.set("opencode", {
      // OpenCode uses its own connection
    });

    this.agentTemplates.set("browseros", {
      // BrowserOS managed externally
    });

    this.agentTemplates.set("qa", {
      // QA specialist uses Claude Code
    });
  }

  /**
   * Register a worker session and start heartbeat monitoring.
   */
  private registerSession(session: WorkerSession): void {
    this.sessions.set(session.sessionId, session);

    // Initialize metrics for this worker
    this.metrics.set(session.workerId, {
      workerId: session.workerId,
      tasksCompleted: 0,
      tasksFailed: 0,
      totalTokens: 0,
      averageTaskDurationMs: 0,
    });

    // Start heartbeat monitoring
    const interval = setInterval(() => {
      this.pulseSession(session.sessionId);
    }, this.config.heartbeatIntervalMs);

    this.heartbeatIntervals.set(session.sessionId, interval);

    console.log(pc.cyan(`[SWARM] Session ${session.sessionId} (${session.workerType}) registered`));
  }

  /**
   * Send a heartbeat pulse for a session.
   */
  private pulseSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.lastPulse = Date.now();

    if (session.pid) {
      this.kernel.pulse(session.pid, 50, `Swarm session active: ${session.goal.substring(0, 50)}`);
    }

    // Check for stale sessions
    const elapsed = Date.now() - session.lastPulse;
    if (elapsed > this.config.sessionTimeoutMs) {
      console.log(pc.yellow(`[SWARM] Session ${sessionId} is stale (${Math.round(elapsed / 1000)}s since last pulse)`));
    }
  }

  /**
   * Complete a session and clean up resources.
   */
  private completeSession(sessionId: string, status: WorkerSession["status"], output?: string, exitCode?: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = status;
    session.output = output;
    session.exitCode = exitCode;

    // Stop heartbeat monitoring
    const interval = this.heartbeatIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(sessionId);
    }

    // Update metrics
    const metrics = this.metrics.get(session.workerId);
    if (metrics) {
      if (status === "completed") {
        metrics.tasksCompleted++;
      } else {
        metrics.tasksFailed++;
      }
      metrics.lastTaskAt = Date.now();
    }

    // Update kernel mission status
    if (session.pid) {
      this.kernel.updateMissionPulse(session.pid, status);
    }

    console.log(pc.cyan(`[SWARM] Session ${sessionId} completed with status: ${status}`));
  }

  /**
   * Dispatch a task to the swarm for execution.
   * Can use internal workers or external specialists.
   */
  public async dispatch(
    tasks: Task[],
    options?: {
      workerType?: WorkerType;
      files?: string[];
      kernel?: MeowKernel;
      monolithBlueprint?: string;
    }
  ): Promise<DispatchResult[]> {
    const workerType = options?.workerType || "claude";
    const results: DispatchResult[] = [];

    console.log(pc.cyan(`\n🐝 [SWARM] Dispatching ${tasks.length} task(s) to ${workerType} workers`));

    // Execute tasks in parallel (respecting max concurrent workers)
    let dispatched = 0;
    const executing: Promise<DispatchResult>[] = [];

    for (const task of tasks) {
      // Wait if we've reached max concurrent workers
      while (executing.length >= this.config.maxConcurrentWorkers) {
        const completed = await Promise.race(executing.map((p, i) => p.then(() => i)));
        const finished = executing.splice(Number(completed), 1)[0];
      }

      const promise = this.executeTask(task, workerType, options);
      executing.push(promise);

      promise.then(result => {
        results.push(result);
        dispatched++;
      });
    }

    // Wait for all to complete
    await Promise.allSettled(executing);

    console.log(pc.green(`[SWARM] All ${tasks.length} tasks dispatched. Results:`));
    results.forEach((r, i) => {
      const icon = r.success ? "✅" : "❌";
      console.log(pc.dim(`  ${icon} Task ${i + 1}: ${r.success ? "SUCCESS" : "FAILED"} (${r.durationMs}ms)`));
    });

    return results;
  }

  /**
   * Execute a single task using an external specialist.
   */
  private async executeTask(
    task: Task,
    workerType: WorkerType,
    options?: {
      files?: string[];
      kernel?: MeowKernel;
      monolithBlueprint?: string;
    }
  ): Promise<DispatchResult> {
    const startTime = Date.now();
    const sessionId = `swarm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Create session
    const session: WorkerSession = {
      sessionId,
      workerId: `worker_${workerType}_${Date.now()}`,
      workerType,
      status: "initializing",
      startedAt: Date.now(),
      lastPulse: Date.now(),
      goal: task.description,
    };

    this.registerSession(session);

    try {
      const context: SummonContext = {
        goal: task.description,
        files: options?.files || task.requiredFiles || [],
        kernel: options?.kernel || this.kernel,
        monolithBlueprint: options?.monolithBlueprint,
      };

      const result = await summonAsync(workerType as any, context);

      const durationMs = Date.now() - startTime;

      if (result.success) {
        this.completeSession(sessionId, "completed", result.output, result.exitCode);
      } else {
        this.completeSession(sessionId, "failed", result.output, result.exitCode);
      }

      return {
        sessionId,
        success: result.success,
        output: result.output,
        durationMs,
        metrics: this.metrics.get(session.workerId),
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      this.completeSession(sessionId, "failed", error.message);

      return {
        sessionId,
        success: false,
        output: error.message,
        durationMs,
      };
    }
  }

  /**
   * Dispatch a task to an internal agent worker (in-process execution).
   */
  public async dispatchToWorker(
    task: Task,
    agentConfig: AgentConfig
  ): Promise<DispatchResult> {
    const startTime = Date.now();
    const sessionId = `internal_${Date.now()}`;

    const session: WorkerSession = {
      sessionId,
      workerId: `internal_worker`,
      workerType: "claude",
      status: "running",
      startedAt: Date.now(),
      lastPulse: Date.now(),
      goal: task.description,
    };

    this.registerSession(session);

    try {
      const agent = new Agent({
        ...agentConfig,
        kernel: this.kernel,
        db: this.db,
      });

      const output = await agent.chat(task.description);

      const durationMs = Date.now() - startTime;
      this.completeSession(sessionId, "completed", output);

      return {
        sessionId,
        success: true,
        output,
        durationMs,
        metrics: this.metrics.get(session.workerId),
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      this.completeSession(sessionId, "failed", error.message);

      return {
        sessionId,
        success: false,
        output: error.message,
        durationMs,
      };
    }
  }

  /**
   * Get all active sessions.
   */
  public getActiveSessions(): WorkerSession[] {
    return Array.from(this.sessions.values()).filter(
      s => s.status === "running" || s.status === "initializing"
    );
  }

  /**
   * Get all sessions.
   */
  public getAllSessions(): WorkerSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get metrics for all workers.
   */
  public getMetrics(): WorkerMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get a specific session.
   */
  public getSession(sessionId: string): WorkerSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Abort a running session.
   */
  public abortSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (session.pid) {
      try {
        if (process.platform === "win32") {
          exec(`taskkill /F /PID ${session.pid}`);
        } else {
          exec(`kill -9 ${session.pid}`);
        }
      } catch {
        // Process may have already exited
      }
    }

    this.completeSession(sessionId, "timed_out", "Manually aborted");
    return true;
  }

  /**
   * Abort all running sessions.
   */
  public abortAllSessions(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.status === "running" || session.status === "initializing") {
        this.abortSession(session.sessionId);
        count++;
      }
    }
    return count;
  }

  /**
   * Get swarm status summary.
   */
  public getStatus(): {
    activeSessions: number;
    totalSessions: number;
    completedTasks: number;
    failedTasks: number;
    workers: WorkerMetrics[];
  } {
    const sessions = this.getAllSessions();
    const metrics = this.getMetrics();

    return {
      activeSessions: this.getActiveSessions().length,
      totalSessions: sessions.length,
      completedTasks: metrics.reduce((sum, m) => sum + m.tasksCompleted, 0),
      failedTasks: metrics.reduce((sum, m) => sum + m.tasksFailed, 0),
      workers: metrics,
    };
  }

  /**
   * Graceful shutdown - abort all sessions and clean up.
   */
  public async shutdown(): Promise<void> {
    console.log(pc.yellow("[SWARM] Shutting down..."));

    // Abort all active sessions
    const aborted = this.abortAllSessions();
    if (aborted > 0) {
      console.log(pc.dim(`[SWARM] Aborted ${aborted} active session(s)`));
    }

    // Clear all heartbeat intervals
    for (const interval of this.heartbeatIntervals.values()) {
      clearInterval(interval);
    }
    this.heartbeatIntervals.clear();

    // Clear sessions
    this.sessions.clear();

    console.log(pc.green("[SWARM] Shutdown complete"));
  }
}
