import { DatabasePort } from "../extensions/database/manifest";
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
  private watchdogInterval: number = 60000; // 60 seconds
  private frozenThresholdMs: number = 1200000; // 20 minutes - agent considered frozen if no heartbeat

  constructor(db: DatabasePort) {
    this.db = db;
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
  public async pulse(pid: number) {
    this.agentHeartbeats.set(pid, new Date());
    await this.updateMissionPulse(pid, "running");
  }

  /**
   * Watchdog: Detect frozen/stuck agents and trigger respawn
   */
  private watchdogCheck() {
    const now = new Date();
    for (const [pid, lastPulse] of this.agentHeartbeats.entries()) {
      const elapsed = now.getTime() - lastPulse.getTime();
      if (elapsed > this.frozenThresholdMs) {
        console.warn(pc.yellow(`\n⚠️ [WATCHDOG] Agent ${pid} frozen for ${Math.round(elapsed/60000)}min. Triggering respawn...`));
        this.respawnAgent(pid);
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
        // Use batch RPC to process all actions in one round-trip
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

  public async updateMissionPulse(pid: number, status: string = "running") {
    this.push({ type: "SET_STATE", key: `mission_${pid}`, value: {
      pid,
      status,
      last_pulse: new Date().toISOString()
    }});
    
    // Also update the persistent missions table
    await this.db.execute(
      `UPDATE missions
      SET last_pulse = CURRENT_TIMESTAMP, status = ?
      WHERE pid = ?`,
      [status, pid]
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
