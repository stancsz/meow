/**
 * permissions.ts
 *
 * Permission sidecar with pattern-matching rules.
 * Allows/denies/asks before tool execution based on rules.
 *
 * Rules are loaded from .meow/permissions.json:
 * {
 *   "rules": [
 *     { "tool": "shell", "pattern": "^git ", "action": "allow" },
 *     { "tool": "shell", "pattern": "^rm ", "action": "deny" },
 *     { "tool": "shell", "action": "ask" },
 *     { "tool": "write", "action": "ask" }
 *   ]
 * }
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as readline from "node:readline";

// ============================================================================
// Types
// ============================================================================

export type PermissionAction = "allow" | "deny" | "ask";

export interface PermissionRule {
  tool: string;
  pattern?: string;  // Optional regex pattern
  action: PermissionAction;
}

export interface PermissionContext {
  input?: unknown;  // Tool input args
}

export interface PermissionResult {
  action: PermissionAction;
  reason?: string;
}

// ============================================================================
// Default Rules
// ============================================================================

const DEFAULT_RULES: PermissionRule[] = [
  { tool: "read", action: "allow" },                    // Reading is safe
  { tool: "glob", action: "allow" },                   // Finding files is safe
  { tool: "grep", action: "allow" },                    // Searching is safe
  { tool: "git", action: "allow" },                     // Git is generally safe
  { tool: "shell", pattern: "\"cmd\":\"git ", action: "allow" },  // Git commands safe
  { tool: "shell", pattern: "\"cmd\":\"npm ", action: "allow" },   // npm is safe
  { tool: "shell", pattern: "\"cmd\":\"bun ", action: "allow" },   // bun is safe
  { tool: "shell", pattern: "\"cmd\":\"cd ", action: "allow" },    // cd is safe
  { tool: "shell", pattern: "\"cmd\":\"ls", action: "allow" },     // ls is safe
  { tool: "shell", pattern: "\"cmd\":\"pwd", action: "allow" },    // pwd is safe
  { tool: "shell", pattern: "\"cmd\":\"cat ", action: "allow" },   // cat is safe
  { tool: "shell", pattern: "\"cmd\":\"rm ", action: "deny" },     // rm is dangerous
  { tool: "shell", pattern: "\"cmd\":\"sudo ", action: "deny" },   // sudo is dangerous
  { tool: "shell", action: "ask" },                     // Everything else asks
  { tool: "write", action: "ask" },                     // Writes ask
  { tool: "edit", action: "ask" },                      // Edits ask
];

// ============================================================================
// Permission Store
// ============================================================================

let rules: PermissionRule[] = [...DEFAULT_RULES];

export function loadPermissions(): void {
  const configPath = join(homedir(), ".meow", "permissions.json");

  try {
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      const config = JSON.parse(content);
      if (config.rules && Array.isArray(config.rules)) {
        rules = [...config.rules, ...DEFAULT_RULES];  // User rules take precedence
      }
    }
  } catch {
    // Use default rules
  }
}

export function getRules(): PermissionRule[] {
  return rules;
}

export function checkPermission(toolName: string, input?: unknown): PermissionResult {
  // Find matching rule
  for (const rule of rules) {
    if (rule.tool !== toolName) continue;

    // Check pattern if specified
    if (rule.pattern && input) {
      const inputStr = JSON.stringify(input);
      const regex = new RegExp(rule.pattern);
      if (!regex.test(inputStr)) continue;
    }

    return { action: rule.action, reason: rule.pattern ? `matched pattern: ${rule.pattern}` : `rule for ${toolName}` };
  }

  // No matching rule - default to ask
  return { action: "ask" };
}

export async function promptPermission(toolName: string, input?: unknown): Promise<boolean> {
  const inputStr = input ? JSON.stringify(input).slice(0, 100) : "";

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = `${toolName}${inputStr ? ` (${inputStr}...)` : ""}`;

  return new Promise((resolve) => {
    rl.question(
      `\n${colors.yellow}⚠️  Permission required for: ${question}${colors.reset}\nAllow? [y/n/a] `,
      (answer) => {
        rl.close();
        const normalized = answer.toLowerCase().trim();
        if (normalized === "a") {
          // Add rule and allow
          addRule(toolName, inputStr ? `^${escapeRegex(inputStr)}` : undefined, "allow");
          resolve(true);
        } else {
          resolve(normalized === "y");
        }
      }
    );
  });
}

// ============================================================================
// Rule Management
// ============================================================================

export function addRule(tool: string, pattern: string | undefined, action: PermissionAction): void {
  const rule: PermissionRule = { tool, action };
  if (pattern) rule.pattern = pattern;

  // Remove existing rule for same tool+pattern
  rules = rules.filter((r) => !(r.tool === tool && r.pattern === pattern));

  // Add at beginning (user rules take precedence)
  rules.unshift(rule);
}

export function removeRule(tool: string, pattern?: string): boolean {
  const before = rules.length;
  rules = rules.filter((r) => !(r.tool === tool && r.pattern === pattern));
  return rules.length < before;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================================
// Colors (for prompts)
// ============================================================================

const colors = {
  yellow: "\x1b[33m",
  reset: "\x1b[0m",
};

// ============================================================================
// Initialize
// ============================================================================

loadPermissions();
