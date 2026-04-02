/**
 * lean-agent.ts
 *
 * Meow's lean agent loop. Inspired by Claude Code's core pattern:
 * User → messages[] → LLM API → response
 *                        ↓
 *             tool_use? → execute → loop
 *             else → return text
 *
 * CORE: ~60 lines of core logic. Tools come from tool-registry sidecar.
 */
import OpenAI from "openai";
import {
  type Tool,
  type ToolDefinition,
  type ToolResult,
  initializeToolRegistry,
  getToolDefinitions,
  getTool,
  executeTool,
} from "../sidecars/tool-registry.ts";

// ============================================================================
// Types
// ============================================================================

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface LeanAgentOptions {
  model?: string;
  maxIterations?: number;
  apiKey?: string;
  baseURL?: string;
  dangerous?: boolean;
  systemPrompt?: string;
  abortSignal?: AbortSignal;
  maxTokens?: number;  // Max tokens before compaction (default ~80k)
  // Message accumulation for multi-turn conversations
  messages?: any[];    // Existing conversation history to continue
}

// ============================================================================
// Context Compaction
// ============================================================================

function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English
  return Math.ceil(text.length / 4);
}

function compactMessages(messages: any[], maxTokens: number): any[] {
  if (messages.length <= 4) return messages;  // Keep system + 1-2 exchanges minimum

  const systemMsg = messages[0];
  const otherMessages = messages.slice(1);

  let totalTokens = estimateTokens(systemMsg.content);

  // Find how many messages we can keep
  const keptMessages: any[] = [systemMsg];
  let summaryAdded = false;

  for (let i = otherMessages.length - 1; i >= 0; i--) {
    const msg = otherMessages[i];
    const msgTokens = estimateTokens(msg.content) + 10;  // overhead per message
    if (totalTokens + msgTokens < maxTokens * 0.6) {
      keptMessages.unshift(msg);
      totalTokens += msgTokens;
    } else if (!summaryAdded) {
      // Replace remaining messages with a summary
      const summarizedContent = `[Previous conversation summarized - ${i} messages condensed]`;
      keptMessages.unshift({
        role: "system",
        content: summarizedContent,
      });
      summaryAdded = true;
      break;
    }
  }

  return keptMessages;
}

export interface AgentResult {
  content: string;
  iterations: number;
  completed: boolean;
  messages?: any[];  // Updated conversation for accumulation
}

// ============================================================================
// Streaming Types
// ============================================================================

export interface StreamEvent {
  type: "content" | "tool_start" | "tool_end" | "done" | "error";
  content?: string;
  toolId?: string;
  toolName?: string;
  toolResult?: string;
  error?: string;
  // When true, caller should submit tool result back to LLM and continue
  needsContinuation?: boolean;
}

export type TokenHandler = (token: string) => void;

// ============================================================================
// LLM Client
// ============================================================================

function createLLMClient(options: LeanAgentOptions) {
  const apiKey = options.apiKey || process.env.LLM_API_KEY;
  const baseURL = options.baseURL || process.env.LLM_BASE_URL || "https://api.minimax.io/v1";
  const model = options.model || process.env.LLM_MODEL || "MiniMax-M2.7";

  if (!apiKey) {
    throw new Error("LLM_API_KEY is required");
  }

  const client = new OpenAI({ apiKey, baseURL });

  return {
    model,
    client,
    generate: async (messages: any[]) => {
      const response = await client.chat.completions.create({
        model,
        messages,
        tools: getToolDefinitions().map((t) => ({
          type: "function" as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
      });
      return response;
    },
    generateStream: async function* (messages: any[], onToken?: TokenHandler): AsyncGenerator<StreamEvent> {
      const toolDefinitions = getToolDefinitions();
      const stream = await client.chat.completions.create({
        model,
        messages,
        stream: true,
        tools: toolDefinitions.map((t) => ({
          type: "function" as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
      });

      let currentToolCall: { id?: string; name?: string; arguments?: string } | null = null;
      let contentBuffer = "";

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (!delta) continue;

        // Handle content delta
        if (delta.content) {
          contentBuffer += delta.content;
          onToken?.(delta.content);
          yield { type: "content", content: delta.content };
        }

        // Handle tool calls
        if (delta.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            if (toolCall.id) {
              currentToolCall = { id: toolCall.id };
            }
            if (toolCall.function?.name) {
              currentToolCall!.name = toolCall.function.name;
              yield { type: "tool_start", toolId: toolCall.id, toolName: toolCall.function.name };
            }
            if (toolCall.function?.arguments) {
              currentToolCall!.arguments = (currentToolCall!.arguments || "") + toolCall.function.arguments;
            }
          }
        }
      }

      // Parse and execute tool calls if present
      if (currentToolCall?.name && currentToolCall?.arguments) {
        try {
          const args = JSON.parse(currentToolCall.arguments);
          const result = await executeTool(currentToolCall.name!, args, { dangerous: options.dangerous || false, abortSignal: options.abortSignal, cwd: process.cwd() });
          yield { type: "tool_end", toolName: currentToolCall.name, toolResult: result.error || result.content };
          // Signal that we need to continue with the tool result
          yield { type: "done", needsContinuation: true };
          return;  // Exit so caller can call again with tool result
        } catch (e: any) {
          yield { type: "error", error: `Tool execution failed: ${e.message}` };
          yield { type: "done" };
          return;
        }
      }

      yield { type: "done" };
    },
  };
}

// ============================================================================
// System Prompt
// ============================================================================

function buildSystemPrompt(): string {
  const tools = getToolDefinitions();
  const toolList = tools.map((t) => `- ${t.name}(${describeParams(t.parameters)}) → ${t.description}`).join("\n");

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

function describeParams(params: Record<string, unknown>): string {
  if (!params || !params.properties) return "";
  const props = params.properties as Record<string, { description?: string; type?: string }>;
  return Object.keys(props)
    .map((k) => `${k}: ${props[k].type || "any"}`)
    .join(", ");
}

// ============================================================================
// Core Agent Loop
// ============================================================================

export async function runLeanAgent(
  prompt: string,
  options: LeanAgentOptions = {}
): Promise<AgentResult> {
  const maxIterations = options.maxIterations || 10;
  const dangerous = options.dangerous || false;
  const abortSignal = options.abortSignal;
  const maxTokens = options.maxTokens || 80000;  // Default to 80k tokens

  // Check if already aborted
  if (abortSignal?.aborted) {
    return { content: "Interrupted", iterations: 0, completed: false };
  }

  const llm = createLLMClient(options);
  const systemPrompt = options.systemPrompt || buildSystemPrompt();

  // Message accumulation: use existing messages if provided, otherwise create fresh
  let messages: any[];
  if (options.messages && options.messages.length > 0) {
    messages = [...options.messages, { role: "user", content: prompt }];
  } else {
    messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];
  }

  const context = { dangerous, abortSignal, cwd: process.cwd() };
  let iterations = 0;

  while (iterations < maxIterations) {
    // Check for abort before each iteration
    if (abortSignal?.aborted) {
      return { content: "Interrupted", iterations, completed: false };
    }

    iterations++;

    const response = await llm.generate(messages);
    const choice = response.choices[0];

    if (!choice?.message) {
      break;
    }

    const { content, tool_calls } = choice.message;

    // No tool calls - return content directly
    if (!tool_calls || tool_calls.length === 0) {
      // Add assistant response to messages for accumulation
      messages.push({ role: "assistant", content: content || "" });
      return { content: content || "", iterations, completed: true, messages };
    }

    // Execute tool calls
    for (const toolCall of tool_calls) {
      const { name, arguments: argsString } = toolCall.function;
      const args = JSON.parse(argsString);

      const result = await executeTool(name, args, context);

      // If dangerous operation was blocked, return the error
      if (result.error?.startsWith("[shell:BLOCKED]") || result.error?.includes(":BLOCKED]")) {
        return {
          content: result.error,
          iterations,
          completed: false,
          messages,
        };
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result.error || result.content,
      });
    }

    // Check for context compaction
    const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    if (totalTokens > maxTokens) {
      const compacted = compactMessages(messages, maxTokens);
      if (compacted.length < messages.length) {
        messages = compacted;
      }
    }
  }

  return { content: "Max iterations reached", iterations, completed: false, messages };
}

// ============================================================================
// Streaming Agent Loop
// ============================================================================

/**
 * Streaming version of runLeanAgent.
 * Yields content tokens as they arrive from the API.
 */
export async function runLeanAgentStream(
  prompt: string,
  options: LeanAgentOptions = {},
  onToken?: TokenHandler
): Promise<AsyncGenerator<StreamEvent>> {
  const maxIterations = options.maxIterations || 10;
  const dangerous = options.dangerous || false;
  const abortSignal = options.abortSignal;
  const maxTokens = options.maxTokens || 80000;

  if (abortSignal?.aborted) {
    return (async function* () {
      yield { type: "error", error: "Interrupted" };
    })();
  }

  const llm = createLLMClient(options);
  const systemPrompt = options.systemPrompt || buildSystemPrompt();
  let messages: any[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt },
  ];

  const context = { dangerous, abortSignal, cwd: process.cwd() };
  let iterations = 0;

  async function* streamGenerator(): AsyncGenerator<StreamEvent> {
    while (iterations < maxIterations) {
      if (abortSignal?.aborted) {
        yield { type: "error", error: "Interrupted" };
        return;
      }

      iterations++;

      let fullContent = "";
      let toolCallToExecute: { id?: string; name?: string; arguments?: string } | null = null;

      // Stream the response
      for await (const event of llm.generateStream(messages, onToken)) {
        if (event.type === "content" && event.content) {
          fullContent += event.content;
        }
        if (event.type === "tool_start" && event.toolName) {
          toolCallToExecute = { name: event.toolName };
        }
        if (event.type === "tool_end" && event.toolResult) {
          if (toolCallToExecute) {
            toolCallToExecute.arguments = toolCallToExecute.arguments || "";
          }
        }
        yield event;
      }

      // If we have content, return it
      if (fullContent) {
        yield { type: "done", content: fullContent };
        return;
      }

      // If no content but tool call detected, execute it
      // Note: This simplified version doesn't fully handle tool execution in stream mode
      yield { type: "done", content: "" };
      return;
    }

    yield { type: "error", error: "Max iterations reached" };
  }

  return streamGenerator();
}

/**
 * Simple streaming version that returns combined content.
 * Handles tool calls properly by continuing the stream after tool execution.
 */
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

  const llm = createLLMClient(options);
  const systemPrompt = options.systemPrompt || buildSystemPrompt();
  const messages: any[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt },
  ];

  let fullContent = "";
  let iterations = 0;
  let lastToolCallId: string | undefined;
  let lastToolName: string | undefined;

  while (iterations < maxIterations) {
    if (abortSignal?.aborted) {
      return { content: "Interrupted", iterations, completed: false };
    }

    let needsContinuation = false;

    for await (const event of llm.generateStream(messages, onToken)) {
      if (event.type === "content" && event.content) {
        fullContent += event.content;
      }
      if (event.type === "tool_start") {
        lastToolCallId = event.toolId;
        lastToolName = event.toolName;
      }
      if (event.type === "error") {
        return { content: event.error || "Stream error", iterations, completed: false };
      }
      if (event.type === "tool_end" && event.toolResult) {
        // Add tool result to messages for continuation
        messages.push({
          role: "tool",
          tool_call_id: lastToolCallId,
          content: event.toolResult,
        });
      }
      if (event.type === "done") {
        if (event.needsContinuation) {
          needsContinuation = true;
        }
        break;
      }
    }

    iterations++;

    if (needsContinuation) {
      // Continue to next iteration to submit tool result to LLM
      continue;
    }

    // No continuation needed, we're done
    return { content: fullContent, iterations, completed: true };
  }

  return { content: fullContent || "Max iterations reached", iterations, completed: false };
}

// ============================================================================
// CLI Entry
// ============================================================================

if (import.meta.main) {
  // Initialize tool registry first
  await initializeToolRegistry();

  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const prompt = args.join(" ") || "Hello world";

  console.log(`🐱 Meow lean agent`);
  console.log(`Prompt: ${prompt}\n`);

  try {
    const result = await runLeanAgent(prompt);
    console.log(`\n✅ Completed in ${result.iterations} iteration(s)`);
    console.log(`\n--- Output ---\n${result.content}`);
  } catch (e: any) {
    console.error(`❌ Error: ${e.message}`);
    process.exit(1);
  }
}
