import { DatabasePort } from "../extensions/database/manifest";
import Database from "better-sqlite3";
import pc from "picocolors";
import fs from "fs";
import path from "path";

export type KernelAction =
  | { type: "SET_STATE"; key: string; value: any }
  | { type: "STORE_VECTOR"; content: string; embedding: number[]; metadata: any }
  | { type: "DELETE_STATE"; key: string };

export class MeowKernel {
  private db: DatabasePort;
  private queue: KernelAction[] = [];
  private isProcessing: boolean = false;
  private drainInterval: number = 100; // ms
  private batchSize: number = 50;
  private maxRetries: number = 3;
  private monolithEntanglement: Map<number, number[]> = new Map(); // Spooky Action tracking
  private agentHeartbeats: Map<number, Date> = new Map(); // Agent heartbeat tracking
  private agentProgress: Map<number, { score: number, lastChange: Date, summary: string }> = new Map();
  private watchdogInterval: number = 60000; // 60 seconds
  private frozenThresholdMs: number = 1200000; // 20 minutes
  private driftThresholdMs: number = 600000; // 10 minutes - warning if no progress change
  private respawnCallbacks: Array<(oldPid: number, newPid: number) => void> = [];
  private exitHandler: (() => Promise<void>) | null = null;

  constructor(db: DatabasePort) {
    // If a raw better-sqlite3 Database is passed instead of a DatabasePort,
    // wrap it in a thin adapter so kernel methods that call db.execute()
    // continue to work (meow kernels that were passed a raw Database.Database
    // from test fixtures or direct instantiation).
    if (typeof (db as any).prepare === "function" && typeof (db as any).exec === "function") {
      const rawDb = db as unknown as Database.Database;
      this.db = {
        query: async <T = any>(sql: string, params?: any[]): Promise<T[]> => {
          const stmt = rawDb.prepare(sql);
          return stmt.all(...(params ?? [])) as T[];
        },
        execute: async (sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid: number }> => {
          const stmt = rawDb.prepare(sql);
          const result = stmt.run(...(params ?? []));
          return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) };
        },
        exec: async (sql: string): Promise<{ done: boolean }> => {
          rawDb.exec(sql);
          return { done: true };
        },
        batch: async (actions: any[]): Promise<{ processed: number; errors: string[] }> => {
          const errors: string[] = [];
          const tx = rawDb.transaction(() => {
            for (const action of actions) {
              try {
                if (action.type === "SET_STATE") {
                  rawDb.prepare(
                    `INSERT OR REPLACE INTO swarm_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`
                  ).run(action.key, JSON.stringify(action.value));
                } else if (action.type === "DELETE_STATE") {
                  rawDb.prepare("DELETE FROM swarm_state WHERE key = ?").run(action.key);
                }
              } catch (e: any) {
                errors.push(`${action.type}: ${e.message}`);
              }
            }
          });
          tx();
          return { processed: actions.length, errors };
        },
        close: async (): Promise<void> => { rawDb.close(); },
        loadExtension: async (_path: string): Promise<void> => { rawDb.loadExtension(_path); },
      } as DatabasePort;
    } else {
      this.db = db;
    }
    this.setupLogDirectory();
    this.setupExitHandlers();
  }

  private setupLogDirectory() {
    const logDir = path.join(process.cwd(), ".meow", "logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    this.logDir = logDir;
    this.logFile = path.join(logDir, `meow-${new Date().toISOString().split('T')[0]}.log`);
    this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
    this.log(pc.cyan("🚀 Meow Kernel initialized"), "KERNEL");
  }

  private logDir: string = "";
  private logFile: string = "";
  private logStream: fs.WriteStream | null = null;

  private _log(level: string, source: string, message: string) {
    const timestamp = new Date().toISOString();
    const entry = `${timestamp} [${level}] [${source}] ${message}\n`;
    this.logStream?.write(entry);
    // Also echo to stdout for immediate feedback
    if (level === "ERROR" || level === "WARN") {
      console.error(entry.trim());
    }
  }

  public log(message: string, source: string = "KERNEL") {
    this._log("INFO", source, message);
  }

  /**
   * Register a callback to be notified when an agent is respawned.
   * This allows the ParallelExecutor to update its PID mapping.
   */
  public onRespawn(callback: (oldPid: number, newPid: number) => void): void {
    this.respawnCallbacks.push(callback);
  }

  public warn(message: string, source: string = "KERNEL") {
    this._log("WARN", source, message);
  }

  public error(message: string, source: string = "KERNEL") {
    this._log("ERROR", source, message);
  }

  /**
   * Non-blocking push of telemetry/vectors/state deltas (MPSC)
   */
  public push(action: KernelAction) {
    this.queue.push(action);
    // Trigger drain if not already processing
    if (!this.isProcessing && this.queue.length >= this.batchSize) {
      this.drain();
    }
  }

  /**
   * The Supervisor Main Loop
   */
  public start() {
    this.log("Starting watchdog monitor...", "KERNEL");
    setInterval(() => {
      if (this.queue.length > 0 && !this.isProcessing) {
        this.drain();
      }
      this.monitorTTL();
      this.watchdogCheck();
    }, this.drainInterval);
  }

  /**
   * Agent heartbeat - agents should call this periodically to show they're alive
   */
  public async pulse(pid: number, progressScore?: number, progressSummary?: string) {
    this.agentHeartbeats.set(pid, new Date());
    
    if (progressScore !== undefined) {
      const current = this.agentProgress.get(pid);
      if (!current || current.score !== progressScore) {
        this.agentProgress.set(pid, { 
          score: progressScore, 
          lastChange: new Date(),
          summary: progressSummary || ""
        });
      }
    }
    
    await this.updateMissionPulse(pid, "running", progressScore, progressSummary);
  }

  /**
   * Watchdog: Detect frozen/stuck agents and trigger respawn
   */
  private watchdogCheck() {
    const now = new Date();
    for (const [pid, lastPulse] of this.agentHeartbeats.entries()) {
      const elapsed = now.getTime() - lastPulse.getTime();
      
      // 1. Frozen Detection (Hard failure)
      if (elapsed > this.frozenThresholdMs) {
        this.warn(`Agent ${pid} frozen for ${Math.round(elapsed/60000)}min. Triggering respawn...`, "WATCHDOG");
        this.respawnAgent(pid);
        continue;
      }

      // 2. Drift Detection (Semantic warning)
      const progress = this.agentProgress.get(pid);
      if (progress) {
        const driftTime = now.getTime() - progress.lastChange.getTime();
        if (driftTime > this.driftThresholdMs) {
          this.warn(`Agent ${pid} showing Zero Velocity (No progress change for ${Math.round(driftTime/60000)}min). Potential drift detected.`, "WATCHDOG");
          // TODO: In production, trigger a Strategy Pivot signal to the agent
        }
      }
    }
  }

  /**
   * Respawn a frozen agent
   */
  private async respawnAgent(pid: number) {
    // Get the frozen agent's mission info
    const missions = await this.db.query<{ agent_name: string; goal: string }>(
      `SELECT agent_name, goal FROM missions WHERE pid = ?`,
      [pid]
    );
    const mission = missions[0];

    if (!mission) {
      console.error(`🚨 [WATCHDOG] Cannot respawn PID ${pid} - no mission record found`);
      return;
    }

    // Mark old mission as failed
    await this.db.execute(
      `UPDATE missions SET status = 'failed_frozen' WHERE pid = ?`,
      [pid]
    );

    // Remove from heartbeat tracking
    this.agentHeartbeats.delete(pid);

    // Spawn replacement agent
    console.log(pc.cyan(`🔄 [WATCHDOG] Respawning agent for mission: ${mission.goal}`));

    // Fork a new meow process
    const { spawn } = require('child_process');
    const shell = process.platform === 'win32';
    const isBun = typeof (globalThis as any).Bun !== "undefined";
    
    let spawnCmd: string;
    let spawnArgs: string[];

    if (isBun) {
      spawnCmd = shell ? 'bun.exe' : 'bun';
      spawnArgs = ['src/index.ts'];
    } else {
      spawnCmd = shell ? 'npx.cmd' : 'npx';
      spawnArgs = ['tsx', 'src/index.ts'];
    }

    const newPid = spawn(spawnCmd, spawnArgs, {
      cwd: process.cwd(),
      detached: true,
      stdio: 'inherit'
    }).pid;

    // Register new mission
    await this.registerMission(newPid, mission.agent_name, mission.goal);
    console.log(pc.green(`✅ [WATCHDOG] Respawned agent with new PID ${newPid}`));

    // Notify listeners of PID change
    for (const cb of this.respawnCallbacks) {
      cb(pid, newPid!);
    }
  }

  /**
   * Sole Queue Consumer: Serial Batched INSERT/UPDATE
   * Reduces disk I/O and eliminates SQLITE_BUSY locks.
   */
  private async drain() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const batch = this.queue.splice(0, this.batchSize);
    let attempt = 0;
    let success = false;

    while (attempt < this.maxRetries && !success) {
      try {
        // 1. Process interference actions before persistence (Spooky Action Propagation)
        for (const action of batch) {
          if (action.type === "SET_STATE" && action.key.startsWith("interference_")) {
            const partnerPid = parseInt(action.key.split("_")[1]);
            const interference = action.value;
            this.log(`🌌 [SPOOKY ACTION] Mission ${interference.sourcePid} collapsed. Interfering with Partner ${partnerPid} (Shift: ${interference.shift})`, "KERNEL");
            
            // In a real quantum system, this would shift the phase of the partner's reasoning loop
            // Here we update the progress summary to reflect the entanglement state
            const progress = this.agentProgress.get(partnerPid);
            if (progress) {
              progress.summary += ` | [Entangled Interference from ${interference.sourcePid}]`;
            }
          }
        }

        // 2. Use batch RPC to process all actions in one round-trip
        const result = await this.db.batch(batch);
        if (result.errors.length > 0) {
          console.error("Kernel drain errors:", result.errors);
        }
        success = true;
      } catch (e) {
        attempt++;
        console.error(`Kernel drain attempt ${attempt} failed:`, e);
        if (attempt >= this.maxRetries) {
          console.error("🚨 Kernel reached max retries. Dropping batch to prevent deadlock.");
        } else {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 50 * attempt));
        }
      }
    }

    this.isProcessing = false;
  }

  public async updateMissionPulse(pid: number, status: string = "running", progressScore: number = 0, progressSummary?: string) {
    this.push({ type: "SET_STATE", key: `mission_${pid}`, value: {
      pid,
      status,
      progress_score: progressScore,
      progress_summary: progressSummary,
      last_pulse: new Date().toISOString()
    }});
    
    // Also update the persistent missions table
    await this.db.execute(
      `UPDATE missions
      SET last_pulse = CURRENT_TIMESTAMP, 
          status = ?, 
          progress_score = ?, 
          progress_summary = ?
      WHERE pid = ?`,
      [status, progressScore, progressSummary || null, pid]
    );

    // Spooky Action at a Distance: Entanglement Propagation
    const entangled = this.monolithEntanglement.get(pid);
    if (entangled && (status === "completed" || status === "failed")) {
      entangled.forEach(partnerPid => {
        console.log(pc.magenta(`\n🌌 [SPOOKY ACTION] Mission ${pid} collapsed to ${status}. Propagating interference to Partner ${partnerPid}...`));
        // Push an interference state to the partner's Hamiltonian logic
        this.push({ type: "SET_STATE", key: `interference_${partnerPid}`, value: {
          sourcePid: pid,
          sourceStatus: status,
          shift: status === "completed" ? 0.2 : -0.2 // Constructive or Destructive interference
        }});
      });
    }
  }

  public async registerMission(pid: number, agentName: string, goal: string, entangledWith?: number[]) {
    await this.db.execute(
      `INSERT INTO missions (pid, agent_name, goal, status)
       VALUES (?, ?, ?, 'running')`,
      [pid, agentName, goal]
    );

    if (entangledWith && entangledWith.length > 0) {
      this.monolithEntanglement.set(pid, entangledWith);
      // Ensure reciprocal entanglement (Bell State)
      entangledWith.forEach(p => {
        const existing = this.monolithEntanglement.get(p) || [];
        this.monolithEntanglement.set(p, [...existing, pid]);
      });
    }

    this.push({ type: "SET_STATE", key: `mission_${pid}`, value: {
      pid,
      agent_name: agentName,
      goal,
      status: "running",
      created_at: new Date().toISOString(),
      entangled: !!entangledWith
    }});
  }

  /**
   * Graceful Shutdown: Ensure data is persisted
   */
  public async shutdown() {
    console.log("\n🛑 Meow Kernel shutting down safely...");
    
    // Final drain
    while (this.queue.length > 0) {
      await this.drain();
    }
    
    await this.db.close();
    console.log("✓ Database handles released. Pulse stopped.");
  }

  private setupExitHandlers() {
    const handleExit = async () => {
      await this.shutdown();
      process.exit(0);
    };

    process.on("SIGINT", handleExit);
    process.on("SIGTERM", handleExit);
  }

  private monitorTTL() {
    // Action: Sole TTL Monitor
    // For example, clearing old telemetry or ephemeral states
    // this.db.getRawDb().prepare("DELETE FROM swarm_state WHERE updated_at < ...").run();
  }

  public resolveDeadlock() {
    // Action: Deadlock Resolver
    // Logic to clear stuck agent states or reset locks
  }
}
