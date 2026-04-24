// permissions.ts
//
// Permission sidecar with pattern-matching rules.
// Allows/denies/asks before tool execution based on rules.
//
// Pattern types supported:
//   regex:  /^git /       - anchored regex
//   glob:   glob patterns with * and ** wildcards
//   prefix: plain prefix match (no special chars)
//   negate: patterns starting with ! are negated
//   field:  field:value matches JSON field values
//
// Rules are loaded from ~/.agent-kernel/permissions.json
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as readline from "node:readline";

// ============================================================================
// Types
// ============================================================================

export type PermissionAction = "allow" | "deny" | "ask";

export interface PermissionRule {
  tool: string;
  pattern?: string;       // Optional pattern (regex, glob, prefix, field, or negate)
  action: PermissionAction;
  description?: string;  // Human-readable description for the rule
}

export interface PermissionContext {
  input?: unknown;        // Tool input args
}

export interface PermissionResult {
  action: PermissionAction;
  reason?: string;
  rule?: PermissionRule;  // The rule that matched
}

// ============================================================================
// Pattern Matching Engine
// ============================================================================

/**
 * Check if a pattern matches the input string.
 * Supports multiple pattern syntaxes:
 *   ^regex$       — anchored regex (detected when starts with ^)
 *   glob:*        — glob with * and ** wildcards
 *   field:value   — match specific field in JSON: "cmd:git add"
 *   !pattern      — negated (returns true when pattern does NOT match)
 *   plain prefix  — substring match (no special chars)
 */
function patternMatches(pattern: string, inputStr: string): boolean {
  // Handle negated patterns
  if (pattern.startsWith("!")) {
    return !patternMatches(pattern.slice(1), inputStr);
  }

  // Field-based matching: "field:value" matches JSON field values
  if (pattern.includes(":")) {
    const colonIdx = pattern.indexOf(":");
    const field = pattern.slice(0, colonIdx);
    const value = pattern.slice(colonIdx + 1);
    try {
      const parsed = JSON.parse(inputStr);
      if (typeof parsed === "object" && parsed !== null) {
        const fieldValue = (parsed as Record<string, unknown>)[field];
        return String(fieldValue ?? "").startsWith(value);
      }
    } catch {
      // Not JSON — do plain prefix match on the field:value syntax
    }
    // Fallback: look for "field":"value" or "field":"value" in stringified JSON
    const quotedField = `"${field}":"`;
    const fieldIdx = inputStr.indexOf(quotedField);
    if (fieldIdx >= 0) {
      const afterField = inputStr.slice(fieldIdx + quotedField.length);
      return afterField.startsWith(value);
    }
    return false;
  }

  // Regex matching: anchored patterns (start with ^) or contain regex metacharacters
  if (pattern.startsWith("^") || /[.+*?\[\]{}]/.test(pattern)) {
    try {
      const regex = new RegExp(pattern);
      return regex.test(inputStr);
    } catch {
      // Invalid regex — fall through to prefix matching
    }
  }

  // Glob matching: patterns with * or **
  if (pattern.includes("*")) {
    const regexStr = pattern
      .replace(/\./g, "\\.")
      .replace(/\*\*/g, "\0GLOBSTAR\0")
      .replace(/\*/g, "[^/]*")
      .replace(/\0GLOBSTAR\0/g, ".*")
      .replace(/\[(\^?)\.\*/g, (_, neg) => (neg ? "[^" : "["));
    try {
      const regex = new RegExp(`^${regexStr}$`);
      return regex.test(inputStr);
    } catch {
      // Fall through to prefix
    }
  }

  // Plain prefix match
  return inputStr.includes(pattern);
}

// ============================================================================
// Default Rules
// ============================================================================

const DEFAULT_RULES: PermissionRule[] = [
  // Safe read-only operations — always allowed
  { tool: "read", action: "allow", description: "Reading files is safe" },
  { tool: "glob", action: "allow", description: "Finding files is safe" },
  { tool: "grep", action: "allow", description: "Searching files is safe" },
  { tool: "git", action: "allow", description: "Git is generally safe" },

  // Shell commands — pattern-based allow/deny using field:value syntax
  // (shell tool inputs are JSON: {"cmd": "git status"})
  { tool: "shell", pattern: "cmd:git ", action: "allow", description: "Git commands" },
  { tool: "shell", pattern: "cmd:npm ", action: "allow", description: "npm commands" },
  { tool: "shell", pattern: "cmd:bun ", action: "allow", description: "bun commands" },
  { tool: "shell", pattern: "cmd:cd ", action: "allow", description: "cd is safe" },
  { tool: "shell", pattern: "cmd:ls", action: "allow", description: "ls is safe" },
  { tool: "shell", pattern: "cmd:pwd", action: "allow", description: "pwd is safe" },
  { tool: "shell", pattern: "cmd:cat ", action: "allow", description: "cat is safe" },
  { tool: "shell", pattern: "cmd:mkdir ", action: "allow", description: "mkdir is safe" },
  { tool: "shell", pattern: "cmd:node ", action: "allow", description: "node is safe" },
  { tool: "shell", pattern: "cmd:npx ", action: "allow", description: "npx is safe" },
  { tool: "shell", pattern: "cmd:echo ", action: "allow", description: "echo is safe" },
  { tool: "shell", pattern: "cmd:head ", action: "allow", description: "head is safe" },
  { tool: "shell", pattern: "cmd:tail ", action: "allow", description: "tail is safe" },
  { tool: "shell", pattern: "cmd:wc ", action: "allow", description: "wc is safe" },
  { tool: "shell", pattern: "cmd:grep ", action: "allow", description: "grep is safe" },
  { tool: "shell", pattern: "cmd:find ", action: "allow", description: "find is safe" },
  { tool: "shell", pattern: "cmd:sed ", action: "allow", description: "sed is safe" },
  { tool: "shell", pattern: "cmd:awk ", action: "allow", description: "awk is safe" },

  // Dangerous shell commands — always denied
  { tool: "shell", pattern: "cmd:rm ", action: "deny", description: "rm is dangerous" },
  { tool: "shell", pattern: "cmd:rm -rf /", action: "deny", description: "rm -rf / is catastrophic" },
  { tool: "shell", pattern: "cmd:sudo ", action: "deny", description: "sudo is dangerous" },
  { tool: "shell", pattern: "cmd:dd ", action: "deny", description: "dd is dangerous" },
  { tool: "shell", pattern: "cmd:mkfs ", action: "deny", description: "mkfs is destructive" },
  { tool: "shell", pattern: "cmd:> /dev/", action: "deny", description: "redirect to /dev is suspicious" },

  // Write operations — allow by default in orchestrator/daemon mode
  // User can override via ~/.meow/permissions.json
  { tool: "write", action: "allow", description: "Writing files is allowed by default" },
  { tool: "edit", action: "allow", description: "Editing files is allowed by default" },
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
        // User rules take precedence — they are checked first
        const userRules: PermissionRule[] = config.rules.map((r: Partial<PermissionRule>) => ({
          tool: r.tool ?? "shell",
          pattern: r.pattern,
          action: r.action ?? "ask",
          description: r.description,
        }));
        rules = [...userRules, ...DEFAULT_RULES];
      }
    }
  } catch {
    // Use default rules
  }
}

export function getRules(): PermissionRule[] {
  return rules;
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format rules as a human-readable string table.
 */
export function formatRules(): string {
  const lines: string[] = [];
  for (const rule of rules) {
    const pat = rule.pattern ?? "(any)";
    const action = rule.action.padEnd(4);
    const desc = rule.description ?? "";
    lines.push(`[${action}] ${rule.tool}: ${pat} — ${desc}`);
  }
  return lines.join("\n") || "(no rules)";
}

// ============================================================================
// Pattern Testing
// ============================================================================

export interface PatternTestResult {
  matches: boolean;
  wouldAction: PermissionAction;
  patternType: string;
  reason: string;
}

/**
 * Test a raw pattern against an input string and report what action it would trigger.
 * Does NOT mutate the rule set.
 */
export function testPattern(toolName: string, pattern: string, inputStr: string): PatternTestResult {
  const inputJson = JSON.stringify({ cmd: inputStr });
  const matched = patternMatches(pattern, inputJson);

  // Find what action the first matching rule would trigger
  for (const rule of rules) {
    if (rule.tool !== toolName) continue;
    if (!rule.pattern) {
      return {
        matches: true,
        wouldAction: rule.action,
        patternType: "tool-level",
        reason: rule.description ?? `tool-level rule for ${toolName}`,
      };
    }
    if (patternMatches(rule.pattern, inputJson)) {
      return {
        matches: true,
        wouldAction: rule.action,
        patternType: detectPatternType(rule.pattern),
        reason: rule.description ?? `matched pattern: ${rule.pattern}`,
      };
    }
  }

  return {
    matches,
    wouldAction: "ask",
    patternType: detectPatternType(pattern),
    reason: "no matching rule — defaults to ask",
  };
}

function detectPatternType(pattern: string): string {
  if (pattern.startsWith("!")) return "negated";
  if (pattern.startsWith("^")) return "regex (anchored)";
  if (pattern.includes(":")) return "field:value";
  if (pattern.includes("**") || (pattern.includes("*") && !pattern.includes("**"))) return "glob";
  return "plain prefix";
}

/**
 * Check if a tool+input passes the permission system.
 * Rules are evaluated in order; first match wins.
 *
 * @param toolName  The name of the tool (e.g., "shell", "write")
 * @param input     The tool input (will be stringified for pattern matching)
 * @returns PermissionResult with the action and which rule matched
 */
export function checkPermission(toolName: string, input?: unknown): PermissionResult {
  const inputStr = input !== undefined ? (typeof input === "string" ? input : JSON.stringify(input)) : "";

  for (const rule of rules) {
    if (rule.tool !== toolName) continue;

    // No pattern — tool-level match
    if (!rule.pattern) {
      return {
        action: rule.action,
        reason: rule.description ?? `rule for ${toolName}`,
        rule,
      };
    }

    // Check pattern
    if (patternMatches(rule.pattern, inputStr)) {
      return {
        action: rule.action,
        reason: rule.description ?? `matched pattern: ${rule.pattern}`,
        rule,
      };
    }
  }

  // No matching rule — default to ask
  return { action: "ask" };
}

/**
 * Convenience: check permission by tool name and a simple command string.
 * Useful for testing: checkPermissionSimple("shell", "git status")
 */
export function checkPermissionSimple(toolName: string, command: string): PermissionResult {
  // Wrap command in the JSON format used by the shell tool: {cmd: "..."}
  // checkPermission will then stringify this to {"cmd":"..."} for pattern matching
  return checkPermission(toolName, { cmd: command });
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
// Learning Layer - Auto-Approve After Threshold
// ============================================================================

export const APPROVAL_THRESHOLD = 3;
export const approvalCount = new Map<string, number>();

function hashParams(params: unknown): string {
  return JSON.stringify(params || {});
}

function isDangerous(params: unknown): boolean {
  if (params === undefined || params === null) return false;
  const str = typeof params === "string" ? params : JSON.stringify(params);
  return /\brm\s+-rf\b/i.test(str) ||
         /\bdd\b/.test(str) ||
         /\bsudo\s+rm\b/i.test(str);
}

/**
 * Check permission with auto-approve learning.
 * Promotes "ask" to "allow" after APPROVAL_THRESHOLD approvals.
 * 
 * Flow:
 * 1. Always block dangerous patterns
 * 2. Check learning layer FIRST (before default rules)
 * 3. Check existing rules (default allow/deny/ask patterns)
 */
export function checkPermissionWithLearning(
  tool: string,
  params?: unknown
): PermissionResult {
  // Always block dangerous patterns
  if (isDangerous(params)) {
    return { action: "deny", reason: "dangerous pattern" };
  }

  // Check learning layer FIRST (before default rules)
  // This allows learned commands to override default allow rules
  const key = `${tool}:${hashParams(params)}`;
  const count = approvalCount.get(key) || 0;

  if (count >= APPROVAL_THRESHOLD) {
    return { action: "allow", reason: `learned pattern (${count} approvals)` };
  }

  // Check existing rules (default allow/deny patterns)
  const existing = checkPermission(tool, params);
  return existing;
}

/**
 * Record user approval for learning.
 * Call this when user approves a permission request.
 */
export function recordApproval(tool: string, params?: unknown): void {
  const key = `${tool}:${hashParams(params)}`;
  approvalCount.set(key, (approvalCount.get(key) || 0) + 1);
  // Persist on each approval
  saveLearnedPatterns();
}

/**
 * Reset all learned approval patterns.
 * Call this for /permissions reset command.
 */
export function resetLearnedPatterns(): void {
  approvalCount.clear();
  // Also clear from persistence
  saveLearnedPatterns();
}

/**
 * Save learned patterns to permissions.json for persistence.
 */
function saveLearnedPatterns(): void {
  const configPath = join(homedir(), ".meow", "permissions.json");
  
  // Build learned patterns object
  const learnedPatterns: Record<string, number> = {};
  for (const [key, count] of approvalCount) {
    learnedPatterns[key] = count;
  }
  
  try {
    let config: any = {};
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      config = JSON.parse(content);
    }
    config.learnedPatterns = learnedPatterns;
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch {
    // Silently fail - persistence is not critical
  }
}

/**
 * Load learned patterns from permissions.json on startup.
 */
function loadLearnedPatterns(): void {
  const configPath = join(homedir(), ".meow", "permissions.json");
  
  try {
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      const config = JSON.parse(content);
      if (config.learnedPatterns && typeof config.learnedPatterns === "object") {
        for (const [key, count] of Object.entries(config.learnedPatterns)) {
          if (typeof count === "number") {
            approvalCount.set(key, count);
          }
        }
      }
    }
  } catch {
    // Silently fail
  }
}

// ============================================================================
// Initialize
// ============================================================================

loadPermissions();
loadLearnedPatterns();

