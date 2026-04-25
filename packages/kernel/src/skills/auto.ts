/**
 * auto.ts
 *
 * Built-in /auto skill for controlling autonomous OODA loop mode.
 * Allows starting/stopping auto mode and configuring tick settings.
 *
 * GAP-AUTO-01: Improves auto-agent.ts tick/auto modes by wiring in
 * the InterruptController for proper interrupt handling.
 */
import { type Skill, type SkillContext, type SkillResult } from "./loader.ts";
import {
  getInterruptController,
  resetInterruptController,
  registerSignalHandlers,
  buildAutoAgentOptions,
  formatTickMonitor,
  createTickMonitor,
  requestStopAfterTick,
  setTerminalFocus,
} from "../sidecars/auto-mode.ts";
import { runAutoAgent, formatAutoResults } from "../core/auto-agent.ts";

export const auto: Skill = {
  name: "auto",
  description: "Run autonomous OODA loop with interrupt handling",
  aliases: ["tick", "autonomous"],

  async execute(args: string, ctx: SkillContext): Promise<SkillResult> {
    // Register signal handlers for graceful shutdown
    registerSignalHandlers();

    const parts = args.trim().split(/\s+/);
    const subcmd = parts[0]?.toLowerCase() || "run";
    const remaining = parts.slice(1).join(" ");

    switch (subcmd) {
      case "stop": {
        requestStopAfterTick();
        return { content: "Stop requested after current tick." };
      }

      case "status": {
        const ic = getInterruptController();
        const monitor = createTickMonitor();
        return {
          content: "Auto mode status:\n" +
            "  stop requested: " + ic.shouldStop() + "\n" +
            "  stop now: " + ic.shouldStopNow() + "\n" +
            "  tick monitor: " + formatTickMonitor(monitor),
        };
      }

      case "focus": {
        const focused = remaining.toLowerCase() !== "blur";
        setTerminalFocus(focused);
        return { content: "Terminal focus set to: " + (focused ? "focused" : "blurred") };
      }

      case "run":
      case "start":
      default: {
        // Run the OODA loop
        const prompt = remaining || "Continue monitoring and improving the project.";
        const isTick = subcmd === "tick";

        resetInterruptController();

        try {
          const result = await runAutoAgent(prompt, {
            ...buildAutoAgentOptions({
              tickMode: isTick,
              ghostMode: true,
              autoCommit: ctx.dangerous,
              autoPush: ctx.dangerous,
            }),
            dangerous: ctx.dangerous,
          });

          let output = "## Autonomous Operation Complete\n\n";

          output += "Ticks: " + result.ticks + " | Iterations: " + result.finalResult.iterations + "\n";
          if (result.results.length > 0 && isTick) {
            output += "\n" + formatAutoResults(result.results);
          }
          output += "\n--- Output ---\n" + result.finalResult.content;
          return { content: output };
        } catch (e: any) {
          if (e.message === "Interrupted") {
            return { content: "Autonomous operation interrupted by user." };
          }
          return { content: "", error: e.message };
        }
      }
    }
  },
};