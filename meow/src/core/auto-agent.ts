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
 */
import { runLeanAgent, type AgentResult, type LeanAgentOptions } from "./lean-agent.ts";
import { existsSync } from "node:fs";

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

async function observe(options: AutoAgentOptions): Promise<Observation[]> {
  const observations: Observation[] = [];
  const now = Date.now();

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

  // Check for file changes in last tick
  // (Would track via filesystem watcher in full implementation)

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
        const result = execSync("git commit -m 'chore: auto-save'", { encoding: "utf-8", timeout: 5000 });
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

async function runGhostTasks(): Promise<void> {
  const now = Date.now();
  for (const [id, task] of ghostTasks) {
    if (task.running) continue;
    if (task.interval && task.lastRun && now - task.lastRun < task.interval) continue;

    task.running = true;
    try {
      const result = await task.execute();
      if (result) {
        // Could log or store result
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
  options: AutoAgentOptions = {}
): Promise<{
  ticks: number;
  results: TickResult[];
  finalResult: AgentResult;
}> {
  const tickInterval = options.tickInterval || 5000;
  const maxTicks = options.tickMode ? 100 : 1;  // Max ticks in tick mode

  const results: TickResult[] = [];
  let iterations = 0;
  let ticks = 0;
  let lastResult: AgentResult | null = null;
  let isRunning = true;

  // Register default ghost tasks
  registerGhostTask({
    id: "git-sync",
    description: "Check and sync git status",
    interval: 30000,  // Every 30 seconds
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

  while (isRunning && ticks < maxTicks) {
    ticks++;

    // Observe
    const observations = await observe(options);

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
      iterations,
    });

    // Run ghost tasks
    if (options.ghostMode) {
      await runGhostTasks();
    }

    // Check if we should continue
    if (!options.tickMode) {
      isRunning = false;
      break;
    }

    // Wait for next tick
    await new Promise(resolve => setTimeout(resolve, tickInterval));
  }

  // Final agent run to produce output
  const finalPrompt = options.tickMode
    ? `Based on ${ticks} autonomous ticks, provide a summary of what was accomplished.`
    : initialPrompt;

  const finalResult = await runLeanAgent(finalPrompt, options);

  return { ticks, results, finalResult };
}

// ============================================================================
// Terminal Focus Awareness
// ============================================================================

let isTerminalFocused = true;

export function setTerminalFocus(focused: boolean): void {
  isTerminalFocused = focused;
}

export function shouldPauseAutonomous(): boolean {
  return !isTerminalFocused;
}

// ============================================================================
// CLI Integration
// ============================================================================

export function formatAutoResults(results: TickResult[]): string {
  if (results.length === 0) return "No autonomous actions taken.";

  let output = "## Autonomous Operation Summary\n\n";
  output += `Ticks: ${results.length} | Total Iterations: ${results.reduce((s, r) => s + r.iterations, 0)}\n\n`;

  for (const result of results) {
    output += `### Tick ${result.ticks}\n`;
    output += `**Confidence:** ${(result.confidence * 100).toFixed(0)}%\n`;
    output += `**Observe:** ${result.observation.slice(0, 100)}...\n`;
    output += `**Orient:** ${result.orientation}\n`;
    output += `**Decide:** ${result.decision}\n`;
    if (result.action) {
      output += `**Act:** ${result.action}\n`;
    }
    output += "\n";
  }

  return output;
}
