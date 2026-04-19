/**
 * skills/perms.ts
 *
 * /perms skill — inspect and test the pattern-matching permission system.
 *
 * Usage:
 *   /perms                    — list all active rules
 *   /perms check <tool> <input> — test permission check for a tool
 *
 * Examples:
 *   /perms check shell "git status"
 *   /perms check shell "rm -rf /"
 *   /perms check write "/path/to/file.txt"
 *   /perms check shell "npm install"
 */
import { checkPermission, checkPermissionSimple, getRules, type Skill, type SkillContext, type SkillResult } from "../sidecars/permissions.ts";

export const perms: Skill = {
  name: "perms",
  description: "Inspect and test pattern-matching permission rules",
  aliases: ["permissions", "perm"],

  async execute(args: string, _context: SkillContext): Promise<SkillResult> {
    const trimmed = args.trim();

    if (!trimmed) {
      return listRules();
    }

    const parts = trimmed.split(/\s+/);
    const subcommand = parts[0].toLowerCase();

    if (subcommand === "check" && parts.length >= 3) {
      const tool = parts[1];
      const input = parts.slice(2).join(" ");
      return checkPermissionCmd(tool, input);
    }

    if (subcommand === "check" && parts.length === 2) {
      const tool = parts[1];
      return checkToolRules(tool);
    }

    if (subcommand === "list" || subcommand === "ls") {
      return listRules();
    }

    return {
      content: `Usage: /perms [check <tool> <input>]

Commands:
  /perms              List all active permission rules
  /perms check <tool> <input>   Test permission for a tool and input
  /perms check <tool>           Show rules for a specific tool

Examples:
  /perms check shell "git status"
  /perms check shell "rm -rf /"
  /perms check write "/path/to/file.txt"
`,
    };
  },
};

function listRules(): SkillResult {
  const rules = getRules();
  const lines: string[] = [
    "## Permission Rules",
    "",
    "| # | Tool   | Pattern                  | Action | Description                        |",
    "|-- | ------ | ------------------------ | ------ | ---------------------------------- |",
  ];

  rules.forEach((rule, i) => {
    const pat = rule.pattern ?? "(any)";
    const desc = rule.description ?? "";
    lines.push(`| ${i + 1} | ${rule.tool.padEnd(6)} | ${pat.substring(0, 24).padEnd(24)} | ${rule.action.padEnd(6)} | ${desc.substring(0, 34).padEnd(34)} |`);
  });

  lines.push("");
  lines.push(`Total: ${rules.length} rules`);

  return { content: lines.join("\n") };
}

function checkToolRules(tool: string): SkillResult {
  const rules = getRules().filter((r) => r.tool === tool);
  if (rules.length === 0) {
    return { content: `No rules found for tool: ${tool}` };
  }

  const lines: string[] = [`## Rules for: ${tool}`, ""];
  rules.forEach((rule) => {
    const pat = rule.pattern ?? "(any — tool-level)";
    lines.push(`  [${rule.action.toUpperCase().padEnd(4)}]  ${pat}  ${rule.description ?? ""}`);
  });

  return { content: lines.join("\n") };
}

function checkPermissionCmd(tool: string, input: string): SkillResult {
  // Strip outer shell quotes so pattern matching works cleanly
  let cleanInput = input;
  if ((cleanInput.startsWith("'") && cleanInput.endsWith("'")) ||
      (cleanInput.startsWith('"') && cleanInput.endsWith('"'))) {
    cleanInput = cleanInput.slice(1, -1);
  }

  let result;
  if (tool === "shell") {
    result = checkPermissionSimple(tool, cleanInput);
  } else {
    result = checkPermission(tool, cleanInput);
  }

  const icon = result.action === "allow" ? "✅" : result.action === "deny" ? "🚫" : "❓";
  const actionLabel = result.action.toUpperCase().padEnd(4);

  const lines: string[] = [
    `${icon} **${actionLabel}** — ${result.reason ?? "no reason"}`,
    "",
    `Tool:    ${tool}`,
    `Input:   ${input}`,
    `Action:  ${result.action}`,
    `Reason:  ${result.reason ?? "default — no matching rule"}`,
  ];

  if (result.rule?.pattern) {
    lines.push(`Rule:    ${result.rule.pattern}`);
  }

  return { content: lines.join("\n") };
}
