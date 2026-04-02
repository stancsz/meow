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
}

export interface AgentResult {
  content: string;
  iterations: number;
  completed: boolean;
}

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

  // Check if already aborted
  if (abortSignal?.aborted) {
    return { content: "Interrupted", iterations: 0, completed: false };
  }

  const llm = createLLMClient(options);
  const systemPrompt = options.systemPrompt || buildSystemPrompt();
  const messages: any[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt },
  ];

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
      return { content: content || "", iterations, completed: true };
    }

    // Execute tool calls
    for (const toolCall of tool_calls) {
      const { name, arguments: argsString } = toolCall.function;
      const args = JSON.parse(argsString);

      const tool = getTool(name);
      if (!tool) {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Unknown tool: ${name}`,
        });
        continue;
      }

      const result = await tool.execute(args, context);

      // If dangerous operation was blocked, return the error
      if (result.error?.startsWith("[shell:BLOCKED]")) {
        return {
          content: result.error,
          iterations,
          completed: false,
        };
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result.error || result.content,
      });
    }
  }

  return { content: "Max iterations reached", iterations, completed: false };
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
