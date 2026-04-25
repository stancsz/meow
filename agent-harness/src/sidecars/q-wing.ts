/**
 * q-wing.ts — Parallel Mission Wings (720p Core)
 * 
 * Implements the quantum leap from sequential to parallel exploration.
 * Multiple "wings" can explore different solution paths concurrently.
 * 
 * EPOCH 720p: From single-threaded to multi-wing parallelism
 */

import { spawn, ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

// ============================================================================
// Types
// ============================================================================

export interface WingState {
  id: string;
  name: string;
  job: string;
  prompt: string;
  status: "spawning" | "exploring" | "converging" | "complete" | "failed";
  startedAt: number;
  lastHeartbeat: number;
  probability: number;        // Quantum probability of success
  interferenceWarnings: string[];
  findings: WingFinding[];
  parentWing?: string;
  childWings: string[];
  entanglementMatrix: Record<string, number>;
}

export interface WingFinding {
  timestamp: number;
  type: "fact" | "preference" | "lesson" | "breakthrough";
  content: string;
  confidence: number;
  verified: boolean;
}

export interface WingSnapshot {
  timestamp: number;
  activeWings: string[];
  completedWings: WingFinding[];
  interferenceDetected: boolean;
  convergedPaths: string[];
  recommendations: string[];
}

export interface ParallelDecision {
  action: "EXPAND" | "COLLAPSE" | "INTERFERE" | "CONVERGE";
  wings: string[];
  reason: string;
  confidence: number;
}

// ============================================================================
// Entanglement Matrix (Quantum State)
// ============================================================================

// Maps how changes to one component affect others
// Higher = more entangled = more risk of breaking something
const ENTANGLEMENT_MATRIX: Record<string, Record<string, number>> = {
  "Q1-Kernel": { "Q2-Tools": 0.9, "Q3-Skills": 0.85, "Q4-MCP": 0.6, "Q5-Evolve": 0.5, "Q6-Harness": 0.4 },
  "Q2-Tools": { "Q1-Kernel": 0.9, "Q3-Skills": 0.7, "Q4-MCP": 0.5, "Q5-Evolve": 0.3, "Q6-Harness": 0.6 },
  "Q3-Skills": { "Q1-Kernel": 0.85, "Q2-Tools": 0.7, "Q4-MCP": 0.4, "Q5-Evolve": 0.3, "Q6-Harness": 0.5 },
  "Q4-MCP": { "Q1-Kernel": 0.6, "Q2-Tools": 0.5, "Q3-Skills": 0.4, "Q5-Evolve": 0.7, "Q6-Harness": 0.3 },
  "Q5-Evolve": { "Q1-Kernel": 0.5, "Q2-Tools": 0.3, "Q3-Skills": 0.3, "Q4-MCP": 0.7, "Q6-Harness": 0.4 },
  "Q6-Harness": { "Q1-Kernel": 0.4, "Q2-Tools": 0.6, "Q3-Skills": 0.5, "Q4-MCP": 0.3, "Q5-Evolve": 0.4 }
};

function getEntanglement(a: string, b: string): number {
  return ENTANGLEMENT_MATRIX[a]?.[b] || ENTANGLEMENT_MATRIX[b]?.[a] || 0.1;
}

function calculateInterference(wings: WingState[]): { paths: string[]; severity: number }[] {
  const interferences: { paths: string[]; severity: number }[] = [];

  for (let i = 0; i < wings.length; i++) {
    for (let j = i + 1; j < wings.length; j++) {
      const wingA = wings[i];
      const wingB = wings[j];

      // Check if they're targeting entangled components
      for (const targetA of Object.keys(wingA.entanglementMatrix)) {
        for (const targetB of Object.keys(wingB.entanglementMatrix)) {
          if (targetA === targetB) {
            const severity = getEntanglement(targetA, targetA);
            if (severity > 0.5) {
              interferences.push({
                paths: [wingA.id, wingB.id],
                severity: severity * (wingA.probability + wingB.probability) / 2
              });
            }
          }
        }
      }
    }
  }

  return interferences;
}

// ============================================================================
// Q-Wing Manager
// ============================================================================

export class QWingManager {
  private wings: Map<string, WingState> = new Map();
  private maxParallelWings: number;
  private wingProcs: Map<string, ChildProcess> = new Map();
  private dataDir: string;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(maxParallel = 4, dataDir?: string) {
    this.maxParallelWings = maxParallel;
    this.dataDir = dataDir || join(ROOT, "data", "q-wing");
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
    this.startHeartbeatMonitor();
  }

  private startHeartbeatMonitor() {
    // Monitor wing health every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const [wingId, wing] of this.wings) {
        if (wing.status === "exploring" && now - wing.lastHeartbeat > 120000) {
          console.log(`[q-wing] Wing ${wingId} heartbeat timeout - marking as stale`);
          wing.status = "failed";
        }
      }
    }, 30000);
  }

  /**
   * Create a new wing to explore a solution path
   */
  spawnWing(
    name: string,
    job: string,
    prompt: string,
    parentWing?: string
  ): WingState | null {
    if (this.wings.size >= this.maxParallelWings) {
      console.log(`[q-wing] Capacity reached (${this.maxParallelWings}). Cannot spawn ${name}`);
      return null;
    }

    const wingId = `wing-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    
    const wing: WingState = {
      id: wingId,
      name,
      job,
      prompt,
      status: "spawning",
      startedAt: Date.now(),
      lastHeartbeat: Date.now(),
      probability: 0.5, // Initial probability before exploration
      interferenceWarnings: [],
      findings: [],
      parentWing,
      childWings: [],
      entanglementMatrix: {}
    };

    this.wings.set(wingId, wing);

    // Update parent if exists
    if (parentWing) {
      const parent = this.wings.get(parentWing);
      if (parent) {
        parent.childWings.push(wingId);
      }
    }

    // Start the wing exploration
    this.startWing(wing);

    console.log(`[q-wing] Spawned ${name} as ${wingId} (parent: ${parentWing || "root"})`);
    return wing;
  }

  /**
   * Start wing exploration (runs in parallel with other wings)
   */
  private async startWing(wing: WingState) {
    const MEOW_CLI = join(ROOT, "agent-kernel", "cli", "index.ts");
    
    wing.status = "exploring";
    
    const proc = spawn("bun", [
      "run", MEOW_CLI,
      "--auto",
      "--dangerous",
      "--mcp-config", join(ROOT, "mcp-bridge.json"),
      "--",
      wing.prompt
    ], {
      cwd: process.env.MEOW_CWD || ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, MEOW_TRUST_ALL: "1" },
      shell: process.platform === "win32"
    });

    this.wingProcs.set(wing.id, proc);

    let buffer = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      const str = chunk.toString();
      buffer += str;
      wing.lastHeartbeat = Date.now();
      
      // Extract findings from output
      this.extractFindings(wing, str);
      
      // Update probability based on progress indicators
      this.updateProbability(wing, str);
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      const str = chunk.toString();
      wing.lastHeartbeat = Date.now();
      buffer += str;

      // Check for errors/warnings
      if (str.includes("Error") || str.includes("FAIL")) {
        wing.interferenceWarnings.push(str.slice(0, 200));
      }
    });

    proc.on("close", (code) => {
      wing.status = code === 0 ? "complete" : "failed";
      
      // Finalize probability based on result
      wing.probability = code === 0 
        ? Math.min(0.95, wing.probability + 0.2) 
        : Math.max(0.1, wing.probability - 0.3);

      // Store findings to Sovereign Palace
      this.consolidateWingFindings(wing, buffer);

      // Clean up
      this.wingProcs.delete(wing.id);
      
      console.log(`[q-wing] Wing ${wing.name} (${wing.id}) ${wing.status} with probability ${wing.probability.toFixed(2)}`);
    });

    proc.on("error", (err) => {
      wing.status = "failed";
      wing.interferenceWarnings.push(`Process error: ${err.message}`);
      this.wingProcs.delete(wing.id);
    });
  }

  /**
   * Extract findings from wing output
   */
  private extractFindings(wing: WingState, output: string) {
    // Look for structured findings patterns
    const patterns = [
      /(?:✓|Created|Wrote|Fixed|Solved)[:\s]+([^\n]+)/gi,
      /(?:Learned|Discovered|Fact)[:\s]+([^\n]+)/gi,
      /(?:SUCCESS|PASS|BREAKTHROUGH)[:\s]+([^\n]+)/gi,
    ];

    for (const pattern of patterns) {
      const matches = output.matchAll(pattern);
      for (const match of matches) {
        const content = match[1]?.trim().slice(0, 200);
        if (content && !wing.findings.some(f => f.content.includes(content))) {
          wing.findings.push({
            timestamp: Date.now(),
            type: content.toLowerCase().includes("fix") ? "lesson" : "fact",
            content,
            confidence: 0.7,
            verified: false
          });
        }
      }
    }
  }

  /**
   * Update probability based on progress indicators
   */
  private updateProbability(wing: WingState, output: string) {
    const lower = output.toLowerCase();
    
    if (lower.includes("error") || lower.includes("fail") || lower.includes("broken")) {
      wing.probability = Math.max(0.1, wing.probability - 0.05);
    }
    if (lower.includes("success") || lower.includes("pass") || lower.includes("created")) {
      wing.probability = Math.min(0.95, wing.probability + 0.1);
    }
    if (lower.includes("breakthrough") || lower.includes("solved")) {
      wing.probability = Math.min(0.95, wing.probability + 0.2);
    }
  }

  /**
   * Consolidate wing findings into Sovereign Palace memory
   */
  private async consolidateWingFindings(wing: WingState, buffer: string) {
    try {
      const { consolidateJobMemories } = await import("./memory-consolidator");
      await consolidateJobMemories(
        wing.name,
        wing.prompt,
        buffer.slice(-4000),
        wing.status === "complete" ? 0 : 1
      );
    } catch (e) {
      console.error(`[q-wing] Failed to consolidate findings for ${wing.id}:`, e);
    }
  }

  /**
   * Get current wing snapshot for Commander decisions
   */
  getSnapshot(): WingSnapshot {
    const activeWings = Array.from(this.wings.values())
      .filter(w => w.status === "exploring" || w.status === "spawning")
      .map(w => w.id);

    const completedFindings = Array.from(this.wings.values())
      .filter(w => w.status === "complete")
      .flatMap(w => w.findings);

    const interferences = calculateInterference(Array.from(this.wings.values()));
    
    const convergedPaths = Array.from(this.wings.values())
      .filter(w => w.probability > 0.7 && w.status === "complete")
      .map(w => w.name);

    return {
      timestamp: Date.now(),
      activeWings,
      completedWings: completedFindings,
      interferenceDetected: interferences.length > 0,
      convergedPaths,
      recommendations: this.generateRecommendations()
    };
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    
    // Check for high-probability completed wings
    const highProb = Array.from(this.wings.values())
      .filter(w => w.probability > 0.8 && w.status === "complete");
    if (highProb.length > 0) {
      recommendations.push(`COLLAPSE: ${highProb.map(w => w.name).join(", ")} have converged with high probability`);
    }

    // Check for stalled wings
    const stalled = Array.from(this.wings.values())
      .filter(w => w.status === "exploring" && w.findings.length === 0);
    if (stalled.length > 0) {
      recommendations.push(`COLLAPSE: ${stalled.map(w => w.name).join(", ")} are not producing findings`);
    }

    // Check for interference
    const interferences = calculateInterference(Array.from(this.wings.values()));
    if (interferences.length > 0) {
      recommendations.push(`INTERFERE: High entanglement detected between wings`);
    }

    // Check capacity
    if (this.wings.size < this.maxParallelWings) {
      recommendations.push(`EXPAND: Available capacity for ${this.maxParallelWings - this.wings.size} more wings`);
    }

    return recommendations;
  }

  /**
   * Decide on parallel actions based on wing states
   */
  decide(): ParallelDecision[] {
    const decisions: ParallelDecision[] = [];
    const snapshot = this.getSnapshot();

    for (const rec of snapshot.recommendations) {
      const [action, ...rest] = rec.split(":");
      const wings = rest.join(":").split(",").map(w => w.trim()).filter(w => w);
      
      decisions.push({
        action: action as ParallelDecision["action"],
        wings,
        reason: `Based on ${action.toLowerCase()} analysis`,
        confidence: 0.8
      });
    }

    return decisions;
  }

  /**
   * Get wing by ID
   */
  getWing(wingId: string): WingState | undefined {
    return this.wings.get(wingId);
  }

  /**
   * Get all wings
   */
  getAllWings(): WingState[] {
    return Array.from(this.wings.values());
  }

  /**
   * Abort a specific wing
   */
  abortWing(wingId: string, reason: string = "Commander abort") {
    const wing = this.wings.get(wingId);
    if (!wing) return;

    const proc = this.wingProcs.get(wingId);
    if (proc) {
      console.log(`[q-wing] Aborting ${wing.name}: ${reason}`);
      proc.kill("SIGTERM");
      this.wingProcs.delete(wingId);
    }

    wing.status = "failed";
  }

  /**
   * Prune completed/failed wings to free memory
   */
  pruneWings(keepRecent = 5) {
    const toKeep = new Set<string>();
    const sorted = Array.from(this.wings.entries())
      .filter(([_, w]) => w.status === "complete" || w.status === "failed")
      .sort((a, b) => b[1].startedAt - a[1].startedAt)
      .slice(0, keepRecent);

    for (const [id] of sorted) {
      toKeep.add(id);
    }

    for (const [id, wing] of this.wings) {
      if (!toKeep.has(id)) {
        this.abortWing(id, "Pruning old wing");
        this.wings.delete(id);
      }
    }
  }

  /**
   * Clean up resources
   */
  shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    for (const [wingId] of this.wingProcs) {
      this.abortWing(wingId, "Shutdown");
    }
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

const args = process.argv.slice(2);
const command = args[0];

const manager = new QWingManager();

if (command === "status") {
  const snapshot = manager.getSnapshot();
  console.log(JSON.stringify(snapshot, null, 2));
} else if (command === "spawn") {
  const job = args[1] || "Unnamed Wing";
  const prompt = args.slice(2).join(" ") || "Explore solution space";
  manager.spawnWing(job, job, prompt);
} else if (command === "decide") {
  const decisions = manager.decide();
  console.log(JSON.stringify(decisions, null, 2));
} else if (command === "abort") {
  manager.abortWing(args[1], args.slice(2).join(" "));
} else if (command === "prune") {
  manager.pruneWings(parseInt(args[1]) || 5);
} else if (!command) {
  console.log(`[q-wing] Q-Wing Manager ready. ${manager.getAllWings().length} active wings.`);
  // Keep running for monitoring
  setInterval(() => {
    const snapshot = manager.getSnapshot();
    console.log(`[q-wing] Snapshot: ${snapshot.activeWings.length} active, ${snapshot.convergedPaths.length} converged`);
  }, 60000);
}

export { QWingManager, type WingState, type WingSnapshot, type ParallelDecision };