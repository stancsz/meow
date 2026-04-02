/**
 * lean-agent.ts
 *
 * Meow's lean agent loop. Inspired by Claude Code's core pattern:
 * User → messages[] → LLM API → response
 *                        ↓
 *             tool_use? → execute → loop
 *             else → return text
 *
 * ~50-100 lines of core logic. Everything else is bloat.
 */
import OpenAI from "openai";
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

// ============================================================================
// Types
// ============================================================================

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  content: string;
  error?: string;
}

export interface LeanAgentOptions {
  model?: string;
  maxIterations?: number;
  apiKey?: string;
  baseURL?: string;
}

export interface AgentResult {
  content: string;
  iterations: number;
  completed: boolean;
}

// ============================================================================
// Tool Handlers
// ============================================================================

const tools = {
  read: async (args: { path: string }): Promise<ToolResult> => {
    try {
      const content = readFileSync(args.path, "utf-8");
      return { content: `[Read ${args.path}]\n${content}` };
    } catch (e: any) {
      return { content: "", error: `Failed to read ${args.path}: ${e.message}` };
    }
  },

  write: async (args: { path: string; content: string }): Promise<ToolResult> => {
    try {
      writeFileSync(args.path, args.content, "utf-8");
      return { content: `[Wrote ${args.path}]` };
    } catch (e: any) {
      return { content: "", error: `Failed to write ${args.path}: ${e.message}` };
    }
  },

  shell: async (args: { cmd: string }): Promise<ToolResult> => {
    try {
      const output = execSync(args.cmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
      return { content: `[Shell: ${args.cmd}]\n${output}` };
    } catch (e: any) {
      return { content: "", error: `Shell failed: ${e.message}` };
    }
  },

  git: async (args: { cmd: string }): Promise<ToolResult> => {
    try {
      const output = execSync(`git ${args.cmd}`, { encoding: "utf-8" });
      return { content: `[Git: ${args.cmd}]\n${output}` };
    } catch (e: any) {
      return { content: "", error: `Git failed: ${e.message}` };
    }
  },
};

// ============================================================================
// LLM Client
// ============================================================================

function createLLMClient(options: LeanAgentOptions) {
  const apiKey = options.apiKey || process.env.MINIMAX_API_KEY;
  const baseURL = options.baseURL || process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1";
  const model = options.model || process.env.MINIMAX_MODEL || "MiniMax-M2.7";

  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY is required");
  }

  const client = new OpenAI({ apiKey, baseURL });

  return {
    model,
    client,
    generate: async (messages: any[]) => {
      const response = await client.chat.completions.create({
        model,
        messages,
        tools: [
          {
            type: "function",
            function: {
              name: "read",
              description: "Read file contents from disk",
              parameters: {
                type: "object",
                properties: { path: { type: "string", description: "File path to read" } },
                required: ["path"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "write",
              description: "Write content to a file",
              parameters: {
                type: "object",
                properties: {
                  path: { type: "string", description: "File path to write" },
                  content: { type: "string", description: "Content to write" },
                },
                required: ["path", "content"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "shell",
              description: "Execute a shell command",
              parameters: {
                type: "object",
                properties: { cmd: { type: "string", description: "Shell command to execute" } },
                required: ["cmd"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "git",
              description: "Execute a git command",
              parameters: {
                type: "object",
                properties: { cmd: { type: "string", description: "Git arguments (e.g., 'status', 'diff')" } },
                required: ["cmd"],
              },
            },
          },
        ],
      });
      return response;
    },
  };
}

// ============================================================================
// System Prompt
// ============================================================================

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

// ============================================================================
// Core Agent Loop
// ============================================================================

export async function runLeanAgent(
  prompt: string,
  options: LeanAgentOptions = {}
): Promise<AgentResult> {
  const maxIterations = options.maxIterations || 10;

  const llm = createLLMClient(options);
  const messages: any[] = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: prompt },
  ];

  let iterations = 0;

  while (iterations < maxIterations) {
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

      const handler = tools[name as keyof typeof tools];
      if (!handler) {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Unknown tool: ${name}`,
        });
        continue;
      }

      const result = await handler(args as any);
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
  const prompt = process.argv.slice(2).join(" ") || "Hello world";

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
