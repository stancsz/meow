/**
 * lean-agent.ts
 *
 * Meow's lean agent loop using OpenAI SDK.
 * MiniMax-M2.7 via MiniMax's OpenAI-compatible API at https://api.minimax.io.
 */
import OpenAI from "openai";
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
  messages?: any[];
  timeoutMs?: number;
  maxBudgetUSD?: number;  // Maximum budget in USD cents (e.g., 0.50 = 50 cents)
  /** Optional list of tool names to allow. If not set, all tools are available. */
  allowedTools?: string[];
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

/**
 * Generate stream - yields tokens as they arrive.
 * This is the primary streaming interface expected by tests.
 */
export async function* generateStream(
  prompt: string,
  options: LeanAgentOptions = {}
): AsyncGenerator<string> {
  const abortSignal = options.abortSignal;
  const timeoutMs = options.timeoutMs ?? 60000;

  if (abortSignal?.aborted) {
    return;
  }

  const { model, client } = createOpenAIClient(options);
  const systemPrompt = options.systemPrompt || buildSystemPrompt(options.allowedTools);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt },
  ];

  // Combine abortSignal with timeout into a single AbortController
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const cleanup = () => clearTimeout(timer);
  abortSignal?.addEventListener("abort", () => ac.abort());

  let stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;

  try {
    stream = await client.chat.completions.create({
      model,
      messages,
      tools: getOpenAITools(options.allowedTools),
      tool_choice: "auto",
      stream: true,
      signal: ac.signal,
    });
  } catch (e: any) {
    cleanup();
    if (ac.signal.aborted) return;
    throw e;
  }

  for await (const chunk of stream) {
    if (abortSignal?.aborted) {
      cleanup();
      return;
    }

    const delta = chunk.choices[0]?.delta;
    if (delta?.content) {
      yield delta.content;
    }
  }

  cleanup();
}

// ============================================================================
// Streaming Types
// ============================================================================

export interface StreamEvent {
  type: "content" | "tool_start" | "tool_end" | "done" | "error";
  content?: string;
  toolName?: string;
  toolResult?: string;
  error?: string;
}

// ============================================================================
// Cost Estimation
// ============================================================================

const COST_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "MiniMax-M2.7": { input: 0.5, output: 1.5 },
  "gpt-4o": { input: 5, output: 15 },
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

  let totalTokens = estimateTokens(systemMsg.content || "");
  const keptMessages: any[] = [systemMsg];
  let summaryAdded = false;

  for (let i = otherMessages.length - 1; i >= 0; i--) {
    const msg = otherMessages[i];
    const msgContent = msg.content || "";
    const msgTokens = estimateTokens(msgContent) + 10;
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
// OpenAI Client
// ============================================================================

function createOpenAIClient(options: LeanAgentOptions) {
  const apiKey = options.apiKey || process.env.LLM_API_KEY;
  let baseURL = options.baseURL || process.env.LLM_BASE_URL || "https://api.minimax.io";
  // Strip /anthropic suffix and append /v1 for OpenAI SDK compatibility with nginx
  if (baseURL.endsWith("/anthropic")) {
    baseURL = baseURL.replace(/\/anthropic$/, "");
  }
  if (!baseURL.endsWith("/v1")) {
    baseURL = baseURL + "/v1";
  }
  const model = options.model || process.env.LLM_MODEL || "MiniMax-M2.7";

  if (!apiKey) {
    throw new Error("LLM_API_KEY is required");
  }

  const client = new OpenAI({ apiKey, baseURL });

  return { model, client };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Strip AI reasoning blocks from model output.
 * MiniMax uses "</think>" as the delimiter between internal reasoning and final output.
 */
function stripThinkingBlocks(text: string): string {
  // Use index-based extraction to avoid regex delimiter issues with Chinese brackets
  const OPEN = "<think>";
  const CLOSE = "</think>";
  let result = "";
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf(OPEN, i);
    if (start === -1) {
      result += text.slice(i);
      break;
    }
    result += text.slice(i, start);
    const end = text.indexOf(CLOSE, start + OPEN.length);
    if (end === -1) {
      result += text.slice(start);
      break;
    }
    i = end + CLOSE.length;
  }
  return result.trim();
}

// ============================================================================
// System Prompt
// ============================================================================

function buildSystemPrompt(allowedTools?: string[]) {
  const tools = getToolDefinitions(allowedTools);
  const toolList = tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");

  return `You are Agentic Kernel, a lean sovereign autonomous cognitive engine.

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
// Tool Definitions for OpenAI
// ============================================================================

function getOpenAITools(allowedTools?: string[]) {
  return getToolDefinitions(allowedTools).map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
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
  const timeoutMs = options.timeoutMs ?? 60000;
  const maxBudgetUSD = options.maxBudgetUSD;

  if (abortSignal?.aborted) {
    return { content: "Interrupted", iterations: 0, completed: false };
  }

  const { model, client } = createOpenAIClient(options);
  const systemPrompt = options.systemPrompt || buildSystemPrompt(options.allowedTools);

  let messages: OpenAI.Chat.ChatCompletionMessageParam[];
  if (options.messages && options.messages.length > 0) {
    messages = [
      { role: "system", content: systemPrompt },
      ...options.messages,
      { role: "user", content: prompt },
    ];
  } else {
    messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];
  }

  const context = { dangerous, abortSignal, cwd: process.cwd(), timeoutMs };
  let iterations = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCostUSD = 0;
  let lastContent = "";

  while (iterations < maxIterations) {
    if (abortSignal?.aborted) {
      return { content: "Interrupted", iterations, completed: false };
    }

    iterations++;

    try {
      let response: OpenAI.Chat.ChatCompletion;

      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      abortSignal?.addEventListener("abort", () => ac.abort());

      try {
        response = await client.chat.completions.create({
          model,
          messages,
          tools: getOpenAITools(options.allowedTools),
          tool_choice: "auto",
          signal: ac.signal,
        });
      } finally {
        clearTimeout(timer);
        abortSignal?.removeEventListener("abort", () => ac.abort());
      }

      const choice = response.choices[0];
      if (!choice?.message) {
        break;
      }

      const { content, tool_calls } = choice.message;
      lastContent = stripThinkingBlocks(content || "") || lastContent;

      // Push assistant message with tool_calls to messages array
      if (tool_calls && tool_calls.length > 0) {
        messages.push({
          role: "assistant",
          tool_calls: tool_calls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: tc.function,
          })),
        });
      }

      // Track usage if available
      if (response.usage) {
        totalPromptTokens += response.usage.prompt_tokens || 0;
        totalCompletionTokens += response.usage.completion_tokens || 0;
        totalCostUSD = estimateCost(totalPromptTokens, totalCompletionTokens, model);
      }

      // Check budget
      if (maxBudgetUSD !== undefined && totalCostUSD > maxBudgetUSD) {
        return {
          content: lastContent || "Budget exceeded",
          iterations,
          completed: false,
          messages,
          usage: {
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            totalTokens: totalPromptTokens + totalCompletionTokens,
            estimatedCost: totalCostUSD,
          },
        };
      }

      // No tool calls - return content directly
      if (!tool_calls || tool_calls.length === 0) {
        return {
          content: stripThinkingBlocks(content || ""),
          iterations,
          completed: true,
          messages,
          usage: {
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            totalTokens: totalPromptTokens + totalCompletionTokens,
            estimatedCost: totalCostUSD,
          },
        };
      }

      // Execute tool calls
      for (const toolCall of tool_calls) {
        const name = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        const result = await executeTool(name, args, context);

        if (result.error?.startsWith("[shell:BLOCKED]") || result.error?.includes(":BLOCKED]")) {
          return {
            content: result.error,
            iterations,
            completed: false,
            messages,
          };
        }

        // Use tool call ID as-is (OpenAI SDK format)
        const toolId = toolCall.id;

        messages.push({
          role: "tool",
          tool_call_id: toolId,
          content: result.error || result.content,
        });
      }
    } catch (e: any) {
      // Tool-related errors - return what we have so far
      const errorMsg = e?.message || "";
      if (errorMsg.includes("tool") || errorMsg.includes("not found") || errorMsg.includes("empty")) {
        return {
          content: lastContent || "Tool execution failed. " + errorMsg,
          iterations,
          completed: false,
          messages,
        };
      }
      throw e;
    }

    // Check for context compaction
    const totalTokensCalc = messages.reduce((sum, m) => {
      const c = typeof m.content === "string" ? m.content : (m.content ? String(m.content) : "");
      return sum + estimateTokens(c);
    }, 0);
    if (totalTokensCalc > maxTokens) {
      messages = compactMessages(messages, maxTokens);
    }
  }

  return {
    content: lastContent || "Max iterations reached",
    iterations,
    completed: false,
    messages,
    usage: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      estimatedCost: totalCostUSD,
    },
  };
}

// ============================================================================
// Streaming Agent Loop (event-based)
// ============================================================================

export async function* runLeanAgentStream(
  prompt: string,
  options: LeanAgentOptions = {}
): AsyncGenerator<StreamEvent> {
  const maxIterations = options.maxIterations || 10;
  const dangerous = options.dangerous || false;
  const abortSignal = options.abortSignal;
  const timeoutMs = options.timeoutMs ?? 60000;

  if (abortSignal?.aborted) {
    yield { type: "error", error: "Interrupted" };
    return;
  }

  const { model, client } = createOpenAIClient(options);
  const systemPrompt = options.systemPrompt || buildSystemPrompt(options.allowedTools);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt },
  ];

  let iterations = 0;

  while (iterations < maxIterations) {
    if (abortSignal?.aborted) {
      yield { type: "error", error: "Interrupted" };
      return;
    }

    iterations++;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    abortSignal?.addEventListener("abort", () => ac.abort());

    let stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;

    try {
      stream = await client.chat.completions.create({
        model,
        messages,
        tools: getOpenAITools(options.allowedTools),
        tool_choice: "auto",
        stream: true,
        signal: ac.signal,
      });
    } catch (e: any) {
      clearTimeout(timer);
      abortSignal?.removeEventListener("abort", () => ac.abort());
      if (ac.signal.aborted) {
        yield { type: "error", error: "Interrupted" };
        return;
      }
      throw e;
    }

    let fullContent = "";
    let toolCalls: OpenAI.Chat.ChatCompletionMessage.ToolCall[] = [];

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (!delta) continue;

      if (delta.content) {
        fullContent += delta.content;
        yield { type: "content", content: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.id) {
            const existing = toolCalls.find((t) => t.id === tc.id);
            if (!existing) {
              toolCalls.push({ id: tc.id, type: "function", function: { name: tc.function?.name || "", arguments: tc.function?.arguments || "" } });
              yield { type: "tool_start", toolName: tc.function?.name };
            }
          }
          if (tc.function?.arguments) {
            const tcIndex = toolCalls.length - 1;
            if (tcIndex >= 0) {
              toolCalls[tcIndex].function.arguments += tc.function.arguments;
            }
          }
        }
      }
    }

    clearTimeout(timer);
    abortSignal?.removeEventListener("abort", () => ac.abort());

    // No tool calls - done
    if (toolCalls.length === 0) {
      clearTimeout(timer);
      abortSignal?.removeEventListener("abort", () => ac.abort());
      yield { type: "done" };
      return;
    }

    // Execute tool calls
    for (const toolCall of toolCalls) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        args = {};
      }

      const result = await executeTool(toolCall.function.name, args, { dangerous, abortSignal, cwd: process.cwd(), timeoutMs });
      yield { type: "tool_end", toolName: toolCall.function.name, toolResult: result.error || result.content };

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result.error || result.content,
      });
    }
  }

  yield { type: "error", error: "Max iterations reached" };
}

// ============================================================================
// Simple Streaming (returns combined content)
// ============================================================================

export async function runLeanAgentSimpleStream(
  prompt: string,
  options: LeanAgentOptions = {},
  onToken?: TokenHandler
): Promise<AgentResult> {
  const maxIterations = options.maxIterations || 10;
  const dangerous = options.dangerous || false;
  const abortSignal = options.abortSignal;
  const timeoutMs = options.timeoutMs ?? 60000;

  if (abortSignal?.aborted) {
    return { content: "Interrupted", iterations: 0, completed: false };
  }

  const { model, client } = createOpenAIClient(options);
  const systemPrompt = options.systemPrompt || buildSystemPrompt(options.allowedTools);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
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

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    abortSignal?.addEventListener("abort", () => ac.abort());

    let stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;

    try {
      stream = await client.chat.completions.create({
        model,
        messages,
        tools: getOpenAITools(options.allowedTools),
        tool_choice: "auto",
        stream: true,
        signal: ac.signal,
      });
    } catch (e: any) {
      clearTimeout(timer);
      abortSignal?.removeEventListener("abort", () => ac.abort());
      if (ac.signal.aborted) {
        return { content: "Interrupted", iterations, completed: false };
      }
      throw e;
    }

    let toolCalls: OpenAI.Chat.ChatCompletionMessage.ToolCall[] = [];

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (!delta) continue;

      if (chunk.usage) {
        totalPromptTokens = chunk.usage.prompt_tokens || 0;
        totalCompletionTokens = chunk.usage.completion_tokens || 0;
      }

      if (delta.content) {
        fullContent += delta.content;
        onToken?.(delta.content);
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.id) {
            const existing = toolCalls.find((t) => t.id === tc.id);
            if (!existing) {
              toolCalls.push({ id: tc.id, type: "function", function: { name: tc.function?.name || "", arguments: tc.function?.arguments || "" } });
            }
          }
          if (tc.function?.arguments) {
            const tcIndex = toolCalls.length - 1;
            if (tcIndex >= 0) {
              toolCalls[tcIndex].function.arguments += tc.function.arguments;
            }
          }
        }
      }
    }

    clearTimeout(timer);
    abortSignal?.removeEventListener("abort", () => ac.abort());

    // No tool calls - done
    if (toolCalls.length === 0) {
      return {
        content: stripThinkingBlocks(fullContent),
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
    for (const toolCall of toolCalls) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        args = {};
      }

      const result = await executeTool(toolCall.function.name, args, { dangerous, abortSignal, cwd: process.cwd(), timeoutMs });

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result.error || result.content,
      });
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

  const args = process.argv.slice(2);
  const dangerous = args.includes("--dangerous");
  const promptArgs = args.filter((a) => !a.startsWith("--"));
  const prompt = promptArgs.join(" ") || "Hello world";

  console.log(`🐱 Meow lean agent`);
  console.log(`Prompt: ${prompt}\n`);

  try {
    const result = await runLeanAgent(prompt, { dangerous });
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
