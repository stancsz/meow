/**
 * CLI entry point for Meow
 *
 * Usage:
 *   bun run start                    # Interactive mode
 *   bun run start "your prompt"     # Single task mode
 *   bun run start --dangerous "cmd"  # Single task with shell auto-approve
 */
import * as readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { runLeanAgent, type LeanAgentOptions } from "../src/core/lean-agent.ts";

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

const prefix = `${colors.cyan}${colors.bold}🐱 meow > ${colors.reset}`;
const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// ============================================================================
// CLI Helpers
// ============================================================================

function setCursorVisible(visible: boolean): void {
  process.stdout.write(visible ? "\x1B[?25h" : "\x1B[?25l");
}

function eraseLine(): void {
  process.stdout.write("\x1B[2K");
}

function moveCursorUp(lines: number = 1): void {
  process.stdout.write(`\x1B[${lines}A`);
}

async function withSpinner<T>(
  promise: Promise<T>,
  message: string = "thinking..."
): Promise<T> {
  let frame = 0;
  let interrupted = false;

  const spin = async () => {
    while (!interrupted) {
      process.stdout.write(`${colors.dim}${spinnerFrames[frame % spinnerFrames.length]} ${message}${colors.reset}\r`);
      frame++;
      await new Promise((r) => setTimeout(r, 80));
    }
    eraseLine();
  };

  const spinPromise = spin();
  try {
    const result = await promise;
    interrupted = true;
    await spinPromise;
    return result;
  } catch (e) {
    interrupted = true;
    await spinPromise;
    throw e;
  }
}

// ============================================================================
// Message History (Conversation Context)
// ============================================================================

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

const conversation: Message[] = [];

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  let dangerous = false;

  // Parse --dangerous flag
  const filteredArgs = args.filter((arg) => {
    if (arg === "--dangerous" || arg === "-d") {
      dangerous = true;
      return false;
    }
    return true;
  });

  if (filteredArgs.length > 0) {
    // Single task mode
    const prompt = filteredArgs.join(" ");
    console.log(`${colors.dim}🐱 meow${colors.reset}\n`);
    console.log(`${colors.dim}Prompt: ${prompt}${colors.reset}\n`);

    setCursorVisible(false);
    try {
      const result = await withSpinner(
        runLeanAgent(prompt, { dangerous }),
        "thinking..."
      );
      console.log(`\n${colors.green}✅ Done in ${result.iterations} iteration(s)${colors.reset}`);
      console.log(`\n--- Output ---\n${result.content}`);
    } catch (e: any) {
      console.error(`\n${colors.red}❌ Error: ${e.message}${colors.reset}`);
      process.exit(1);
    } finally {
      setCursorVisible(true);
    }
    return;
  }

  // Interactive mode
  console.log(`${colors.blue}${colors.bold}🐱 meow — lean sovereign agent${colors.reset}`);
  console.log(`${colors.dim}Type /help for commands. Type /exit to quit.${colors.reset}\n`);

  const systemPrompt = buildSystemPrompt();
  conversation.push({ role: "system", content: systemPrompt });

  const rl = readline.createInterface({ input, output });

  const printHelp = () => {
    console.log(`${colors.bold}Commands:${colors.reset}`);
    console.log(`  ${colors.green}/help${colors.reset}    Show this help`);
    console.log(`  ${colors.green}/exit${colors.reset}   Exit meow`);
    console.log(`  ${colors.green}/clear${colors.reset}  Clear screen and conversation`);
    console.log(`  ${colors.green}/plan${colors.reset}   Plan mode: show intent before executing`);
    console.log(`  ${colors.green}/dangerous${colors.reset} Toggle dangerous mode (auto-approve shell)`);
    console.log();
  };

  const runAgent = async (prompt: string, options: LeanAgentOptions = {}) => {
    setCursorVisible(false);
    try {
      const result = await withSpinner(
        runLeanAgent(prompt, { dangerous, ...options }),
        "thinking..."
      );
      console.log(`\n${colors.green}✅ Done in ${result.iterations} iteration(s)${colors.reset}`);
      console.log(`\n--- ---\n${result.content}\n`);
      return result;
    } catch (e: any) {
      console.error(`\n${colors.red}❌ Error: ${e.message}${colors.reset}\n`);
      throw e;
    } finally {
      setCursorVisible(true);
    }
  };

  const runPlanMode = async (prompt: string) => {
    const planPrompt = `You are in PLAN MODE. Only output a structured plan of what you would do. Do NOT execute anything. Format your response as:

## Plan
1. [Step description]
2. [Step description]
...

## Tools to use
- list only the tools you'll use

## Risks
- note any destructive or risky operations

Respond with ONLY the plan.`;

    conversation.push({ role: "user", content: prompt });
    conversation.push({ role: "assistant", content: planPrompt });

    setCursorVisible(false);
    try {
      const result = await withSpinner(
        runLeanAgent(planPrompt, { dangerous, systemPrompt }),
        "planning..."
      );

      console.log(`\n${colors.bold}${colors.yellow}━━━ Plan ━━━${colors.reset}\n`);
      console.log(result.content);
      console.log();

      // Ask for confirmation
      const rlConfirm = readline.createInterface({ input, output });
      const answer = await new Promise<string>((resolve) => {
        rlConfirm.question(
          `${colors.bold}Execute this plan? [y/N] ${colors.reset}`,
          (ans) => resolve(ans)
        );
      });
      rlConfirm.close();

      if (answer.toLowerCase() === "y") {
        // Remove plan prompt and assistant response, add user prompt
        conversation.pop();
        conversation.pop();
        conversation.push({ role: "user", content: prompt });
        await runAgent(prompt);
      } else {
        console.log(`${colors.dim}Plan cancelled.${colors.reset}\n`);
        // Remove plan prompt from conversation
        conversation.pop();
        conversation.pop();
      }
    } catch (e: any) {
      console.error(`\n${colors.red}❌ Error: ${e.message}${colors.reset}\n`);
    } finally {
      setCursorVisible(true);
    }
  };

  const handleLine = async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Built-in commands
    if (trimmed === "/exit") {
      console.log(`${colors.yellow}Goodbye!${colors.reset}`);
      rl.close();
      return;
    }

    if (trimmed === "/help") {
      printHelp();
      return;
    }

    if (trimmed === "/clear") {
      console.clear();
      console.log(`${colors.blue}${colors.bold}🐱 meow — lean sovereign agent${colors.reset}\n`);
      conversation.length = 0;
      conversation.push({ role: "system", content: buildSystemPrompt() });
      return;
    }

    if (trimmed === "/dangerous") {
      dangerous = !dangerous;
      console.log(
        `${dangerous ? colors.red : colors.green}Dangerous mode: ${dangerous ? "ON" : "OFF"}${colors.reset}\n`
      );
      return;
    }

    if (trimmed.startsWith("/plan ")) {
      const prompt = trimmed.slice(6);
      await runPlanMode(prompt);
      return;
    }

    // Run agent with conversation context
    conversation.push({ role: "user", content: trimmed });
    try {
      await runAgent(trimmed);
    } catch (e) {
      // Error already printed
    }
  };

  const promptUser = () => {
    rl.question(prefix, async (line) => {
      await handleLine(line);
      if (!rl.closed) {
        promptUser();
      }
    });
  };

  rl.on("close", () => {
    setCursorVisible(true);
    process.stdout.write("\n");
    process.exit(0);
  });

  // Handle Ctrl+C gracefully
  process.on("SIGINT", () => {
    setCursorVisible(true);
    console.log(`\n${colors.yellow}Interrupted. Use /exit to quit.${colors.reset}\n`);
  });

  promptUser();
}

function buildSystemPrompt(): string {
  return `You are Meow, a lean sovereign agent.

You have access to tools:
- read(path) → read file contents
- write(path, content) → write content to file
- shell(cmd) → execute shell command
- git(cmd) → execute git command

When using tools:
1. Parse the user's intent
2. Use minimal necessary tools
3. Prefer safe, read operations when possible
4. Always confirm destructive actions

Respond directly unless tool use is clearly necessary.`;
}

main();
