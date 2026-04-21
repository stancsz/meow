/**
 * tool-registry.ts
 *
 * Tool registry sidecar. Loads tools from .agent-kernel/tools/ directory.
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
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { runBeforeHooks, runAfterHooks } from "./hooks.ts";

// ============================================================================
// Types
// ============================================================================

export interface ToolContext {
  cwd: string;
  dangerous: boolean;
  abortSignal?: AbortSignal;
  timeoutMs?: number;  // Timeout for tool execution in milliseconds
  workspacePath?: string;  // Restrict file operations to this directory
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
// Workspace Path Guard
// ============================================================================

function isPathInWorkspace(filePath: string, workspacePath: string | undefined): boolean {
  if (!workspacePath) return true; // No workspace set, allow all
  const absFile = filePath.startsWith('/') ? filePath : filePath;
  const normalizedWorkspace = workspacePath.replace(/\\/g, '/').replace(/\/$/, '');
  return absFile.replace(/\\/g, '/').startsWith(normalizedWorkspace + '/') ||
         absFile.replace(/\\/g, '/') === normalizedWorkspace;
}

function checkWorkspace(filePath: string, workspacePath: string | undefined): string | null {
  if (!isPathInWorkspace(filePath, workspacePath)) {
    return `Access denied: ${filePath} is outside the workspace directory${workspacePath ? ` (${workspacePath})` : ''}`;
  }
  return null;
}

// ============================================================================
// Built-in Tools
// ============================================================================

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
    execute: async (args: unknown, context: ToolContext) => {
      const { path } = args as { path: string };
      const wsError = checkWorkspace(path, context.workspacePath);
      if (wsError) return { content: "", error: wsError };
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
    execute: async (args: unknown, context: ToolContext) => {
      const { path, content } = args as { path: string; content: string };
      const wsError = checkWorkspace(path, context.workspacePath);
      if (wsError) return { content: "", error: wsError };
      try {
        writeFileSync(path, content, "utf-8");
        return { content: `[Wrote ${path}]` };
      } catch (e: any) {
        return { content: "", error: `Failed to write ${path}: ${e.message}` };
      }
    },
  },
  {
    name: "edit",
    description: "Edit a file by replacing text. Use for precise, targeted changes.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to edit" },
        old_string: { type: "string", description: "Exact text to find and replace" },
        new_string: { type: "string", description: "Replacement text" },
      },
      required: ["path", "old_string", "new_string"],
    },
    execute: async (args: unknown, context: ToolContext) => {
      const { path, old_string, new_string } = args as { path: string; old_string: string; new_string: string };
      const wsError = checkWorkspace(path, context.workspacePath);
      if (wsError) return { content: "", error: wsError };
      try {
        const content = readFileSync(path, "utf-8");
        if (!content.includes(old_string)) {
          return { content: "", error: `Could not find "${old_string}" in ${path}` };
        }
        const newContent = content.replace(old_string, new_string);
        writeFileSync(path, newContent, "utf-8");
        return { content: `[Edited ${path}]` };
      } catch (e: any) {
        return { content: "", error: `Failed to edit ${path}: ${e.message}` };
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

      // Run pre-hooks
      runBeforeHooks({ command: cmd, tool: "shell", args: cmd });

      const result = await new Promise<{ content: string; error?: string }>((resolve) => {
        const output: string[] = [];
        const errOutput: string[] = [];
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let settled = false;

        const finish = (
          content: string,
          error?: string
        ) => {
          if (settled) return;
          settled = true;
          if (timeoutId) clearTimeout(timeoutId);
          resolve({ content, error });
        };

        const child = exec(cmd, { encoding: "utf-8" } as ExecOptions);

        // Handle timeout
        if (context.timeoutMs && context.timeoutMs > 0) {
          timeoutId = setTimeout(() => {
            child.kill("SIGTERM");
            finish("", `Shell command timed out after ${context.timeoutMs}ms`);
          }, context.timeoutMs);
        }

        // Handle abort
        const abortHandler = () => {
          child.kill("SIGTERM");
          finish("", "Shell command aborted");
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
          finish(
            fullOutput || `[Shell exited with code ${code}]`,
            code === 0 ? undefined : `Exit code: ${code}`
          );
        });

        child.on("error", (e) => {
          finish("", `Shell failed: ${e.message}`);
        });
      });

      // Run post-hooks
      runAfterHooks({ command: cmd, tool: "shell", args: cmd });

      return result;
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

      // Run pre-hooks
      runBeforeHooks({ command: `git ${cmd}`, tool: "git", args: cmd });

      const result = await new Promise<{ content: string; error?: string }>((resolve) => {
        const output: string[] = [];
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let settled = false;

        const finish = (content: string, error?: string) => {
          if (settled) return;
          settled = true;
          if (timeoutId) clearTimeout(timeoutId);
          resolve({ content, error });
        };

        const child = exec(`git ${cmd}`, { encoding: "utf-8" });

        // Handle timeout
        if (context.timeoutMs && context.timeoutMs > 0) {
          timeoutId = setTimeout(() => {
            child.kill("SIGTERM");
            finish("", `Git command timed out after ${context.timeoutMs}ms`);
          }, context.timeoutMs);
        }

        // Handle abort
        const abortHandler = () => {
          child.kill("SIGTERM");
          finish("", "Git command aborted");
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
          finish(
            output.join("") || `[Git command exited with code ${code}]`,
            code === 0 ? undefined : `Exit code: ${code}`
          );
        });

        child.on("error", (e) => {
          finish("", `Git failed: ${e.message}`);
        });
      });

      // Run post-hooks
      runAfterHooks({ command: `git ${cmd}`, tool: "git", args: cmd });

      return result;
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

export function getToolDefinitions(allowedTools?: string[]): ToolDefinition[] {
  const all = tools.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));
  if (!allowedTools || allowedTools.length === 0) return all;
  return all.filter(t => allowedTools.includes(t.name));
}

export function registerTool(tool: Tool): void {
  const existing = tools.findIndex((t) => t.name === tool.name);
  if (existing >= 0) {
    tools[existing] = tool;
  } else {
    tools.push(tool);
  }
}

// ============================================================================
// Tool Execution with Permissions
// ============================================================================

export async function executeTool(
  toolName: string,
  args: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const { checkPermission } = await import("./permissions.ts");

  const permission = checkPermission(toolName, args);

  if (permission.action === "deny") {
    return {
      content: "",
      error: `[${toolName}:DENIED] Permission denied${permission.reason ? ` (${permission.reason})` : ""}`,
    };
  }

  if (permission.action === "ask") {
    // If already in dangerous mode, auto-allow
    if (context.dangerous) {
      // Continue to execute
    } else {
      // Prompt for permission
      const { promptPermission } = await import("./permissions.ts");
      const allowed = await promptPermission(toolName, args);
      if (!allowed) {
        return {
          content: "",
          error: `[${toolName}:DENIED] Permission denied by user`,
        };
      }
      // Permission granted - continue to execute
    }
  }

  // permission.action === "allow" or dangerous mode
  const tool = getTool(toolName);
  if (!tool) {
    return { content: "", error: `Unknown tool: ${toolName}` };
  }

  return tool.execute(args, context);
}

