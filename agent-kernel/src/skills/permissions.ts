/**
 * permissions.ts
 *
 * Skill to test and manage permission rules with pattern matching.
 * Usage: /permissions [check|list|add|remove|test] [args]
 */
import type { Skill, SkillContext, SkillResult } from "./loader.ts";
import {
  checkPermission,
  checkPermissionSimple,
  getRules,
  addRule,
  removeRule,
  formatRules,
  testPattern,
  type PermissionAction,
} from "../sidecars/permissions.ts";
export const permissions: Skill = {
  name: "permissions",
  description: "Test and manage pattern-matching permission rules",
  aliases: ["perm", "perms", "permcheck"],

  async execute(args: string, _ctx: SkillContext): Promise<SkillResult> {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0]?.toLowerCase();

    if (!sub || sub === "help" || sub === "--help") {
      return { content: HELP };
    }

    switch (sub) {
      case "check":
      case "test":
        return handleCheck(parts[1] || "shell", parts.slice(2).join(" "));
      case "list":
      case "rules":
        return handleList();
      case "add":
        return handleAdd(parts[1], parts[2], parts.slice(3).join(" "));
      case "remove":
        return handleRemove(parts[1], parts.slice(2).join(" "));
      case "testpattern":
        return handleTestPattern(parts[1] || "shell", parts[2], parts.slice(3).join(" "));
      default:
        return { content: "", error: "Unknown command. Run /permissions help." };
    }
  },
};
const HELP = [
  "MEOW PERMISSIONS SKILL",
  "",
  "Test and manage pattern-matching permission rules.",
  "",
  "Commands:",
  "  /permissions check <tool> <cmd>  Test a permission check",
  "  /permissions testpattern <tool> <pat> <input>  Test a pattern",
  "  /permissions list                  List all rules",
  "  /permissions add <tool> <action> <pattern>  Add a rule",
  "  /permissions remove <tool> <pattern>  Remove a rule",
  "",
  "Pattern types:",
  "  ^regex       Anchored regex (starts with ^)",
  "  glob:**/*.ts  Glob pattern (supports ** for directories)",
  "  field:value   Match JSON field value",
  "  !pattern      Negated (deny when NOT matched)",
  "  plain text    Substring match (case-insensitive)",
  "",
  "Examples:",
  "  /permissions check shell \"git status\"",
  "  /permissions check shell \"rm -rf /\"",
  "  /permissions testpattern shell \"^rm \" \"rm -rf /\"",
  "  /permissions list",
].join("\n");
function handleCheck(tool: string, command: string): SkillResult {
  const result = tool === "shell"
    ? checkPermissionSimple(tool, command)
    : checkPermission(tool, command);
  const icon = result.action === "allow" ? "[ALLOW]"
    : result.action === "deny" ? "[DENY] "
    : "[ASK]  "; 
  const lines = [
    "Permission check: " + icon + " tool=`" + tool + "` input=`" + command + "`",
    "Reason: " + (result.reason || "no matching rule"),
  ];
  if (result.rule?.description) lines.push("Description: " + result.rule.description);
  return { content: lines.join("\n") };
}
function handleList(): SkillResult {
  const rules = getRules();
  const out = ["## Permission Rules (" + rules.length + " total)", "", formatRules(), "",
    "Note: First matching rule wins. User rules take precedence over defaults."].join("\n");
  return { content: out };
}
function handleAdd(tool: string, action: string, pattern: string): SkillResult {
  if (!tool || !action || !pattern) {
    return { content: "", error: "Usage: /permissions add <tool> <allow|deny|ask> <pattern>" };
  }
  if (!["allow", "deny", "ask"].includes(action)) {
    return { content: "", error: "Invalid action: " + action + ". Use allow, deny, or ask." };
  }
  addRule(tool, pattern, action as PermissionAction);
  return { content: "Added rule: [" + action.toUpperCase() + "] " + tool + " pattern=`" + pattern + "`" + "\nRun /permissions list to see updated rules." };
}

function handleRemove(tool: string, pattern: string): SkillResult {
  if (!tool || !pattern) {
    return { content: "", error: "Usage: /permissions remove <tool> <pattern>" };
  }
  const removed = removeRule(tool, pattern);
  if (removed) {
    return { content: "Removed rule: " + tool + " pattern=`" + pattern + "`" };
  }
  return { content: "", error: "No rule found for " + tool + " with pattern: " + pattern };
}
function handleTestPattern(tool: string, pattern: string, testInput: string): SkillResult {
  if (!pattern || !testInput) {
    return { content: "", error: "Usage: /permissions testpattern <tool> <pattern> <input>" };
  }
  const result = testPattern(tool || "shell", pattern, testInput);
  const icon = result.matches ? "[MATCH]  " : "[NO MATCH]";
  const actionIcon = result.wouldAction === "allow" ? "[ALLOW]"
    : result.wouldAction === "deny" ? "[DENY] "
    : "[ASK]  "; 
  const lines = [
    "Pattern test: " + icon + " pattern=`" + pattern + "` (" + result.patternType + ")",
    "Test input: `" + testInput + "`",
    "Would action: " + actionIcon,
    "Matched: " + (result.matches ? "YES" : "NO"),
  ];
  return { content: lines.join("\n") };
}
