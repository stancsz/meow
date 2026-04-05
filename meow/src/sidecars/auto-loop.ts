/**
 * auto-loop.ts - Improved autonomous loop sidecar for Meow
 *
 * Implements an enhanced OODA loop with proper interrupt handling,
 * graceful shutdown, terminal focus awareness, and ghost task lifecycle.
 *
 * Uses auto-mode.ts for InterruptController, signal handlers, and tick monitor.
 */
import { runLeanAgent, type AgentResult, type LeanAgentOptions } from "../core/lean-agent.ts";
import { execSync } from "node:child_process";
import {
  type InterruptController,
  getInterruptController,
  registerSignalHandlers,
  isTerminalFocused,
  shouldPauseAutonomous,
  type TickMonitor,
  createTickMonitor,
  waitForTickInterval,
} from "./auto-mode.ts";

// ============================================================================
// Types
// ============================================================================

export interface AutoLoopOptions extends LeanAgentOptions {
  tickMode?: boolean;
  tickInterval?: number;
  confidenceThreshold?: number;
  ghostMode?: boolean;
  autoCommit?: boolean;
  autoPush?: boolean;
  maxTicks?: number;
  maxRuntimeMs?: number;
  onTick?: (progress: TickProgress) => void;
  onComplete?: (result: AutoLoopResult) => void;
}

export interface TickProgress {
  tick: number;
  maxTicks: number;
  observation: string;
  confidence: number;
  action: string | null;
  elapsedMs: number;
  paused: boolean;
}

export interface AutoLoopResult {
  ticks: number;
  actions: AutoLoopAction[];
  finalResult: AgentResult;
  interrupted: boolean;
  elapsedMs: number;
  pauseReason: string | null;
}

export interface AutoLoopAction {
  tick: number;
  type: string;
  description: string;
  success: boolean;
  confidence: number;
}

// ============================================================================
// Ghost Task Lifecycle
// ============================================================================

interface GhostTaskSpec {
  id: string;
  intervalMs: number;
  execute: (signal: AbortSignal) => Promise<string | null>;
}

interface GhostTaskHandle {
  id: string;
  stop: () => void;
}

const activeGhostTasks = new Map<string, GhostTaskHandle>();

export function startGhostTask(spec: GhostTaskSpec): GhostTaskHandle {
  if (activeGhostTasks.has(spec.id)) return activeGhostTasks.get(spec.id)!;
  const controller = new AbortController();
  let stopped = false;

  const run = async () => {
    while (!stopped && !controller.signal.aborted) {
      try {
        const result = await spec.execute(controller.signal);
        if (result) console.log("[ghost:" + spec.id + "] " + result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[ghost:" + spec.id + "] Error: " + msg);
      }
      if (stopped || controller.signal.aborted) break;
      await new Promise((r) => setTimeout(r, spec.intervalMs));
      if (controller.signal.aborted) break;
    }
  };

  run();

  const handle: GhostTaskHandle = {
    id: spec.id,
    stop: () => { stopped = true; controller.abort(); },
  };
  activeGhostTasks.set(spec.id, handle);
  return handle;
}

export function stopGhostTask(id: string): void {
  const h = activeGhostTasks.get(id);
  if (h) { h.stop(); activeGhostTasks.delete(id); }
}

export function stopAllGhostTasks(): void {
  for (const [, h] of activeGhostTasks) h.stop();
  activeGhostTasks.clear();
}

// ============================================================================
// OODA Loop Helpers
// ============================================================================

interface Observation {
  type: "git_status";
  content: string;
  confidence: number;
}

async function gatherObservations(): Promise<Observation[]> {
  const obs: Observation[] = [];
  try {
    const status = execSync("git status --porcelain", { encoding: "utf-8", timeout: 1000 }).trim();
    if (status) obs.push({ type: "git_status", content: status, confidence: 0.85 });
  } catch { /* not a git repo */ }
  return obs;
}

function orient(observations: Observation[], threshold: number) {
  let confidence = 0.3;
  let action: string | null = null;
  let summary = "Monitoring";

  for (const o of observations) {
    if (o.type === "git_status" && o.content) {
      if (o.content.includes("??") || /^[MADRCU]/m.test(o.content)) {
        confidence = 0.75;
        action = "auto_commit";
        summary = "Changes detected";
      }
    }
  }

  if (confidence < threshold) { action = null; summary = "No action needed"; }
  return { confidence, action, summary };
}

async function act(action: string, opts: AutoLoopOptions) {
  switch (action) {
    case "auto_commit": {
      if (!opts.autoCommit) return { ok: false, msg: "Auto-commit disabled" };
      try {
        execSync("git add -A", { encoding: "utf-8", timeout: 5000 });
        const r = execSync("git commit -m 'chore: auto-save'", { encoding: "utf-8", timeout: 5000 });
        return { ok: true, msg: r.toString().trim() };
      } catch (e: unknown) {
        const m = e instanceof Error ? e.message : String(e);
        return { ok: false, msg: m.includes("nothing to commit") ? "Nothing to commit" : "Commit failed: " + m };
      }
    }
    default:
      return { ok: false, msg: "Unknown action: " + action };
  }
}

// ============================================================================
// Main Autonomous Loop
// ============================================================================

/**
 * Run an improved autonomous loop with full interrupt support.
 *
 * Key improvements over core/auto-agent.ts:
 * - Uses InterruptController from auto-mode.ts for unified interrupt state
 * - Registers SIGINT/SIGTERM handlers for graceful shutdown
 * - Pauses when terminal is unfocused (shouldPauseAutonomous)
 * - Uses waitForTickInterval for interruptible tick heartbeat
 * - Per-tick progress callbacks
 * - Ghost tasks with proper lifecycle
 * - Max runtime enforcement
 */
export async function runAutoLoop(
  initialPrompt: string,
  options: AutoLoopOptions = {}
): Promise<AutoLoopResult> {
  const tickInterval = options.tickInterval ?? 5000;
  const maxTicks = options.tickMode ? (options.maxTicks ?? 100) : 1;
  const threshold = options.confidenceThreshold ?? 0.7;
  const startTime = Date.now();
  const maxRuntimeMs = options.maxRuntimeMs;

  // Register signal handlers for graceful shutdown
  registerSignalHandlers();
  const ic = getInterruptController();
  ic.reset();

  const monitor = createTickMonitor();
  const actions: AutoLoopAction[] = [];
  let ticks = 0;
  let pauseReason: string | null = null;

  // Start ghost tasks
  const ghostHandles: GhostTaskHandle[] = [];
  if (options.ghostMode) {
    ghostHandles.push(startGhostTask({
      id: "git-sync", intervalMs: 30000,
      execute: async (_signal) => {
        try { execSync("git fetch", { encoding: "utf-8", timeout: 5000 }); } catch { /* ignore */ }
        return null;
      },
    }));
  }

  while (ticks < maxTicks && !ic.shouldStopNow()) {
    // Check max runtime
    if (maxRuntimeMs && Date.now() - startTime > maxRuntimeMs) {
      console.log("[auto-loop] Max runtime reached");
      break;
    }

    // Pause if terminal is not focused
    if (shouldPauseAutonomous()) {
      pauseReason = "terminal unfocused";
      monitor.isPaused = true;
      monitor.pauseReason = pauseReason;
      await new Promise((r) => setTimeout(r, 500));
      if (ic.shouldStopNow()) break;
      continue;
    } else if (pauseReason === "terminal unfocused") {
      pauseReason = null;
      monitor.isPaused = false;
      monitor.pauseReason = null;
    }

    // Check stop request (stop after current tick)
    if (ic.shouldStop() && ticks > 0) {
      console.log("[auto-loop] Stop requested after tick " + ticks);
      break;
    }

    ticks++;
    monitor.ticks = ticks;
    monitor.lastTickTime = Date.now();
    const tickStart = Date.now();

    // OODA: Observe
    const observations = await gatherObservations();

    // OODA: Orient + Decide
    const { confidence, action, summary } = orient(observations, threshold);

    // OODA: Act
    let actionTaken: string | null = null;
    let actionOk = false;
    let actionMsg = "";

    if (action && confidence >= threshold) {
      const result = await act(action, options);
      actionTaken = action;
      actionOk = result.ok;
      actionMsg = result.msg;
      actions.push({ tick: ticks, type: action, description: actionMsg || summary, success: actionOk, confidence });
    }

    const elapsedMs = Date.now() - tickStart;

    // Report progress
    options.onTick?.({
      tick: ticks,
      maxTicks,
      observation: observations.map((o) => o.content).join("; ") || "No observations",
      confidence,
      action: actionTaken,
      elapsedMs,
      paused: monitor.isPaused,
    });

    // Check for immediate stop
    if (ic.shouldStopNow()) break;

    // Wait for next tick (interruptible)
    if (options.tickMode && ticks < maxTicks) {
      const finished = await waitForTickInterval(tickInterval, ic.shouldStop.bind(ic), ic.shouldStopNow.bind(ic));
      if (!finished) break; // Interrupted
    }
  }

  // Cleanup ghost tasks
  for (const h of ghostHandles) h.stop();

  const elapsedMs = Date.now() - startTime;

  // Produce final output
  let finalResult: AgentResult;
  if (ic.shouldStopNow() || ic.shouldStop()) {
    finalResult = { content: "Interrupted", iterations: 0, completed: false };
  } else if (ticks === 0) {
    finalResult = await runLeanAgent(initialPrompt, options);
  } else {
    const prompt = options.tickMode
      ? "Based on " + ticks + " autonomous tick(s), summarize what was accomplished."
      : initialPrompt;
    finalResult = await runLeanAgent(prompt, options);
  }

  const result: AutoLoopResult = {
    ticks,
    actions,
    finalResult,
    interrupted: ic.shouldStopNow() || ic.shouldStop(),
    elapsedMs,
    pauseReason,
  };

  options.onComplete?.(result);
  return result;
}

// ============================================================================
// CLI Helpers
// ============================================================================

export function formatTickStatus(progress: TickProgress): string {
  const pct = progress.maxTicks > 0 ? Math.round((progress.tick / progress.maxTicks) * 100) : 0;
  const paused = progress.paused ? " [PAUSED]" : "";
  return "[" + progress.tick + "/" + progress.maxTicks + " | " + pct + "% | conf:" + Math.round(progress.confidence * 100) + "%]" +
    (progress.action ? " -> " + progress.action : "") + paused;
}

export function formatAutoLoopSummary(result: AutoLoopResult): string {
  const lines: string[] = [];
  if (result.interrupted) {
    lines.push("Interrupted after " + result.ticks + " tick(s) (" + Math.round(result.elapsedMs / 1000) + "s)");
  } else {
    lines.push("Completed " + result.ticks + " tick(s) in " + Math.round(result.elapsedMs / 1000) + "s");
  }
  if (result.pauseReason) lines.push("Paused: " + result.pauseReason);
  if (result.actions.length > 0) {
    lines.push("\nAutonomous actions:");
    for (const a of result.actions) {
      lines.push("  [" + (a.success ? "ok" : "FAIL") + "] tick " + a.tick + ": " + a.type + " - " + a.description);
    }
  }
  return lines.join("\n");
}
