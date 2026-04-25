#!/usr/bin/env bun
/**
 * meow-stream.ts - Streaming Meow Agent Runner
 *
 * Thin launcher that runs lean-agent's runLeanAgentSimpleStream().
 * Tokens are streamed to stdout via onToken callback for real-time display.
 * EPOCH 17: Also emits state change events to stderr for relay integration.
 */
import { AgentState, runLeanAgentSimpleStream } from "@meow/kernel";

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const prompt = args.join(" ") || "Hello world";

  console.error(`[meow-stream] Starting lean-agent streaming with prompt: ${prompt.slice(0, 80)}...`);
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
      { dangerous, timeoutMs, onStateChange }, // EPOCH 17: pass onStateChange in options
      (token) => {
        // Stream each token to stdout for real-time display
        process.stdout.write(token);
      }
    );

    console.error(`\n[meow-stream] Completed in ${result.iterations} iteration(s)`);
    if (result.usage) {
      console.error(`[${result.usage.totalTokens} tokens]`);
    }
  } catch (e: any) {
    console.error(`[meow-stream] Error: ${e.message}`);
    process.exit(1);
  }
}

main();