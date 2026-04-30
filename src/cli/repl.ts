import * as p from "@clack/prompts";
import pc from "picocolors";
import { Agent } from "../agent/agent";
import { resolve } from "path";
import { SPECIALISTS, summon } from "../agent/summoner";
import { DEFAULT_TOOLS } from "../types/tool";
import { Orchestrator } from "../orchestrator/Orchestrator";

export function createRepl(agent: Agent) {
  let orchestrator: Orchestrator | null = null;
  let parallelMode = false;

  // Helper: Get terminal width for dynamic box drawing
  const getTerminalWidth = (): number => {
    return process.stdout.columns || 80;
  };

  // Helper: Create box line with dynamic width
  const boxLine = (char: string, width: number): string => {
    const usableWidth = width - 4; // Account for "│  " prefix and suffix
    return char.repeat(Math.max(usableWidth, 10));
  };

  // Helper: Sanitize line for display inside box frame
  // Replaces box-drawing characters that would conflict with frame
  const sanitizeForBox = (line: string): string => {
    // Replace problematic box-drawing chars with space-compatible alternatives
    return line.replace(/[┌┐└┘├┤┬┴┼│─]/g, (c) => {
      const map: Record<string, string> = {
        '│': '│',  // Keep vertical but it's still problematic inside frame
        '─': '-',
        '┌': '+',
        '┐': '+',
        '└': '+',
        '┘': '+',
        '├': '+',
        '┤': '+',
        '┬': '+',
        '┴': '+',
        '┼': '+',
      };
      return map[c] || c;
    });
  };

  return {
    async start() {
      process.stdout.write("\x1Bc"); // Clear terminal

      console.log(pc.bold(pc.cyan("MEOW")) + pc.dim(" | ") + pc.white("Lightweight AI Coding Agent"));
      console.log(pc.dim("Sovereign Mode: Commands, Files, Escalation Active\n"));

      while (true) {
        const input = await p.text({
          message: pc.bold(pc.cyan(">>")),
          placeholder: "",
          validate(value) {
            if (!value || value.length === 0) return "Please enter a message";
          },
        });

        if (p.isCancel(input)) {
          console.log(pc.cyan("\nGoodbye!"));
          process.exit(0);
        }

        const text = input as string;

        // Handle Commands
        if (text.startsWith("/")) {
          const [cmd, ...args] = text.slice(1).split(" ");
          const argString = args.join(" ");

          switch (cmd) {
            case "exit":
            case "quit":
              console.log(pc.cyan("Goodbye!"));
              process.exit(0);
              break;

            case "clear":
              process.stdout.write("\x1Bc");
              agent.clearHistory();
              console.log(pc.bold(pc.cyan("MEOW")) + pc.dim(" | ") + pc.white("Context Cleared\n"));
              break;

            case "help":
              console.log(pc.bold("\nCommands:"));
              console.log(pc.cyan("  /add <file>    ") + pc.dim("- Add file to context"));
              console.log(pc.cyan("  /drop <file>   ") + pc.dim("- Remove file from context"));
              console.log(pc.cyan("  /files         ") + pc.dim("- List files in context"));
              console.log(pc.cyan("  /clear         ") + pc.dim("- Clear context and screen"));
              console.log(pc.cyan("  /parallel      ") + pc.dim("- Toggle parallel orchestrator mode"));
              console.log(pc.cyan("  /status        ") + pc.dim("- Show orchestrator status"));
              console.log(pc.cyan("  /exit          ") + pc.dim("- Exit REPL\n"));
              break;

            case "files":
              const files = agent.getFiles();
              if (files.length === 0) {
                console.log(pc.cyan("No files in context."));
              } else {
                console.log(pc.bold("\nFiles in Context:"));
                files.forEach(f => console.log(pc.dim(`  - ${f}`)));
                console.log("");
              }
              break;

            case "parallel":
              if (parallelMode) {
                parallelMode = false;
                orchestrator = null;
                console.log(pc.yellow("Parallel mode disabled [OFF]. Using sequential execution."));
              } else {
                parallelMode = true;
                orchestrator = new Orchestrator(agent);
                console.log(pc.green("Parallel mode enabled [ON]. Use '/' delimited tasks for parallel execution."));
              }
              continue;

            case "status":
              if (orchestrator) {
                const status = orchestrator.getStatus();
                console.log(pc.bold("\n## Orchestrator Status:"));
                console.log(`  Queue: ${JSON.stringify(status.queue, null, 2).split('\n').map(l => pc.dim(l)).join('\n')}`);
                console.log(pc.dim(`  Workers: ${status.workers}`));
                console.log(pc.dim(`  Locked Files: ${status.lockedFiles}\n`));
              } else {
                console.log(pc.dim("Orchestrator not initialized. Use /parallel to enable."));
              }
              continue;

            default:
              console.log(pc.red(`Unknown command: /${cmd}`));
          }
          continue;
        }

        // Check for "/" delimited explicit tasks
        const hasExplicitTasks = text.includes(" / ");

        const s = p.spinner();
        s.start(pc.dim(parallelMode || hasExplicitTasks ? "Orchestrating..." : "Thinking..."));

        try {
          let response: string;

          if (parallelMode || hasExplicitTasks) {
            if (!orchestrator) {
              orchestrator = new Orchestrator(agent);
            }

            const result = await orchestrator.execute(
              text,
              {
                tasks: hasExplicitTasks ? text : undefined,
                onStatus: (update: any) => {
                  if (update.progress) {
                    s.message(pc.dim(`${update.progress.label}: ${update.progress.current}/${update.progress.total}`));
                  } else {
                    s.message(pc.dim(update.message));
                  }
                }
              }
            );

            response = result.summary;
          } else {
            response = await agent.chat(
              text,
              false,
              undefined,
              (status) => {
                // Robust status color: use dim by default, but show important statuses clearly
                const isImportant = /error|warning|⚠️|❌|failed|critical/i.test(status);
                const message = isImportant ? pc.yellow(status) : pc.dim(status);
                s.message(message);
              }
            );
          }

          s.stop(pc.dim("Done"));

          // Premium Response Rendering with dynamic box width
          console.log("");
          const termWidth = getTerminalWidth();
          const dashLine = boxLine("─", termWidth);
          const headerLine = pc.bold(pc.cyan("┌── MEOW ─" + dashLine));
          const footerLine = pc.bold(pc.cyan("└" + dashLine));
          console.log(headerLine);

          const coloredResponse = response
            .replace(/^# (.*)/gm, (_, m) => pc.bold(pc.cyan(m)))
            .replace(/^## (.*)/gm, (_, m) => pc.bold(pc.white(m)))
            .replace(/\*\*(.*?)\*\*/g, (_, m) => pc.bold(pc.white(m)))
            .replace(/`(.*?)`/g, (_, m) => pc.yellow(m));

          console.log(coloredResponse.split("\n").map(line => pc.bold(pc.cyan("│  ")) + sanitizeForBox(line)).join("\n"));
          console.log(footerLine);
          console.log("");

        } catch (err) {
          const errorMsg = String(err).length > 100 ? String(err).substring(0, 100) + "..." : String(err);
          s.stop(pc.red("Error: " + errorMsg));
        }
      }
    },
  };
}