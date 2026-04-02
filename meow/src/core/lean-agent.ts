/**
 * lean-agent.ts
 *
 * Meow's lean agent loop. Inspired by Claude Code's core pattern:
 * User → messages[] → LLM API → response
 *                        ↓
 *             tool_use? → execute → loop
 *             else → return text
 *
 * CORE: ~80 lines of core logic. Tools are sidecars.
 */
import OpenAI from "openai";
import { readFileSync, writeFileSync } from "node:fs";
import { exec, type ExecOptions } from "node:child_process";
import { glob, grep } from "../tools/search.ts";

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
  dangerous?: boolean;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  abortSignal?: AbortSignal;
}

export interface AgentResult {
  content: string;
  iterations: number;
  completed: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// ============================================================================
// Core Tools (always available)
// ============================================================================

function createCoreTools(dangerous: boolean = false) {
  return {
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

    shell: async (args: { cmd: string }, abortSignal?: AbortSignal): Promise<ToolResult> => {
      if (!dangerous) {
        return {
          content: "",
          error: `[shell:BLOCKED] Dangerous operation requires --dangerous flag\nCommand: ${args.cmd}`,
        };
      }

      return new Promise((resolve) => {
        const output: string[] = [];
        const errOutput: string[] = [];

        const child = exec(args.cmd, { encoding: "utf-8" } as ExecOptions, (error) => {
          if (error && !output.length && !errOutput.length) {
            resolve({ content: "", error: `Shell failed: ${error.message}` });
          }
        });

        // Handle abort
        const abortHandler = () => {
          child.kill("SIGTERM");
          resolve({ content: "", error: "Shell command aborted" });
        };
        abortSignal?.addEventListener("abort", abortHandler);

        child.stdout?.on("data", (data) => {
          process.stdout.write(data);
          output.push(data);
        });

        child.stderr?.on("data", (data) => {
          process.stderr.write(data);
          errOutput.push(data);
        });

        child.on("close", (code) => {
          abortSignal?.removeEventListener("abort", abortHandler);
          const fullOutput = output.join("") + errOutput.join("");
          resolve({
            content: fullOutput || `[Shell exited with code ${code}]`,
            error: code === 0 ? undefined : `Exit code: ${code}`,
          });
        });

        child.on("error", (e) => {
          resolve({ content: "", error: `Shell failed: ${e.message}` });
        });
      });
    },

    git: async (args: { cmd: string }): Promise<ToolResult> => {
      return new Promise((resolve) => {
        const output: string[] = [];
        const child = exec(`git ${args.cmd}`, { encoding: "utf-8" });

        child.stdout?.on("data", (data) => {
          process.stdout.write(data);
          output.push(data);
        });

        child.stderr?.on("data", (data) => {
          process.stderr.write(data);
        });

        child.on("close", (code) => {
          resolve({
            content: output.join("") || `[Git command exited with code ${code}]`,
            error: code === 0 ? undefined : `Exit code: ${code}`,
          });
        });

        child.on("error", (e) => {
          resolve({ content: "", error: `Git failed: ${e.message}` });
        });
      });
    },
  };
}

// ============================================================================
// Sidecar Skills (modular tools)
// ============================================================================

const sidecarTools = {
  glob,
  grep,
};

function getToolSchemas(extraTools?: ToolDefinition[]) {
  const coreSchemas = [
    {
      type: "function" as const,
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
      type: "function" as const,
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
      type: "function" as const,
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
      type: "function" as const,
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
  ];

  // Search tools from sidecar
  const searchSchemas = [
    {
      type: "function" as const,
      function: {
        name: "glob",
        description: "Find files by name pattern. Use ** for recursive matching.",
        parameters: {
          type: "object",
          properties: {
            pattern: { type: "string", description: "File pattern to match (e.g., '*.ts', '**/*.js')" },
            cwd: { type: "string", description: "Working directory to search in" },
          },
          required: ["pattern"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "grep",
        description: "Search file contents using regex pattern",
        parameters: {
          type: "object",
          properties: {
            pattern: { type: "string", description: "Regex pattern to search for" },
            path: { type: "string", description: "Directory or file path to search in" },
            recursive: { type: "boolean", description: "Search recursively (default true)" },
          },
          required: ["pattern"],
        },
      },
    },
  ];

  return [...coreSchemas, ...searchSchemas];
}

// ============================================================================
// LLM Client
// ============================================================================

function createLLMClient(options: LeanAgentOptions) {
  const apiKey = options.apiKey || process.env.LLM_API_KEY;
  const baseURL = options.baseURL || process.env.LLM_BASE_URL || "https://api.openai.com/v1";
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
        tools: getToolSchemas(options.tools),
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
- write(path, content) → write content to a file
- shell(cmd) → execute shell command
- git(cmd) → execute git command
- glob(pattern) → find files by pattern
- grep(pattern, path?) → search file contents

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
  const dangerous = options.dangerous || false;
  const systemPrompt = options.systemPrompt || buildSystemPrompt();
  const abortSignal = options.abortSignal;

  // Check if already aborted
  if (abortSignal?.aborted) {
    return { content: "Interrupted", iterations: 0, completed: false };
  }

  const llm = createLLMClient(options);
  const messages: any[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt },
  ];

  const coreTools = createCoreTools(dangerous);
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

      // Try core tools first, then sidecar tools
      const handler = coreTools[name as keyof typeof coreTools] || sidecarTools[name as keyof typeof sidecarTools];
      if (!handler) {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Unknown tool: ${name}`,
        });
        continue;
      }

      const result = await handler(args as any);

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
