import { runLeanAgentSimpleStream } from "../agent-kernel/src/core/lean-agent.ts";
import { AgentState } from "./core/agent-types";

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const prompt = args.join(" ") || "Hello world";

  console.error(`[meow-stream] meow-stream runner starting...`);
  console.error(`[meow-stream] cwd: ${process.cwd()}`);

  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS || "300000");
  const dangerous = args.includes("--dangerous");

  // EPOCH 17: State change handler - emits to stderr for relay to parse
  const onStateChange = (state: AgentState, message?: string) => {
    const msg = message ? ` ${message}` : "";
    console.error(`[state:${state}]${msg}`);
  };

  try {
    const result = await runLeanAgentSimpleStream(
      prompt,
      { dangerous, timeoutMs, onStateChange },
      (token) => {
        process.stdout.write(token);
      }
    );

    console.error(`\n[meow-stream] Completed in ${result.iterations} iteration(s)`);
    if (result.usage) {
      console.error(`[${result.usage.totalTokens} tokens]`);
    }

    // EPOCH 24: Output the final result as JSON for harness-level hooks
    // Prefixed with [RESULT] so the client can find it at the end of the stream
    process.stdout.write(`\n[RESULT]${JSON.stringify(result)}\n`);
  } catch (e: any) {
    console.error(`[meow-stream] Error: ${e.message}`);
    process.exit(1);
  }
}

main();