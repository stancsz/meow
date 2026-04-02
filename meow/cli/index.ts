/**
 * CLI entry point for Meow
 *
 * Usage:
 *   bun run start                    # Interactive mode
 *   bun run start "your prompt"     # Single task mode
 */
import * as readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { runLeanAgent } from "../src/core/lean-agent.ts";

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

async function main() {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    // Single task mode
    const prompt = args.join(" ");
    console.log(`${colors.dim}🐱 meow${colors.reset}\n`);
    console.log(`${colors.dim}Prompt: ${prompt}${colors.reset}\n`);

    try {
      const result = await runLeanAgent(prompt);
      console.log(`\n${colors.green}✅ Completed in ${result.iterations} iteration(s)${colors.reset}`);
      console.log(`\n--- Output ---\n${result.content}`);
    } catch (e: any) {
      console.error(`${colors.red}❌ Error: ${e.message}${colors.reset}`);
      process.exit(1);
    }
    return;
  }

  // Interactive mode
  console.log(`${colors.blue}${colors.bold}🐱 meow — lean sovereign agent${colors.reset}`);
  console.log(`${colors.dim}Type /help for commands. Type /exit to quit.${colors.reset}\n`);

  const rl = readline.createInterface({ input, output });
  const history: string[] = [];

  const printHelp = () => {
    console.log(`${colors.bold}Commands:${colors.reset}`);
    console.log(`  ${colors.green}/help${colors.reset}   Show this help`);
    console.log(`  ${colors.green}/exit${colors.reset}  Exit meow`);
    console.log(`  ${colors.green}/clear${colors.reset} Clear screen`);
    console.log();
  };

  const handleLine = async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

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
      return;
    }

    // Add to history
    history.push(trimmed);

    // Run agent
    try {
      const result = await runLeanAgent(trimmed);
      console.log(`\n${colors.green}✅ Done in ${result.iterations} iteration(s)${colors.reset}`);
      console.log(`\n--- ---\n${result.content}\n`);
    } catch (e: any) {
      console.error(`${colors.red}❌ Error: ${e.message}${colors.reset}\n`);
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
    process.stdout.write("\x1B[?25h");
    process.exit(0);
  });

  promptUser();
}

main();
