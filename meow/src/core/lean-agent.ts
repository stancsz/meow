/**
 * lean-agent.ts
 *
 * Meow's lean agent loop using Anthropic SDK.
 * Supports MiniMax-M2.7 via MiniMax's /anthropic endpoint.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  initializeToolRegistry,
  getToolDefinitions,
  executeTool,
} from "../sidecars/tool-registry.ts";

// ============================================================================
// Types
// ============================================================================

export interface LeanAgentOptions {
  model?: string;
  maxIterations?: number;
  apiKey?: string;
  baseURL?: string;
  dangerous?: boolean;
  systemPrompt?: string;
  abortSignal?: AbortSignal;
  maxTokens?: number;
  messages?: { role: string; content: string }[];
}

export interface AgentResult {
  content: string;
  iterations: number;
  completed: boolean;
  messages?: { role: string; content: string }[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
}

export type TokenHandler = (token: string) => void;

// ============================================================================
// Cost Estimation
// ============================================================================

const COST_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "MiniMax-M2.7": { input: 0.5, output: 1.5 },
  "claude-3-5-sonnet": { input: 3, output: 15 },
  "claude-3-5-haiku": { input: 0.8, output: 4 },
};

function estimateCost(promptTokens: number, completionTokens: number, model: string): number {
  const pricing = COST_PER_MILLION_TOKENS[model] || COST_PER_MILLION_TOKENS["MiniMax-M2.7"];
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  return (inputCost + outputCost) * 100;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function compactMessages(messages: any[], maxTokens: number): any[] {
  if (messages.length <= 4) return messages;

  const systemMsg = messages[0];
  const otherMessages = messages.slice(1);

  let totalTokens = estimateTokens(systemMsg.content);
  const keptMessages: any[] = [systemMsg];
  let summaryAdded = false;

  for (let i = otherMessages.length - 1; i >= 0; i--) {
    const msg = otherMessages[i];
    const msgTokens = estimateTokens(msg.content) + 10;
    if (totalTokens + msgTokens < maxTokens * 0.6) {
      keptMessages.unshift(msg);
      totalTokens += msgTokens;
    } else if (!summaryAdded) {
      keptMessages.unshift({
        role: "system",
        content: `[Previous conversation summarized - ${i} messages condensed]`,
      });
      summaryAdded = true;
      break;
    }
  }

  return keptMessages;
}

// ============================================================================
// Anthropic Client
// ============================================================================

function createAnthropicClient(options: LeanAgentOptions) {
  const apiKey = options.apiKey || process.env.LLM_API_KEY;
  const baseURL = options.baseURL || process.env.LLM_BASE_URL || "https://api.minimax.io/anthropic";
  const model = options.model || process.env.LLM_MODEL || "MiniMax-M2.7";

  if (!apiKey) {
    throw new Error("LLM_API_KEY is required");
  }

  const client = new Anthropic({
    apiKey,
    baseURL,
    defaultHeaders: {
      "anthropic-version": "2023-06-01",
    },
  });

  return { model, client };
}

// ============================================================================
// System Prompt
// ============================================================================

function buildSystemPrompt(): string {
  const tools = getToolDefinitions();
  const toolList = tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");

  return `You are Meow, a lean sovereign agent.

You have access to tools:
${toolList}

When using tools:
1. Parse the user's intent
2. Use minimal necessary tools
3. Prefer safe, read operations when possible
4. Always confirm destructive actions

Respond directly unless tool use is clearly necessary.`;
}

// ============================================================================
// Tool Definitions for Anthropic
// ============================================================================

function getAnthropicTools() {
  return getToolDefinitions().map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

// ============================================================================
// Core Agent Loop (non-streaming)
// ============================================================================

export async function runLeanAgent(
  prompt: string,
  options: LeanAgentOptions = {}
): Promise<AgentResult> {
  const maxIterations = options.maxIterations || 10;
  const dangerous = options.dangerous || false;
  const abortSignal = options.abortSignal;
  const maxTokens = options.maxTokens || 80000;

  if (abortSignal?.aborted) {
    return { content: "Interrupted", iterations: 0, completed: false };
  }

  const { model, client } = createAnthropicClient(options);
  const systemPrompt = options.systemPrompt || buildSystemPrompt();

  let messages: Anthropic.MessageParam[];
  if (options.messages && options.messages.length > 0) {
    messages = [
      { role: "user", content: systemPrompt },
      ...options.messages,
      { role: "user", content: prompt },
    ];
  } else {
    messages = [
      { role: "user", content: systemPrompt },
      { role: "user", content: prompt },
    ];
  }

  const context = { dangerous, abortSignal, cwd: process.cwd() };
  let iterations = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  while (iterations < maxIterations) {
    if (abortSignal?.aborted) {
      return { content: "Interrupted", iterations, completed: false };
    }

    iterations++;

    const response = await client.messages.create({
      model,
      messages,
      tools: getAnthropicTools(),
      max_tokens: 4096,
    });

    if (response.usage) {
      totalPromptTokens += response.usage.input_tokens || 0;
      totalCompletionTokens += response.usage.output_tokens || 0;
    }

    let textContent = "";
    const toolUses: Anthropic.ToolUseBlock[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        textContent += block.text;
      } else if (block.type === "tool_use") {
        toolUses.push(block);
      }
    }

    if (toolUses.length === 0) {
      return {
        content: textContent || "",
        iterations,
        completed: true,
        messages,
        usage: {
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens: totalPromptTokens + totalCompletionTokens,
          estimatedCost: estimateCost(totalPromptTokens, totalCompletionTokens, model),
        },
      };
    }

    for (const toolUse of toolUses) {
      const result = await executeTool(toolUse.name, toolUse.input, context);

      if (result.error?.startsWith("[shell:BLOCKED]") || result.error?.includes(":BLOCKED]")) {
        return {
          content: result.error,
          iterations,
          completed: false,
          messages,
          usage: {
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            totalTokens: totalPromptTokens + totalCompletionTokens,
            estimatedCost: estimateCost(totalPromptTokens, totalCompletionTokens, model),
          },
        };
      }

      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: result.error || result.content,
          },
        ],
      });
    }

    const totalTokensCalc = messages.reduce((sum, m) => {
      const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      return sum + estimateTokens(content);
    }, 0);
    if (totalTokensCalc > maxTokens) {
      messages = compactMessages(messages, maxTokens);
    }
  }

  return {
    content: "Max iterations reached",
    iterations,
    completed: false,
    messages,
    usage: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      estimatedCost: estimateCost(totalPromptTokens, totalCompletionTokens, model),
    },
  };
}

// ============================================================================
// Streaming Agent Loop
// ============================================================================

interface CapturedTool {
  id: string;
  name: string;
  input: string;
}

export async function runLeanAgentSimpleStream(
  prompt: string,
  options: LeanAgentOptions = {},
  onToken?: TokenHandler
): Promise<AgentResult> {
  const maxIterations = options.maxIterations || 10;
  const dangerous = options.dangerous || false;
  const abortSignal = options.abortSignal;

  if (abortSignal?.aborted) {
    return { content: "Interrupted", iterations: 0, completed: false };
  }

  const { model, client } = createAnthropicClient(options);
  const systemPrompt = options.systemPrompt || buildSystemPrompt();

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: systemPrompt },
    { role: "user", content: prompt },
  ];

  let fullContent = "";
  let iterations = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  while (iterations < maxIterations) {
    if (abortSignal?.aborted) {
      return { content: "Interrupted", iterations, completed: false };
    }

    iterations++;
    let streamFinished = false;
    const capturedTools: CapturedTool[] = [];
    let currentTool: CapturedTool | null = null;
    let inputTokens = 0;

    const stream = await client.messages.stream({
      model,
      messages,
      tools: getAnthropicTools(),
      max_tokens: 4096,
    });

    for await (const event of stream) {
      if (event.type === "message_delta") {
        if (event.usage) {
          totalCompletionTokens += event.usage.output_tokens || 0;
        }
      }

      if (event.type === "message_start") {
        // Could capture usage here if needed
      }

      if (event.type === "content_block_start") {
        const block = event.content_block;
        if (block.type === "tool_use") {
          currentTool = { id: block.id, name: block.name, input: "" };
          capturedTools.push(currentTool);
        }
      }

      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          const text = event.delta.text;
          fullContent += text;
          onToken?.(text);
        } else if (event.delta.type === "input_json_delta" && currentTool) {
          currentTool.input += (event.delta as any).partial_json || "";
        }
      }

      if (event.type === "message_stop") {
        streamFinished = true;
        break;
      }
    }

    if (!streamFinished) {
      stream.controller.abort();
      return {
        content: "Interrupted",
        iterations,
        completed: false,
        usage: totalPromptTokens > 0 || totalCompletionTokens > 0 ? {
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens: totalPromptTokens + totalCompletionTokens,
          estimatedCost: estimateCost(totalPromptTokens, totalCompletionTokens, model),
        } : undefined,
      };
    }

    // No tool calls - done
    if (capturedTools.length === 0) {
      return {
        content: fullContent,
        iterations,
        completed: true,
        messages,
        usage: {
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens: totalPromptTokens + totalCompletionTokens,
          estimatedCost: estimateCost(totalPromptTokens, totalCompletionTokens, model),
        },
      };
    }

    // Execute tool calls and continue
    for (const tool of capturedTools) {
      let toolArgs: Record<string, unknown>;
      try {
        toolArgs = JSON.parse(tool.input);
      } catch {
        toolArgs = {};
      }

      const result = await executeTool(tool.name, toolArgs, { dangerous, abortSignal, cwd: process.cwd() });

      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result" as const,
            tool_use_id: tool.id,
            content: result.error || result.content,
          },
        ],
      });
    }

    // First iteration prompt tokens
    if (iterations === 1 && capturedTools.length > 0) {
      // Estimate input tokens from message content
      inputTokens = Math.ceil(JSON.stringify(messages).length / 4);
      totalPromptTokens = inputTokens;
    }
  }

  return {
    content: fullContent || "Max iterations reached",
    iterations,
    completed: false,
    usage: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      estimatedCost: estimateCost(totalPromptTokens, totalCompletionTokens, model),
    },
  };
}

// ============================================================================
// CLI Entry
// ============================================================================

if (import.meta.main) {
  await initializeToolRegistry();

  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const prompt = args.join(" ") || "Hello world";

  console.log(`🐱 Meow lean agent`);
  console.log(`Prompt: ${prompt}\n`);

  try {
    const result = await runLeanAgent(prompt);
    console.log(`\n✅ Completed in ${result.iterations} iteration(s)`);
    if (result.usage) {
      console.log(`[${result.usage.totalTokens} tokens · ~$${result.usage.estimatedCost.toFixed(2)}]`);
    }
    console.log(`\n--- Output ---\n${result.content}`);
  } catch (e: any) {
    console.error(`❌ Error: ${e.message}`);
    process.exit(1);
  }
}
