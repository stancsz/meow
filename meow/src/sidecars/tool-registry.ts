/**
 * tool-registry.ts
 *
 * Tool registry sidecar. Loads tools from .meow/tools/ directory.
 * Tools can be hot-reloaded without restarting the agent.
 *
 * Interface:
 * {
 *   name: string,
 *   description: string,
 *   parameters: JSONSchema,
 *   execute: (args: unknown, context: ToolContext) => Promise<ToolResult>
 * }
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

// ============================================================================
// Types
// ============================================================================

export interface ToolContext {
  cwd: string;
  dangerous: boolean;
  abortSignal?: AbortSignal;
}

export interface ToolResult {
  content: string;
  error?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: unknown, context: ToolContext): Promise<ToolResult>;
}

// ============================================================================
// Built-in Tools
// ============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { exec, type ExecOptions } from "node:child_process";

const builtInTools: Tool[] = [
  {
    name: "read",
    description: "Read file contents from disk",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to read" },
      },
      required: ["path"],
    },
    execute: async (args: unknown) => {
      const { path } = args as { path: string };
      try {
        const content = readFileSync(path, "utf-8");
        return { content: `[Read ${path}]\n${content}` };
      } catch (e: any) {
        return { content: "", error: `Failed to read ${path}: ${e.message}` };
      }
    },
  },
  {
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
    execute: async (args: unknown) => {
      const { path, content } = args as { path: string; content: string };
      try {
        writeFileSync(path, content, "utf-8");
        return { content: `[Wrote ${path}]` };
      } catch (e: any) {
        return { content: "", error: `Failed to write ${path}: ${e.message}` };
      }
    },
  },
  {
    name: "shell",
    description: "Execute a shell command",
    parameters: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "Shell command to execute" },
      },
      required: ["cmd"],
    },
    execute: async (args: unknown, context: ToolContext) => {
      const { cmd } = args as { cmd: string };

      if (!context.dangerous) {
        return {
          content: "",
          error: `[shell:BLOCKED] Dangerous operation requires --dangerous flag\nCommand: ${cmd}`,
        };
      }

      return new Promise((resolve) => {
        const output: string[] = [];
        const errOutput: string[] = [];

        const child = exec(cmd, { encoding: "utf-8" } as ExecOptions);

        // Handle abort
        const abortHandler = () => {
          child.kill("SIGTERM");
          resolve({ content: "", error: "Shell command aborted" });
        };
        context.abortSignal?.addEventListener("abort", abortHandler);

        child.stdout?.on("data", (data) => {
          process.stdout.write(data);
          output.push(data);
        });

        child.stderr?.on("data", (data) => {
          process.stderr.write(data);
          errOutput.push(data);
        });

        child.on("close", (code) => {
          context.abortSignal?.removeEventListener("abort", abortHandler);
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
  },
  {
    name: "git",
    description: "Execute a git command",
    parameters: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "Git arguments (e.g., 'status', 'diff')" },
      },
      required: ["cmd"],
    },
    execute: async (args: unknown, context: ToolContext) => {
      const { cmd } = args as { cmd: string };

      return new Promise((resolve) => {
        const output: string[] = [];
        const child = exec(`git ${cmd}`, { encoding: "utf-8" });

        // Handle abort
        const abortHandler = () => {
          child.kill("SIGTERM");
          resolve({ content: "", error: "Git command aborted" });
        };
        context.abortSignal?.addEventListener("abort", abortHandler);

        child.stdout?.on("data", (data) => {
          process.stdout.write(data);
          output.push(data);
        });

        child.stderr?.on("data", (data) => {
          process.stderr.write(data);
        });

        child.on("close", (code) => {
          context.abortSignal?.removeEventListener("abort", abortHandler);
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
  },
];

// ============================================================================
// Search Tools (loaded from search.ts sidecar)
// ============================================================================

async function loadSearchTools(): Promise<Tool[]> {
  try {
    const { glob, grep } = await import("../tools/search.ts");
    return [
      {
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
        execute: async (args: unknown) => {
          return glob(args as { pattern: string; cwd?: string });
        },
      },
      {
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
        execute: async (args: unknown) => {
          return grep(args as { pattern: string; path?: string; recursive?: boolean });
        },
      },
    ];
  } catch {
    return [];
  }
}

// ============================================================================
// Registry
// ============================================================================

let tools: Tool[] = [...builtInTools];
let searchTools: Tool[] = [];

export async function initializeToolRegistry(): Promise<void> {
  // Load built-in search tools
  searchTools = await loadSearchTools();
  tools = [...builtInTools, ...searchTools];
}

export function getAllTools(): Tool[] {
  return tools;
}

export function getTool(name: string): Tool | undefined {
  return tools.find((t) => t.name === name);
}

export function getToolDefinitions(): ToolDefinition[] {
  return tools.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));
}

export function registerTool(tool: Tool): void {
  const existing = tools.findIndex((t) => t.name === tool.name);
  if (existing >= 0) {
    tools[existing] = tool;
  } else {
    tools.push(tool);
  }
}
