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
      const { cmd } = args as { path: string; cmd: string };

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
  {
    name: "consult",
    description: "Get a second opinion from another model (Mixture-of-Experts)",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The specific question or code to review" },
        model: { type: "string", description: "Optional expert model to consult (e.g. 'gpt-4o', 'claude-3-5-sonnet')" },
      },
      required: ["prompt"],
    },
    execute: async (args: unknown, context: ToolContext) => {
      const { prompt, model } = args as { prompt: string; model?: string };
      try {
        const { runLeanAgent } = await import("../core/lean-agent.ts");
        const result = await runLeanAgent(prompt, {
          model: model || "gpt-4o",
          maxIterations: 1, // Consultations should be single-turn
          systemPrompt: "You are a senior code reviewer. Provide a concise, expert analysis.",
          dangerous: false,
        });
        return { content: `[Consultation Result from ${model || "gpt-4o"}]:\n${result.content}` };
      } catch (e: any) {
        return { content: "", error: `Consultation failed: ${e.message}` };
      }
    },
  },
  {
    name: "multi_consult",
    description: "Get second opinions from multiple expert models simultaneously (GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro)",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The specific question or code to review" },
      },
      required: ["prompt"],
    },
    execute: async (args: unknown, context: ToolContext) => {
      const { prompt } = args as { prompt: string };
      const experts = [
        { name: "GPT-4o", model: "gpt-4o", apiKey: process.env.OPENAI_API_KEY },
        { name: "Claude 3.5 Sonnet", model: "claude-3-5-sonnet", apiKey: process.env.ANTHROPIC_API_KEY },
        { name: "Gemini 1.5 Pro", model: "gemini-1.5-pro", apiKey: process.env.GEMINI_API_KEY },
      ];

      const consultations = experts.map(async (expert) => {
        if (!expert.apiKey) {
          return { expert: expert.name, success: false, content: "", error: "API key not configured" };
        }
        try {
          const { runLeanAgent } = await import("../core/lean-agent.ts");
          const result = await runLeanAgent(prompt, {
            model: expert.model,
            maxIterations: 1,
            apiKey: expert.apiKey,
            systemPrompt: "You are a senior code reviewer. Provide a concise, expert analysis.",
            dangerous: false,
          });
          return { expert: expert.name, success: true, content: result.content, error: "" };
        } catch (e: any) {
          return { expert: expert.name, success: false, content: "", error: e.message };
        }
      });

      const results = await Promise.all(consultations);

      const summary = results.map((r) => {
        if (r.success) {
          return `## ${r.expert}\n${r.content}`;
        } else {
          return `## ${r.expert} [FAILED]\n${r.error}`;
        }
      }).join("\n\n---\n\n");

      return { content: `[Multi-Consult Results]\n\n${summary}` };
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
  // EPOCH 21: Use checkPermissionWithLearning instead of checkPermission
  // This wires the auto-approve learning layer into the main permission flow
  const { checkPermissionWithLearning, recordApproval } = await import("./permissions.ts");

  const permission = checkPermissionWithLearning(toolName, args);

  if (permission.action === "deny") {
    return {
      content: "",
      error: `[${toolName}:DENIED] Permission denied${permission.reason ? ` (${permission.reason})` : ""}`,
    };
  }

  if (permission.action === "ask") {
    // If already in dangerous mode, auto-allow
    if (context.dangerous) {
      // EPOCH 21: Record approval in dangerous mode too (user explicitly enabled it)
      recordApproval(toolName, args);
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
      // EPOCH 21: Permission granted - record for learning (after 3 approvals, auto-approve)
      recordApproval(toolName, args);
      // Continue to execute
    }
  }

  // permission.action === "allow" or dangerous mode
  const tool = getTool(toolName);
  if (!tool) {
    return { content: "", error: `Unknown tool: ${toolName}` };
  }

  // Argument Coercion (Hermes style)
  // Fix common model hallucinations like sending strings for boolean/number types
  const coercedArgs = { ...(args as any) };
  const params = tool.parameters?.properties as Record<string, any>;
  if (params) {
    for (const [key, val] of Object.entries(coercedArgs)) {
      const schema = params[key];
      if (schema?.type === "boolean" && typeof val === "string") {
        coercedArgs[key] = val.toLowerCase() === "true";
      } else if (schema?.type === "number" && typeof val === "string") {
        const parsed = parseFloat(val);
        if (!isNaN(parsed)) coercedArgs[key] = parsed;
      } else if (schema?.type === "integer" && typeof val === "string") {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed)) coercedArgs[key] = parsed;
      }
    }
  }

  return tool.execute(coercedArgs, context);
}

