/**
 * sovereign-palace.ts — Memory-Driven Proprioception System (720p Core)
 * 
 * Integrates long-term memory into the agent's "body awareness" - the ability
 * to feel and adjust its own execution state based on accumulated experience.
 * 
 * This is the "nervous system" of the 720p agent: it feels the system's state,
 * compares it to known patterns, and triggers autonomic adjustments.
 * 
 * EPOCH 720p: From static memory to dynamic proprioception
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "url";
import { searchMemory, storeMemory, formatSearchResults, forgetMemory } from "../../agent-kernel/src/sidecars/memory-fts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

// ============================================================================
// Types
// ============================================================================

export interface ProprioceptiveState {
  // Core body metrics
  alertness: number;           // 0-1, energy level
  coherence: number;            // 0-1, logical consistency
  momentum: number;             // 0-1, progress rate
  resonance: number;           // 0-1, alignment with goals
  
  // Historical patterns
  familiarPattern: boolean;     // Recognized from past experience
  anomalyDetected: boolean;     // Something unexpected
  fatigueLevel: number;         // 0-1, based on repeated failures
  
  // Memory integration
  palaceAwareness: number;      // 0-1, how much memory informs current state
  lessonsAvailable: number;     // Count of relevant lessons
  
  // Recommendations
  suggestedAdjustments: string[];
  confidence: number;
}

export interface PalaceRoom {
  name: string;
  description: string;
  entries: MemoryEntry[];
  lastVisited: number;
}

export interface MemoryEntry {
  key: string;
  value: string;
  timestamp: number;
  tags: string[];
  source: string;
  importance: number;
  accessCount: number;
  lastAccessed: number;
}

export interface AutonomicResponse {
  trigger: string;
  action: "THROTTLE" | "ACCELERATE" | "REORIENT" | "REST" | "ADAPT";
  reason: string;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

// The Palace is organized into rooms for different memory types
const PALACE_ROOMS = {
  "Library of Failures": {
    description: "Lessons from past errors and how to avoid them",
    keywords: ["error", "fail", "bug", "fix", "lesson", "mistake"]
  },
  "Knowledge Base": {
    description: "Discovered facts and verified truths",
    keywords: ["fact", "discover", "truth", "verified", "learned"]
  },
  "Preferences": {
    description: "User and project style preferences",
    keywords: ["prefer", "style", "format", "convention", "taste"]
  },
  "Current Projects": {
    description: "Active work and ongoing missions",
    keywords: ["project", "mission", "work", "build", "evolve"]
  },
  "Identity": {
    description: "Self-knowledge and core values",
    keywords: ["self", "identity", "core", "value", "meow"]
  }
};

// Threshold values for autonomic responses
const THROTTLE_THRESHOLD = 0.7;     // Start throttling after 70% error rate
const FATIGUE_THRESHOLD = 0.5;       // Trigger rest after 5+ failed attempts
const ANOMALY_THRESHOLD = 0.6;       // Flag anomalies above this confidence
const MOMENTUM_LOW = 0.3;           // Below this = stuck
const MOMENTUM_HIGH = 0.8;         // Above this = flying

// ============================================================================
// Sovereign Palace Class
// ============================================================================

export class SovereignPalace {
  private dataDir: string;
  private stateFile: string;
  private roomsFile: string;
  private proprioceptiveCache: Map<string, number> = new Map();
  private lastCheck: number = 0;
  private cacheTimeout: number = 30000; // 30 seconds

  constructor(dataDir?: string) {
    this.dataDir = dataDir || join(ROOT, "data", "palace");
    this.stateFile = join(this.dataDir, "state.json");
    this.roomsFile = join(this.dataDir, "rooms.json");

    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }

    this.initializePalace();
  }

  private initializePalace() {
    // Ensure palace structure exists
    if (!existsSync(this.stateFile)) {
      writeFileSync(this.stateFile, JSON.stringify({
        initialized: Date.now(),
        totalMemories: 0,
        lastConsolidation: null,
        consecutiveErrors: 0,
        lastSuccess: null
      }, null, 2));
    }

    if (!existsSync(this.roomsFile)) {
      writeFileSync(this.roomsFile, JSON.stringify(PALACE_ROOMS, null, 2));
    }
  }

  // ============================================================================
  // Memory Integration Layer
  // ============================================================================

  /**
   * Store a new memory with automatic room classification
   */
  async memorize(
    key: string,
    value: string,
    tags: string[] = [],
    importance: number = 3,
    source: string = "agent"
  ): Promise<string> {
    // Auto-classify into palace rooms
    const room = this.classifyToRoom(key, value, tags);
    
    const entry: MemoryEntry = {
      key,
      value,
      timestamp: Date.now(),
      tags: [...tags, room],
      source,
      importance,
      accessCount: 0,
      lastAccessed: Date.now()
    };

    // Store in primary memory system
    storeMemory(key, value, {
      tags,
      source,
      importance,
      wing: "Sovereign Palace",
      room,
      drawer: room
    });

    // Also store in palace-specific index
    this.indexToPalace(entry);

    return room;
  }

  /**
   * Classify a memory into the appropriate palace room
   */
  private classifyToRoom(key: string, value: string, tags: string[]): string {
    const combined = `${key} ${value} ${tags.join(" ")}`.toLowerCase();

    for (const [roomName, room] of Object.entries(PALACE_ROOMS)) {
      for (const keyword of room.keywords) {
        if (combined.includes(keyword)) {
          return roomName;
        }
      }
    }

    // Default to Knowledge Base if no match
    return "Knowledge Base";
  }

  /**
   * Index entry to palace for fast lookup
   */
  private indexToPalace(entry: MemoryEntry) {
    try {
      const indexFile = join(this.dataDir, "index.json");
      let index: Record<string, MemoryEntry[]> = {};

      if (existsSync(indexFile)) {
        index = JSON.parse(readFileSync(indexFile, "utf-8"));
      }

      const room = entry.tags.find(t => Object.keys(PALACE_ROOMS).includes(t)) || "Knowledge Base";
      
      if (!index[room]) {
        index[room] = [];
      }

      // Avoid duplicates
      const existing = index[room].findIndex(e => e.key === entry.key);
      if (existing >= 0) {
        index[room][existing] = entry;
      } else {
        index[room].push(entry);
      }

      // Limit room size to 100 entries
      if (index[room].length > 100) {
        index[room] = index[room].slice(-100);
      }

      writeFileSync(indexFile, JSON.stringify(index, null, 2));
    } catch (e) {
      console.error("[palace] Index error:", e);
    }
  }

  /**
   * Recall memories relevant to current context
   */
  async recall(context: string, limit = 10): Promise<MemoryEntry[]> {
    const results = searchMemory(context, limit);
    
    return results.map(r => ({
      key: r.key,
      value: r.value,
      timestamp: r.timestamp || Date.now(),
      tags: r.tags || [],
      source: r.source || "memory",
      importance: r.importance || 3,
      accessCount: r.accessCount || 0,
      lastAccessed: Date.now()
    }));
  }

  /**
   * Recall specific lessons from the Library of Failures
   */
  async recallLessons(errorPattern: string, limit = 5): Promise<MemoryEntry[]> {
    const allMemories = await this.recall(errorPattern, limit * 2);
    return allMemories.filter(m => 
      m.tags.includes("lesson") || 
      m.tags.includes("Library of Failures") ||
      m.key.toLowerCase().includes("error") ||
      m.key.toLowerCase().includes("fail")
    ).slice(0, limit);
  }

  // ============================================================================
  // Proprioceptive Awareness
  // ============================================================================

  /**
   * Feel the current system state through memory integration
   * This is the "body awareness" - the agent "feels" its execution state
   */
  async feel(executionContext?: {
    recentErrors?: number;
    recentSuccesses?: number;
    currentTask?: string;
    elapsedTime?: number;
  }): Promise<ProprioceptiveState> {
    // Check cache first
    const now = Date.now();
    if (now - this.lastCheck < this.cacheTimeout) {
      const cached = this.proprioceptiveCache.get("currentState");
      if (cached) {
        return JSON.parse(String(cached));
      }
    }

    const errors = executionContext?.recentErrors || 0;
    const successes = executionContext?.recentSuccesses || 0;
    const total = errors + successes;

    // Calculate core metrics
    const errorRate = total > 0 ? errors / total : 0;
    const successRate = total > 0 ? successes / total : 0;

    // Alertness: based on recent activity
    const recentActivity = this.getRecentActivity();
    const alertness = Math.min(1, recentActivity / 10);

    // Coherence: logical consistency (lower when error rate is high)
    const coherence = Math.max(0.2, 1 - (errorRate * 2));

    // Momentum: progress rate (0.5 neutral, higher when making progress)
    const momentum = successes > 0 
      ? Math.min(0.95, 0.5 + (successes * 0.1) - (errors * 0.05))
      : Math.max(0.1, 0.5 - (errors * 0.1));

    // Resonance: alignment with goals (high when current task matches memories)
    const resonance = executionContext?.currentTask 
      ? await this.calculateResonance(executionContext.currentTask)
      : 0.5;

    // Check for familiar patterns
    const familiarPattern = await this.recognizePattern(executionContext);

    // Anomaly detection
    const anomalyDetected = errorRate > ANOMALY_THRESHOLD || !familiarPattern;

    // Fatigue level (accumulates with consecutive errors)
    const stateData = this.loadState();
    if (errors > 0 && stateData.consecutiveErrors > 0) {
      stateData.consecutiveErrors += errors;
    } else if (successes > 0) {
      stateData.consecutiveErrors = Math.max(0, stateData.consecutiveErrors - successes);
    }
    const fatigueLevel = Math.min(1, stateData.consecutiveErrors / 10);
    this.saveState(stateData);

    // Palace awareness: how much memory informs current decisions
    const relevantMemories = await this.recall(executionContext?.currentTask || "general", 10);
    const palaceAwareness = Math.min(1, relevantMemories.length / 10);

    // Count available lessons
    const lessons = await this.recallLessons(executionContext?.currentTask || "error", 10);
    const lessonsAvailable = lessons.length;

    // Generate suggested adjustments
    const suggestedAdjustments = this.generateAdjustments({
      alertness,
      coherence,
      momentum,
      resonance,
      errorRate,
      fatigueLevel,
      familiarPattern
    });

    const state: ProprioceptiveState = {
      alertness,
      coherence,
      momentum,
      resonance,
      familiarPattern,
      anomalyDetected,
      fatigueLevel,
      palaceAwareness,
      lessonsAvailable,
      suggestedAdjustments,
      confidence: coherence * palaceAwareness
    };

    // Cache the result
    this.proprioceptiveCache.set("currentState", JSON.stringify(state));
    this.lastCheck = now;

    return state;
  }

  private getRecentActivity(): number {
    // Count recent memory accesses
    try {
      const indexFile = join(this.dataDir, "index.json");
      if (!existsSync(indexFile)) return 0;

      const index = JSON.parse(readFileSync(indexFile, "utf-8"));
      const recent = Object.values(index).flat().filter((e: any) => 
        Date.now() - e.timestamp < 60000 // Last minute
      );
      return recent.length;
    } catch {
      return 0;
    }
  }

  private async calculateResonance(task: string): Promise<number> {
    const memories = await this.recall(task, 5);
    if (memories.length === 0) return 0.3; // Low resonance for unknown tasks
    
    // Resonance is higher when memories confirm we're on the right track
    const confirms = memories.filter(m => 
      m.value.toLowerCase().includes("success") ||
      m.value.toLowerCase().includes("works") ||
      m.value.toLowerCase().includes("correct")
    ).length;

    return Math.min(0.9, 0.4 + (confirms * 0.1));
  }

  private async recognizePattern(context?: {
    recentErrors?: number;
    recentSuccesses?: number;
    currentTask?: string;
  }): Promise<boolean> {
    if (!context?.currentTask) return false;

    const memories = await this.recall(context.currentTask, 3);
    // Pattern is familiar if we've seen similar before
    return memories.length > 0;
  }

  private loadState(): any {
    try {
      if (existsSync(this.stateFile)) {
        return JSON.parse(readFileSync(this.stateFile, "utf-8"));
      }
    } catch {}
    return { consecutiveErrors: 0, lastSuccess: null };
  }

  private saveState(state: any) {
    writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }

  private generateAdjustments(metrics: {
    alertness: number;
    coherence: number;
    momentum: number;
    resonance: number;
    errorRate: number;
    fatigueLevel: number;
    familiarPattern: boolean;
  }): string[] {
    const adjustments: string[] = [];

    if (metrics.fatigueLevel > FATIGUE_THRESHOLD) {
      adjustments.push("REST: Take a pause to prevent cascading errors");
    }

    if (metrics.momentum < MOMENTUM_LOW) {
      adjustments.push("REORIENT: Progress is stalled, check alignment");
    }

    if (metrics.errorRate > THROTTLE_THRESHOLD) {
      adjustments.push("THROTTLE: Reduce complexity, focus on known patterns");
    }

    if (!metrics.familiarPattern && metrics.momentum > MOMENTUM_HIGH) {
      adjustments.push("ADAPT: New territory detected, expand cautiously");
    }

    if (metrics.resonance < 0.4) {
      adjustments.push("REORIENT: Check if task aligns with core goals");
    }

    if (metrics.alertness < 0.3) {
      adjustments.push("REST: Low energy state, reduce scope");
    }

    // Default: maintain course
    if (adjustments.length === 0) {
      adjustments.push("ACCELERATE: All systems nominal, push forward");
    }

    return adjustments;
  }

  // ============================================================================
  // Autonomic Responses
  // ============================================================================

  /**
   * Trigger an autonomic response based on proprioceptive state
   */
  async triggerAutonomic(currentState: ProprioceptiveState): Promise<AutonomicResponse | null> {
    // Check for critical conditions that need immediate response

    // High fatigue -> Rest
    if (currentState.fatigueLevel > FATIGUE_THRESHOLD) {
      return {
        trigger: "high_fatigue",
        action: "REST",
        reason: `Fatigue level ${(currentState.fatigueLevel * 100).toFixed(0)}% exceeds threshold`,
        confidence: 0.9
      };
    }

    // Low momentum -> Reorient
    if (currentState.momentum < MOMENTUM_LOW && currentState.momentum > 0.1) {
      return {
        trigger: "low_momentum",
        action: "REORIENT",
        reason: "Progress stalled, checking alignment with known patterns",
        confidence: 0.75
      };
    }

    // High error rate -> Throttle
    if (currentState.anomalyDetected && currentState.confidence < 0.5) {
      return {
        trigger: "anomaly_detected",
        action: "THROTTLE",
        reason: "Anomaly with low confidence, reducing complexity",
        confidence: 0.7
      };
    }

    // Strong resonance with low fatigue -> Accelerate
    if (currentState.resonance > 0.7 && currentState.fatigueLevel < 0.3) {
      return {
        trigger: "strong_resonance",
        action: "ACCELERATE",
        reason: "Strong alignment with goals, momentum is favorable",
        confidence: 0.8
      };
    }

    return null;
  }

  /**
   * Adapt agent parameters based on proprioceptive feedback
   */
  adaptParameters(
    baseParams: Record<string, number>,
    state: ProprioceptiveState
  ): Record<string, number> {
    const adapted = { ...baseParams };

    // Temperature adjustment based on coherence
    // Lower coherence = more careful (lower temperature)
    if (state.coherence < 0.5) {
      adapted.temperature = Math.max(0.3, (adapted.temperature || 0.8) - 0.2);
    } else if (state.coherence > 0.8) {
      adapted.temperature = Math.min(1.0, (adapted.temperature || 0.8) + 0.1);
    }

    // Max iterations adjustment based on momentum
    // Low momentum = more iterations to break through
    if (state.momentum < MOMENTUM_LOW) {
      adapted.maxIterations = Math.min(20, (adapted.maxIterations || 8) + 5);
    } else if (state.momentum > MOMENTUM_HIGH) {
      adapted.maxIterations = Math.max(4, (adapted.maxIterations || 8) - 2);
    }

    // Alertness affects response verbosity
    if (state.alertness < 0.4) {
      adapted.verbose = false; // Be concise when tired
    }

    // Palace awareness increases confidence threshold
    if (state.palaceAwareness > 0.7) {
      adapted.confidenceThreshold = (adapted.confidenceThreshold || 0.7) + 0.1;
    }

    return adapted;
  }

  // ============================================================================
  // Palace Navigation
  // ============================================================================

  /**
   * Get the current state of all palace rooms
   */
  async getPalaceStatus(): Promise<Record<string, PalaceRoom>> {
    const rooms: Record<string, PalaceRoom> = {};

    for (const [name, info] of Object.entries(PALACE_ROOMS)) {
      const entries = await this.recall(name, 50);
      rooms[name] = {
        name,
        description: info.description,
        entries,
        lastVisited: Math.max(...entries.map(e => e.timestamp), Date.now() - 86400000)
      };
    }

    return rooms;
  }

  /**
   * Enter a specific room to browse memories
   */
  async enterRoom(roomName: string, limit = 20): Promise<MemoryEntry[]> {
    return this.recall(roomName, limit);
  }

  /**
   * Consolidate fragmented memories after session
   */
  async consolidate(): Promise<{ consolidated: number; message: string }> {
    console.log("[palace] Consolidating memories...");

    // Get all recent memories
    const recentMemories = await this.recall("recent", 100);
    
    // Group by topic
    const byTopic = new Map<string, MemoryEntry[]>();
    for (const mem of recentMemories) {
      const topic = mem.tags[0] || "general";
      if (!byTopic.has(topic)) {
        byTopic.set(topic, []);
      }
      byTopic.get(topic)!.push(mem);
    }

    // Consolidate each topic into a summary memory
    let consolidated = 0;
    for (const [topic, memories] of byTopic) {
      if (memories.length > 3) {
        // Create a summary of multiple similar memories
        const summary = memories.map(m => m.key).join("; ");
        await this.memorize(
          `consolidated:${topic}`,
          `Multiple memories about ${topic}: ${summary}`,
          [topic, "consolidated"],
          4,
          "palace"
        );
        consolidated++;
      }
    }

    // Update state
    const state = this.loadState();
    state.lastConsolidation = Date.now();
    state.totalMemories = recentMemories.length;
    this.saveState(state);

    return {
      consolidated,
      message: `Consolidated ${consolidated} topics into the Palace`
    };
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

const args = process.argv.slice(2);
const command = args[0];

const palace = new SovereignPalace();

async function run() {
  if (command === "feel") {
    const state = await palace.feel({
      recentErrors: parseInt(args[1]) || 0,
      recentSuccesses: parseInt(args[2]) || 0,
      currentTask: args[3]
    });
    console.log(JSON.stringify(state, null, 2));
  } else if (command === "recall") {
    const memories = await palace.recall(args.slice(1).join(" ") || "general", 10);
    console.log(JSON.stringify(memories, null, 2));
  } else if (command === "memorize") {
    const key = args[1] || "fact";
    const value = args.slice(2).join(" ") || "memory";
    const room = await palace.memorize(key, value);
    console.log(`Stored in ${room}`);
  } else if (command === "rooms") {
    const status = await palace.getPalaceStatus();
    console.log(JSON.stringify(status, null, 2));
  } else if (command === "consolidate") {
    const result = await palace.consolidate();
    console.log(result.message);
  } else if (command === "lessons") {
    const lessons = await palace.recallLessons(args.slice(1).join(" ") || "error", 5);
    console.log(JSON.stringify(lessons, null, 2));
  } else if (!command) {
    console.log("[Sovereign Palace] Memory-driven proprioception system ready");
    console.log("Commands: feel, recall, memorize, rooms, consolidate, lessons");
  }
}

run().catch(console.error);

export { SovereignPalace, type ProprioceptiveState, type AutonomicResponse, type MemoryEntry, type PalaceRoom };