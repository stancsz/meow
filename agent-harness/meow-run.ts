#!/usr/bin/env bun
/**
 * meow-run.ts - Meow Agent Runner
 *
 * Thin launcher that runs the Meow agent inside Docker.
 * Agent-kernel is mounted at /app/agent-kernel, node_modules at /app/node_modules.
 *
 * We use @anthropic-ai/sdk for the API (MiniMax supports /v1/messages)
 * since the OpenAI SDK fails with 404 on /v1/chat/completions.
 */
import { initializeToolRegistry } from "/app/agent-kernel/src/sidecars/tool-registry.ts";
import { registerSignalHandlers } from "/app/agent-kernel/src/sidecars/auto-mode.ts";
import { getAllTools } from "/app/agent-kernel/src/sidecars/tool-registry.ts";

const { Anthropic } = require("/app/node_modules/@anthropic-ai/sdk");

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const prompt = args.join(" ") || "Hello world";

  console.error(`[meow-run] Starting...`);
  console.error(`[meow-run] LLM_API_KEY: ${process.env.LLM_API_KEY ? "(set)" : "(missing)"}`);
  console.error(`[meow-run] LLM_BASE_URL: ${process.env.LLM_BASE_URL}`);
  console.error(`[meow-run] cwd: ${process.cwd()}`);

  await initializeToolRegistry();
  registerSignalHandlers();

  const tools = getAllTools();
  const toolList = tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");

  const systemPrompt = `You are Meow, a lean sovereign autonomous cognitive engine.

You have access to tools:
${toolList}

When using tools:
1. Parse the user's intent
2. Use minimal necessary tools
3. Prefer safe, read operations when possible
4. Always confirm destructive actions

Respond directly unless tool use is clearly necessary.`;

  const apiKey = process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY;
  const baseURL = process.env.LLM_BASE_URL || "https://api.minimax.io/anthropic";

  const client = new Anthropic({ apiKey, baseURL });

  let iterations = 0;
  const maxIterations = 5;
  let messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: prompt }
  ];

  while (iterations < maxIterations) {
    iterations++;
    console.error(`[meow-run] Iteration ${iterations}: sending ${messages.length} messages`);

    const response = await client.messages.create({
      model: process.env.LLM_MODEL || "MiniMax-M2.7",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages as any,
    });

    const text = response.content.find((c: any) => c.type === "text")?.text || "";
    const thinking = response.content.find((c: any) => c.type === "thinking")?.thinking || "";

    console.error(`[meow-run] Response (${text.length} chars)`);

    // For now, just output the text response
    // Tool execution would go here in a full implementation
    if (text) {
      console.log(text);
      break;
    }

    if (iterations >= maxIterations) {
      console.log(text || "(no response)");
    }
  }

  console.error(`[meow-run] Done. ${iterations} iteration(s).`);
}

main().catch((e) => {
  console.error("Meow error:", e.message);
  process.exit(1);
});