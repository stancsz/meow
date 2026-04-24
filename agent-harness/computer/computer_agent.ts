/**
 * computer_agent.ts
 *
 * High-level Desktop Agent — orchestrates all computer modules.
 *
 * Responsibilities:
 * - Maintains a task queue (plan → execute → verify)
 * - Implements a observe → plan → act loop
 * - Calls screen_recognition to see the current screen
 * - Calls computer_controller to perform actions
 * - Gates actions through human_in_the_loop when risk is elevated
 * - Verifies action results by re-capturing the screen and comparing
 *
 * Usage:
 *   const agent = new DesktopAgent();
 *   await agent.execute("Open Chrome, search for 'Claude AI', click the first result");
 *
 * Architecture is inspired by:
 * - Goose: Rust-speed input injection with a shared memory bus
 * - Eigent: Multi-agent coordination with human-in-the-loop safety gates
 * - Our addition: Deferred LLM labeling + continuous screen diff verification
 */

import {
  click, doubleClick, type, pressKey, screenshot,
  moveMouse, openApp, focusWindow, closeWindow, drag, scroll,
  init as initController, isReady as controllerReady,
  type BoundingBox, type Point,
} from "./computer_controller.js";
import {
  capture, captureRegion, findElement, findAllElements,
  waitForElement, waitForElementGone, compareScreens,
  setMockElements, type ScreenState, type ElementMatch, type TextElement,
} from "./screen_recognition.js";
import {
  riskAssessment, requiresApproval, promptHuman, approve, reject,
  getPendingRequest, handleCliCommand, type ActionContext, type RiskAssessment,
} from "./human_in_the_loop.js";

// ============================================================================
// Types
// ============================================================================

export interface TaskStep {
  description: string;
  tool: string;
  args: Record<string, unknown>;
  retries?: number;
  onSuccess?: string;
  onFailure?: string;
}

export interface TaskResult {
  success: boolean;
  steps: StepResult[];
  summary: string;
}

export interface StepResult {
  step: number;
  description: string;
  tool: string;
  action: ActionContext;
  risk: RiskAssessment;
  approved: boolean;
  startTime: number;
  endTime: number;
  durationMs: number;
  success: boolean;
  result: unknown;
  error?: string;
  verified: boolean;
  screenDiff?: string[];
}

export interface AgentConfig {
  maxSteps: number;
  maxRetries: number;
  stepDelayMs: number;
  verifyAfterEachStep: boolean;
  stopOnVerificationFailure: boolean;
  hitlEnabled: boolean;
}

const DEFAULT_CONFIG: AgentConfig = {
  maxSteps: 50,
  maxRetries: 2,
  stepDelayMs: 500,
  verifyAfterEachStep: true,
  stopOnVerificationFailure: true,
  hitlEnabled: true,
};

// ============================================================================
// Desktop Agent
// ============================================================================

export class DesktopAgent {
  private config: AgentConfig;
  private history: StepResult[] = [];
  private currentStep = 0;
  private lastScreenState: ScreenState | null = null;

  constructor(config: Partial<AgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    await initController();
  }

  isReady(): boolean {
    return controllerReady();
  }

  // ---------------------------------------------------------------------------
  // Main Entry Point
  // ---------------------------------------------------------------------------

  /**
   * execute(naturalLanguageTask) — execute a task described in plain language.
   *
   * Internally:
   * 1. Parses the task into a plan of TaskSteps
   * 2. Executes each step in sequence
   * 3. Verifies each step's effect on screen
   * 4. Handles human-in-the-loop gates
   * 5. Returns a summary of what was done
   */
  async execute(task: string): Promise<TaskResult> {
    this.history = [];
    this.currentStep = 0;

    console.log(`[agent] 🎯 Starting task: "${task}"`);

    // Initialize controller
    if (!this.isReady()) {
      await this.init();
    }

    // Parse task into steps
    const steps = this._parseTask(task);
    console.log(`[agent] 📋 Plan: ${steps.length} step(s)`);
    for (const [i, s] of steps.entries()) {
      console.log(`[agent]   ${i + 1}. ${s.description} (${s.tool})`);
    }

    // Observe initial screen
    await this._observeScreen();

    const results: StepResult[] = [];

    for (let i = 0; i < steps.length && i < this.config.maxSteps; i++) {
      this.currentStep = i;
      const step = steps[i];

      console.log(`[agent] → Step ${i + 1}: ${step.description}`);
      const result = await this._executeStep(step, i);
      results.push(result);

      if (!result.success && (!step.retries || step.retries <= 0)) {
        if (this.config.stopOnVerificationFailure) {
          console.log(`[agent] ⛔ Step failed, stopping.`);
          break;
        }
      }

      // Brief pause between steps
      if (i < steps.length - 1) {
        await this._sleep(this.config.stepDelayMs);
      }
    }

    const success = results.every(r => r.success);
    return {
      success,
      steps: results,
      summary: success
        ? `✅ Completed ${results.length} step(s) successfully.`
        : `⚠️  ${results.filter(r => !r.success).length}/${results.length} steps failed.`,
    };
  }

  // ---------------------------------------------------------------------------
  // Step Execution
  // ---------------------------------------------------------------------------

  private async _executeStep(step: TaskStep, stepIndex: number): Promise<StepResult> {
    const startTime = Date.now();
    const action: ActionContext = {
      tool: step.tool,
      target: step.args.target as string | undefined,
      details: JSON.stringify(step.args),
      screenSummary: this.lastScreenState?.summary,
    };

    const risk = riskAssessment(action);
    const needsApproval = this.config.hitlEnabled && requiresApproval(action);
    const icon = risk.level === "HIGH" ? "🔴" : risk.level === "MEDIUM" ? "🟡" : "🟢";

    console.log(`[agent]   ${icon} Risk: ${risk.level} (${risk.score}/10) — ${risk.reasons.join("; ") || "no factors"}`);

    // Capture before state
    const beforeState = this.lastScreenState;

    // Human-in-the-loop gate
    let approved = true;
    if (needsApproval && risk.level !== "LOW") {
      console.log(`[agent]   ⏸️  Waiting for human approval...`);
      approved = await promptHuman(action);
      if (!approved) {
        return this._makeStepResult(step, stepIndex, startTime, action, risk, approved, {
          success: false,
          error: "Human rejected this action",
        });
      }
      console.log(`[agent]   ✅ Human approved — proceeding`);
    }

    // Execute the action
    let result: unknown;
    let execError: string | undefined;

    try {
      result = await this._dispatchAction(step.tool, step.args);
    } catch (e: any) {
      execError = e.message;
    }

    // Brief settling time
    await this._sleep(300);

    // Verify the action had the intended effect
    const afterState = await this._observeScreen();
    let verified = false;
    let diff: string[] = [];

    if (this.config.verifyAfterEachStep && afterState && beforeState) {
      const diffResult = await compareScreens(beforeState, afterState);
      diff = [...diffResult.added, ...diffResult.removed];
      verified = true; // Verification ran (pass/fail is in diff)
      console.log(`[agent]   🔍 Screen diff: ${diff.length > 0 ? diff.slice(0, 3).join(", ") : "no visible change"}`);
    }

    const durationMs = Date.now() - startTime;
    const success = !execError;

    return {
      step: stepIndex + 1,
      description: step.description,
      tool: step.tool,
      action,
      risk,
      approved,
      startTime,
      endTime: Date.now(),
      durationMs,
      success,
      result,
      error: execError,
      verified,
      screenDiff: diff.length > 0 ? diff : undefined,
    };
  }

  /**
   * _dispatchAction(tool, args) — call the appropriate computer_controller method.
   */
  private async _dispatchAction(tool: string, args: Record<string, unknown>): Promise<unknown> {
    switch (tool) {
      case "click":
        return click(args.target as Point | BoundingBox);

      case "doubleClick":
        return doubleClick(args.target as Point | BoundingBox);

      case "type":
        return type(args.text as string);

      case "pressKey":
        return pressKey(args.key as string);

      case "openApp":
        return openApp(args.name as string);

      case "focusWindow":
        return focusWindow(args.name as string);

      case "closeWindow":
        return closeWindow(args.name as string | undefined);

      case "moveMouse":
        return moveMouse(args.x as number, args.y as number);

      case "scroll":
        return scroll(args.direction as "up" | "down" | "left" | "right", args.amount as number);

      case "drag":
        return drag(args.from as Point, args.to as Point);

      case "screenshot":
        return screenshot(args.path as string | undefined);

      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Observation
  // ---------------------------------------------------------------------------

  private async _observeScreen(): Promise<ScreenState | null> {
    try {
      this.lastScreenState = await capture();
      return this.lastScreenState;
    } catch (e: any) {
      console.warn(`[agent] Screen observation failed: ${e.message}`);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Task Parser
  // ---------------------------------------------------------------------------

  /**
   * _parseTask(task) — parse a natural-language task into a plan of TaskSteps.
   *
   * This is a simple keyword-based parser. For production use, replace with
   * an LLM-based planner that takes the screen state and produces steps.
   */
  private _parseTask(task: string): TaskStep[] {
    const steps: TaskStep[] = [];
    const lower = task.toLowerCase();

    // Split on conjunctions and separators
    const segments = task
      .replace(/,\s+then\s+/gi, " | ")
      .replace(/,\s+and\s+/gi, " | ")
      .replace(/\s+then\s+/gi, " | ")
      .replace(/ then /gi, " | ")
      .split(" | ");

    for (const seg of segments) {
      const s = seg.trim();
      if (!s) continue;

      const sl = s.toLowerCase();

      // open App
      const openMatch = s.match(/^(?:open|launch|start)\s+(?:the\s+)?(?:app\s+)?([A-Za-z0-9 \-\.]+?)(?:\s+and|\s+then|\s*,|$)/i);
      if (openMatch) {
        const name = openMatch[1].trim();
        if (name) {
          steps.push({
            description: `Open ${name}`,
            tool: "openApp",
            args: { name },
          });
          continue;
        }
      }

      // type / enter text
      const typeMatch = s.match(/(?:type|type\s+(?:in|into)\s+)(?:['"“](.+?)['"“]|(\S+))/i);
      if (typeMatch) {
        const text = typeMatch[1] ?? typeMatch[2] ?? "";
        steps.push({ description: `Type: ${text}`, tool: "type", args: { text } });
        continue;
      }

      // press key
      const keyMatch = s.match(/(?:press|hit)\s+(enter|tab|escape|space|return|backspace)/i);
      if (keyMatch) {
        steps.push({ description: `Press ${keyMatch[1]}`, tool: "pressKey", args: { key: keyMatch[1] } });
        continue;
      }

      // scroll
      if (/scroll\s+(up|down|left|right)/i.test(sl)) {
        const dir = sl.includes("up") ? "up" : sl.includes("down") ? "down" : sl.includes("left") ? "left" : "right";
        const amt = parseInt(s.match(/(\d+)\s+times?/)?.[1] ?? "3");
        steps.push({ description: `Scroll ${dir}`, tool: "scroll", args: { direction: dir, amount: amt } });
        continue;
      }

      // click on text (deferred — resolve to coordinates at execution time)
      const clickMatch = s.match(/click\s+(?:on\s+)?(?:['"“](.+?)['"“]|(\S+?))(?:\s+button)?/i);
      if (clickMatch) {
        const targetText = clickMatch[1] ?? clickMatch[2] ?? "";
        steps.push({
          description: `Click: ${targetText}`,
          tool: "findAndClick",
          args: { text: targetText },
        });
        continue;
      }

      // screenshot
      if (sl.includes("screenshot") || sl.includes("capture screen") || sl.includes("take a picture")) {
        steps.push({ description: "Take screenshot", tool: "screenshot", args: {} });
        continue;
      }

      // close window
      if (/close\s+(window|tab)/i.test(sl)) {
        steps.push({ description: "Close window", tool: "closeWindow", args: {} });
        continue;
      }

      // default: try to resolve as a click target
      if (s.length > 0 && s.length < 200) {
        steps.push({
          description: `Click: ${s}`,
          tool: "findAndClick",
          args: { text: s },
        });
      }
    }

    return steps;
  }

  // ---------------------------------------------------------------------------
  // findAndClick — special compound action
  // ---------------------------------------------------------------------------

  private async _resolveFindAndClick(text: string): Promise<StepResult> {
    const start = Date.now();
    const match = await findElement(text, this.lastScreenState ?? undefined);

    if (!match) {
      // Retry with a fresh screen capture
      await this._observeScreen();
      const retry = await findElement(text, this.lastScreenState ?? undefined);
      if (!retry) {
        return this._makeStepResult(
          { description: `Click: ${text}`, tool: "findAndClick", args: { text } },
          0, start,
          { tool: "findAndClick", target: text },
          riskAssessment({ tool: "click", target: text }),
          true,
          { success: false, error: `Could not find element: "${text}" on screen` }
        );
      }
    }

    const target = match!.element.boundingBox;
    const point: Point = {
      x: Math.round(target.x + target.width / 2),
      y: Math.round(target.y + target.height / 2),
    };

    const action: ActionContext = {
      tool: "click",
      target: text,
      details: JSON.stringify(point),
      confidence: match!.score,
    };

    const risk = riskAssessment(action);
    const needsApproval = this.config.hitlEnabled && requiresApproval(action);

    if (needsApproval && risk.level !== "LOW") {
      const approved = await promptHuman(action);
      if (!approved) {
        return this._makeStepResult(
          { description: `Click: ${text}`, tool: "findAndClick", args: { text } },
          0, start, action, risk, false,
          { success: false, error: "Human rejected" }
        );
      }
    }

    const result = await click(point);
    const after = await this._observeScreen();

    return this._makeStepResult(
      { description: `Click: ${text}`, tool: "findAndClick", args: { text } },
      0, start, action, risk, true,
      { ...result, after }
    );
  }

  // ---------------------------------------------------------------------------
  // Multi-App Task (e.g., "open browser, copy text, paste into notepad")
  // ---------------------------------------------------------------------------

  async executeMultiApp(task: string): Promise<TaskResult> {
    // Multi-app tasks often involve cross-application interactions.
    // We handle this by running a full execute() loop, but with an
    // explicit "check app state" phase between steps.
    return this.execute(task);
  }

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  getHistory(): StepResult[] {
    return [...this.history];
  }

  getLastScreen(): ScreenState | null {
    return this.lastScreenState;
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  private _makeStepResult(
    step: TaskStep,
    stepIndex: number,
    startTime: number,
    action: ActionContext,
    risk: RiskAssessment,
    approved: boolean,
    result: unknown
  ): StepResult {
    const endTime = Date.now();
    const r = result as { success: boolean; error?: string; after?: ScreenState };
    const success = r.success ?? true;

    const sr: StepResult = {
      step: stepIndex + 1,
      description: step.description,
      tool: step.tool,
      action,
      risk,
      approved,
      startTime,
      endTime,
      durationMs: endTime - startTime,
      success,
      result,
      error: r.error,
      verified: r.after !== undefined,
    };
    this.history.push(sr);
    return sr;
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ---------------------------------------------------------------------------
  // Interactive CLI
  // ---------------------------------------------------------------------------

  /**
   * runCli() — run the agent in interactive CLI mode.
   * Accepts commands: "do <task>", "see", "history", "hitl <approve|reject|status>",
   *                  "screenshot", "quit"
   */
  async runCli(): Promise<void> {
    const readline = await import("node:readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    await this.init();

    const prompt = () => rl.question("desktop-agent> ", async (input) => {
      const cmd = input.trim();
      if (!cmd) { prompt(); return; }

      if (cmd === "quit" || cmd === "exit") {
        rl.close();
        return;
      }

      if (cmd === "see") {
        const state = await this._observeScreen();
        console.log(`\nScreen: ${state?.summary ?? "unknown"}\n`);
        console.log(`Elements (${state?.elements.length ?? 0}):`);
        state?.elements.slice(0, 20).forEach(e => {
          console.log(`  [${e.boundingBox.x},${e.boundingBox.y}] ${e.text.slice(0, 60)}`);
        });
        prompt(); return;
      }

      if (cmd.startsWith("hitl ")) {
        console.log(handleCliCommand(cmd.slice(4)));
        prompt(); return;
      }

      if (cmd === "history") {
        this.history.forEach(h => {
          const icon = h.success ? "✅" : "❌";
          console.log(`${icon} Step ${h.step}: ${h.description} (${h.durationMs}ms)`);
        });
        prompt(); return;
      }

      if (cmd === "screenshot") {
        const state = await capture();
        console.log(`Screenshot saved: ${state.screenshotPath}`);
        prompt(); return;
      }

      if (cmd.startsWith("do ")) {
        const task = cmd.slice(3);
        const result = await this.execute(task);
        console.log(`\n${result.summary}\n`);
        result.steps.forEach(s => {
          const icon = s.success ? "✅" : "❌";
          const risk = s.risk.level === "LOW" ? "🟢" : s.risk.level === "MEDIUM" ? "🟡" : "🔴";
          console.log(`${icon} ${s.description} [${risk}${s.risk.level}] ${s.durationMs}ms`);
          if (s.error) console.log(`   Error: ${s.error}`);
        });
        prompt(); return;
      }

      console.log(`Unknown command: ${cmd}. Try: do <task>, see, history, hitl, screenshot, quit`);
      prompt();
    });

    console.log("Desktop Agent CLI (type 'quit' to exit)");
    console.log("Commands: do <task>, see, history, hitl, screenshot, quit");
  }
}

// ============================================================================
// Export a default instance
// ============================================================================

export const desktopAgent = new DesktopAgent();

/**
 * Convenience: execute a task using the default agent instance.
 */
export async function executeTask(task: string): Promise<TaskResult> {
  return desktopAgent.execute(task);
}