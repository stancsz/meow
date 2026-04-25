/**
 * hooks.ts - Hooks sidecar
 *
 * Runs pre/post execution hooks for automation.
 * Hooks are defined in ~/.agent-kernel/hooks.json
 *
 * Format:
 * {
 *   "before": [
 *     { "command": "echo before" }
 *   ],
 *   "after": [
 *     { "command": "echo after" }
 *   ]
 * }
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

export interface HookConfig {
  before?: HookCommand[];
  after?: HookCommand[];
}

export interface HookCommand {
  command: string;
  cwd?: string;
}

interface HookContext {
  command?: string;
  tool?: string;
  args?: string;
}

// Load hooks from ~/.agent-kernel/hooks.json
function loadHooks(): HookConfig {
  const hooksPath = join(homedir(), ".meow", "hooks.json");
  if (!existsSync(hooksPath)) {
    return {};
  }
  try {
    const content = readFileSync(hooksPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

// Run a single hook command
function runHook(hook: HookCommand, context: HookContext): { success: boolean; output: string } {
  const cwd = hook.cwd || process.cwd();
  try {
    const output = execSync(hook.command, {
      encoding: "utf-8",
      cwd,
      timeout: 30000,
      env: {
        ...process.env,
        MEOW_COMMAND: context.command || "",
        MEOW_TOOL: context.tool || "",
        MEOW_ARGS: context.args || "",
      },
    });
    return { success: true, output: output.toString() };
  } catch (e: any) {
    return { success: false, output: e.message };
  }
}

const hooksConfig = loadHooks();

// Run all before hooks
export function runBeforeHooks(context: HookContext): void {
  if (!hooksConfig.before?.length) return;

  for (const hook of hooksConfig.before) {
    const result = runHook(hook, context);
    if (!result.success) {
      console.warn(`[hooks:before] Warning: hook failed: ${result.output}`);
    }
  }
}

// Run all after hooks
export function runAfterHooks(context: HookContext): void {
  if (!hooksConfig.after?.length) return;

  for (const hook of hooksConfig.after) {
    const result = runHook(hook, context);
    if (!result.success) {
      console.warn(`[hooks:after] Warning: hook failed: ${result.output}`);
    }
  }
}

// Check if hooks are configured
export function hasHooks(): boolean {
  return !!(hooksConfig.before?.length || hooksConfig.after?.length);
}

