/**
 * auto-agent.ts
 *
 * Autonomous agent loop for Meow.
 * Implements an OODA-inspired loop (Observe-Orient-Decide-Act) for rapid
 * autonomous operation, similar to Claude Code's KAIROS/PROACTIVE modes.
 *
 * Features:
 * - Tick heartbeat mechanism for continuous operation
 * - Terminal focus awareness (pause when user away)
 * - Silent/ghost operations for background tasks
 * - Decision confidence thresholds
 * - Auto-commit and push capabilities
 *
 * GAP-AUTO-01: InterruptController is imported from ./interrupt.ts
 * to avoid circular dependencies with auto-mode.ts.
 */
import { runLeanAgent, type AgentResult, type LeanAgentOptions } from "./lean-agent.ts";
import { type InterruptController, createInterruptController } from "./interrupt.ts";
import {
  registerSignalHandlers,
  waitForTickInterval,
  getInterruptController,
  shouldPauseAutonomous,
  isTerminalFocused,
} from "../sidecars/auto-mode.ts";
import { logHistory } from "../sidecars/history-logger.ts";
import { CuriosityEngine } from "../sidecars/curiosity-engine.ts";

export type { InterruptController };
export { createInterruptController, getInterruptController };

// ============================================================================
// Types
// ============================================================================

export interface AutoAgentOptions extends LeanAgentOptions {
  /** Continuous tick mode - keeps running until stopped */
  tickMode?: boolean;
  /** Tick interval in ms (default 5000) */
  tickInterval?: number;
  /** Minimum confidence to act autonomously (0-1, default 0.7) */
  confidenceThreshold?: number;
  /** Enable ghost/background operations */
  ghostMode?: boolean;
  /** Auto-commit changes when confident */
  autoCommit?: boolean;
  /** Auto-push after commit */
  autoPush?: boolean;
  /** Proactive notifications */
  notifyOnComplete?: boolean;
}

export interface TickResult {
  observation: string;
  orientation: string;
  decision: string;
  action: string | null;
  confidence: number;
  ticks: number;
  iterations: number;
}

interface Observation {
  type: "user_input" | "tick" | "tool_result" | "git_status" | "file_change";
  content: string;
  timestamp: number;
  confidence: number;
}

// ============================================================================
// OODA Loop Implementation
// ============================================================================

/**
 * The OODA loop for autonomous operation:
 *
 * OBSERVE: Gather context (git status, file changes, user input)
 * ORIENT: Analyze and understand the situation
 * DECIDE: Choose action based on confidence threshold
 * ACT: Execute the decided action
 */

async function observe(options: AutoAgentOptions, ic?: InterruptController): Promise<Observation[]> {
  if (ic?.shouldStopNow()) return [];

  const observations: Observation[] = [];
  const now = Date.now();

  // Health check: verify API key is present
  const apiKey = options.apiKey || process.env.LLM_API_KEY;
  if (!apiKey) {
    observations.push({
      type: "tool_result",
      content: "⚠️ LLM_API_KEY not set — autonomous loop paused",
      timestamp: now,
      confidence: 1.0,
    });
  }

  // Check git status
  try {
    const { execSync } = await import("node:child_process");
    const status = execSync("git status --porcelain", { encoding: "utf-8", timeout: 1000 }).trim();
    if (status) {
      observations.push({
        type: "git_status",
        content: `Git changes:\n${status}`,
        timestamp: now,
        confidence: 0.9,
      });
    }
  } catch {
    // Git not available or not a repo
  }

  // Check for program.md (Autoresearch style planning)
  try {
    const { readFileSync, existsSync } = await import("node:fs");
    const programPath = join(process.cwd(), ".meow", "program.md");
    if (existsSync(programPath)) {
      const program = readFileSync(programPath, "utf-8");
      observations.push({
        type: "tick",
        content: `Current Plan (from program.md):\n${program}`,
        timestamp: now,
        confidence: 1.0,
      });
    }
  } catch {
    // No program.md or error reading it
  }

  return observations;
}

function orient(observations: Observation[], context: string): {
  summary: string;
  confidence: number;
  recommendedAction: string | null;
} {
  // Analyze observations and determine situation
  let confidence = 0.5;
  let summary = "Normal operation";
  let recommendedAction: string | null = null;

  // Check git status observations
  const gitObs = observations.find(o => o.type === "git_status");
  if (gitObs) {
    summary = "Code changes detected";
    confidence = 0.8;

    // Decide if we should commit
    if (gitObs.content.includes("??") || gitObs.content.match(/^[MADRC]/m)) {
      recommendedAction = "commit";
      confidence = 0.7;
    }
  }

  // Check for user input (handled separately)

  return { summary, confidence, recommendedAction };
}

async function decide(
  recommendedAction: string | null,
  confidence: number,
  options: AutoAgentOptions
): Promise<{ action: string | null; execute: boolean }> {
  const threshold = options.confidenceThreshold || 0.7;

  if (!recommendedAction) {
    return { action: null, execute: false };
  }

  if (confidence >= threshold) {
    return { action: recommendedAction, execute: true };
  }

  // Medium confidence - suggest but don't act
  if (confidence >= 0.5) {
    return { action: recommendedAction, execute: false };
  }

  return { action: null, execute: false };
}

async function act(
  action: string,
  options: AutoAgentOptions
): Promise<{ content: string; success: boolean }> {
  switch (action) {
    case "commit": {
      if (!options.autoCommit) {
        return { content: "Auto-commit disabled", success: false };
      }
      try {
        const { execSync } = await import("node:child_process");
        execSync("git add -A", { encoding: "utf-8", timeout: 5000 });
        const commitMsg = options.systemPrompt?.includes("orientation") ? `chore: ${options.systemPrompt}` : "chore: meow auto-save";
        const result = execSync(`git commit -m "${commitMsg}"`, { encoding: "utf-8", timeout: 5000 });
        return { content: result.toString(), success: true };
      } catch (e: any) {
        return { content: `Commit failed: ${e.message}`, success: false };
      }
    }

    case "push": {
      if (!options.autoPush) {
        return { content: "Auto-push disabled", success: false };
      }
      try {
        const { execSync } = await import("node:child_process");
        const result = execSync("git push", { encoding: "utf-8", timeout: 10000 });
        return { content: result.toString(), success: true };
      } catch (e: any) {
        return { content: `Push failed: ${e.message}`, success: false };
      }
    }

    default:
      return { content: `Unknown action: ${action}`, success: false };
  }
}

// ============================================================================
// Ghost Operations (Background Tasks)
// ============================================================================

interface GhostTask {
  id: string;
  description: string;
  execute: () => Promise<string>;
  interval?: number;  // Run every N ms
  lastRun?: number;
  running?: boolean;
}

const ghostTasks: Map<string, GhostTask> = new Map();

export function registerGhostTask(task: GhostTask): void {
  ghostTasks.set(task.id, task);
}

export function unregisterGhostTask(id: string): void {
  ghostTasks.delete(id);
}

async function runGhostTasks(ic?: InterruptController): Promise<void> {
  const now = Date.now();
  for (const [id, task] of ghostTasks) {
    if (ic?.shouldStopNow()) break;
    if (task.running) continue;
    if (task.interval && task.lastRun && now - task.lastRun < task.interval) continue;

    task.running = true;
    try {
      const result = await task.execute();
      if (result) {
        console.log(`[ghost:${id}] ${result}`);
      }
      task.lastRun = now;
    } catch (e: any) {
      console.error(`[ghost:${id}] Error: ${e.message}`);
    } finally {
      task.running = false;
    }
  }
}

// ============================================================================
// Auto/Proactive Agent Loop
// ============================================================================

export async function runAutoAgent(
  initialPrompt: string,
  options: AutoAgentOptions = {},
  ic?: InterruptController
): Promise<{
  ticks: number;
  results: TickResult[];
  finalResult: AgentResult;
}> {
  // Wire in the shared interrupt controller from auto-mode sidecar if not provided.
  // This allows CLI, REPL, and signal handlers to signal the loop to stop.
  const activeIC = ic ?? getInterruptController();
  // Register SIGINT/SIGTERM handlers so Ctrl+C stops the OODA loop gracefully
  registerSignalHandlers();
  const tickInterval = options.tickInterval || 5000;
  const maxTicks = options.tickMode ? 100 : 1;

  const results: TickResult[] = [];
  let ticks = 0;
  let lastResult: AgentResult | null = null;
  let interrupted = false;

  // Register default ghost tasks (idempotent)
  if (!ghostTasks.has("git-sync")) {
    registerGhostTask({
      id: "git-sync",
      description: "Check and sync git status",
      interval: 30000,
      execute: async () => {
        const { execSync } = await import("node:child_process");
        try {
          execSync("git fetch", { encoding: "utf-8", timeout: 5000 });
          return "";
        } catch {
          return "";
        }
      },
    });
  // Register Curiosity Loop (Intrinsic Motivation)
  if (!ghostTasks.has("curiosity-pulse")) {
    registerGhostTask({
      id: "curiosity-pulse",
      description: "Scan for autonomous research opportunities",
      interval: 600000, // Every 10 minutes
      execute: async () => {
        const { CuriosityEngine } = await import("../sidecars/curiosity-engine.ts");
        const signals = await CuriosityEngine.scanForInterest(process.cwd());
        for (const signal of signals) {
          CuriosityEngine.proposeMission(signal, process.cwd());
        }
        return `Processed ${signals.length} curiosity signals.`;
      },
    });
  }

  // Pass abort signal to lean agent so Ctrl+C also aborts LLM calls
  const leanOptions: LeanAgentOptions = {
    ...options,
    abortSignal: activeIC.signal,
  };

  while (!activeIC.shouldStopNow() && ticks < maxTicks) {
    // Pause if terminal is unfocused (GAP-AUTO-01: terminal focus awareness)
    if (shouldPauseAutonomous()) {
      await new Promise((r) => setTimeout(r, 500));
      if (activeIC.shouldStopNow()) { interrupted = true; break; }
      continue;
    }

    ticks++;

    // Observe
    const observations = await observe(options, activeIC);
    if (activeIC.shouldStopNow()) { interrupted = true; break; }

    // Orient
    const { summary, confidence, recommendedAction } = orient(observations, lastResult?.content || "");

    // Decide
    const { action, execute } = await decide(recommendedAction, confidence, options);

    // Act
    let actionResult: string | null = null;
    if (execute && action) {
      const result = await act(action, options);
      actionResult = result.success ? `✓ ${action}: ${result.content}` : `✗ ${action}: ${result.content}`;
    }

    // Record tick result
    results.push({
      observation: observations.map(o => o.content).join("\n") || "No observations",
      orientation: summary,
      decision: execute ? `Executing: ${action}` : (recommendedAction ? `Skipping: ${action} (low confidence)` : "No action needed"),
      action: actionResult,
      confidence,
      ticks,
      iterations: 0,
    });

    // KARPATHY-STYLE LOGGING: Record to history.tsv
    logHistory({
      timestamp: new Date().toISOString(),
      missionId: "auto-" + Date.now().toString().slice(-6),
      tick: ticks,
      observation: observations.map(o => o.content).join(" "),
      orientation: summary,
      decision: execute ? `Executing: ${action}` : "Skipping",
      action: action,
      result: actionResult,
      confidence: confidence,
    });

    // Progress indicator for tick mode
    if (options.tickMode) {
      process.stdout.write(`\r${tickSpinner(ticks)} tick ${ticks}/${maxTicks}  `);
    }

    // Run ghost tasks
    if (options.ghostMode) {
      await runGhostTasks(activeIC);
    }

    // Check if we should stop after this tick
    if (!options.tickMode || activeIC.shouldStop()) {
      break;
    }

    // Wait for next tick
    await sleepWithAbort(tickInterval, activeIC.signal);
    if (activeIC.shouldStopNow()) { interrupted = true; break; }
  }

  // Clear progress line
  if (options.tickMode) {
    process.stdout.write("\r" + " ".repeat(40) + "\r");
  }

  // Build summary context from ticks
  let contextFromTicks = "";
  if (results.length > 0) {
    const actions = results.filter(r => r.action).map(r => r.action);
    if (actions.length > 0) {
      contextFromTicks = `\n\nAutonomous actions taken:\n${actions.join("\n")}`;
    }
  }

  // Final lean agent run
  const finalPrompt = options.tickMode
    ? `Based on ${ticks} autonomous tick(s), provide a summary of what was accomplished.${contextFromTicks}`
    : initialPrompt;

  let finalResult: AgentResult;
  if (interrupted || activeIC.shouldStop()) {
    finalResult = { content: `Interrupted after ${ticks} tick(s).`, iterations: 0, completed: false };
  } else {
    finalResult = await runLeanAgent(finalPrompt, leanOptions);
  }

  return { ticks, results, finalResult };
}

// Tick spinner frames
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
function tickSpinner(n: number): string {
  return SPINNER[n % SPINNER.length];
}

// Sleep that respects abort signal
function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve(); return; }
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timeout); resolve(); }, { once: true });
  });
}
async function runAutoAgentWithProgress(
  initialPrompt: string,
  options: AutoAgentOptions = {},
  onProgress?: ProgressCallback
): Promise<{ ticks: number; results: TickResult[]; finalResult: AgentResult }> {
  const ic = createInterruptController();

  onProgress?.(`Starting autonomous loop...`);

  const result = await runAutoAgent(initialPrompt, options, ic);

  onProgress?.(`Completed ${result.ticks} tick(s).`);

  return result;
}

// ============================================================================
// Terminal Focus Awareness (delegated to auto-mode sidecar)
// ============================================================================


// ============================================================================
// CLI Integration
// ============================================================================

export function formatAutoResults(results: TickResult[], interrupted = false): string {
  if (results.length === 0) return "No autonomous actions taken.";

  const actions = results.filter(r => r.action);
  let output = `## Autonomous Operation Summary${interrupted ? " (INTERRUPTED)" : ""}\n\n`;
  output += `Ticks: ${results.length} | Actions: ${actions.length} taken\n\n`;

  for (const result of results) {
    output += `### Tick ${result.ticks}\n`;
    output += `**Confidence:** ${(result.confidence * 100).toFixed(0)}%\n`;
    output += `**Observe:** ${result.observation.slice(0, 120)}${result.observation.length > 120 ? "..." : ""}\n`;
    output += `**Orient:** ${result.orientation}\n`;
    output += `**Decide:** ${result.decision}\n`;
    if (result.action) {
      output += `**Act:** ${result.action}\n`;
    }
    output += "\n";
  }

  return output;
}
