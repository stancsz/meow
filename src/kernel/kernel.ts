import { MeowDatabase } from "./database";
import pc from "picocolors";

export type KernelAction = 
  | { type: "SET_STATE"; key: string; value: any }
  | { type: "STORE_VECTOR"; content: string; embedding: number[]; metadata: any }
  | { type: "DELETE_STATE"; key: string };

export class MeowKernel {
  private db: MeowDatabase;
  private queue: KernelAction[] = [];
  private isProcessing: boolean = false;
  private drainInterval: number = 100; // ms
  private batchSize: number = 50;
  private maxRetries: number = 3;
  private monolithEntanglement: Map<number, number[]> = new Map(); // Spooky Action tracking

  constructor(db: MeowDatabase) {
    this.db = db;
    this.setupExitHandlers();
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
    console.log("🚀 Meow Kernel active. Monitoring synchronization points...");
    setInterval(() => {
      if (this.queue.length > 0 && !this.isProcessing) {
        this.drain();
      }
      this.monitorTTL();
    }, this.drainInterval);
  }

  /**
   * Sole Queue Consumer: Serial Batched INSERT/UPDATE
   * Reduces disk I/O and eliminates SQLITE_BUSY locks.
   */
  private async drain() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const batch = this.queue.splice(0, this.batchSize);
    const rawDb = this.db.getRawDb();
    let attempt = 0;
    let success = false;

    while (attempt < this.maxRetries && !success) {
      try {
        const transaction = rawDb.transaction((actions: KernelAction[]) => {
          for (const action of actions) {
            switch (action.type) {
              case "SET_STATE":
                rawDb.prepare(`
                  INSERT INTO swarm_state (key, value, updated_at) 
                  VALUES (?, ?, CURRENT_TIMESTAMP)
                  ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP
                `).run(action.key, JSON.stringify(action.value));
                break;
              case "DELETE_STATE":
                rawDb.prepare("DELETE FROM swarm_state WHERE key = ?").run(action.key);
                break;
              case "STORE_VECTOR":
                const result = rawDb.prepare(`
                  INSERT INTO vector_memory_data (content, metadata) VALUES (?, ?)
                `).run(action.content, JSON.stringify(action.metadata));
                
                const lastId = result.lastInsertRowid;
                rawDb.prepare(`
                  INSERT INTO vec_memory (rowid, embedding) VALUES (CAST(? AS INTEGER), ?)
                `).run(lastId, new Float32Array(action.embedding));
                break;
            }
          }
        });

        transaction(batch);
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

  public updateMissionPulse(pid: number, status: string = "running") {
    this.push({ type: "SET_STATE", key: `mission_${pid}`, value: {
      pid,
      status,
      last_pulse: new Date().toISOString()
    }});
    
    // Also update the persistent missions table
    this.db.getRawDb().prepare(`
      UPDATE missions 
      SET last_pulse = CURRENT_TIMESTAMP, status = ? 
      WHERE pid = ?
    `).run(status, pid);

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

  public registerMission(pid: number, agentName: string, goal: string, entangledWith?: number[]) {
    this.db.getRawDb().prepare(`
      INSERT INTO missions (pid, agent_name, goal, status)
      VALUES (?, ?, ?, 'running')
    `).run(pid, agentName, goal);

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
    
    this.db.close();
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
