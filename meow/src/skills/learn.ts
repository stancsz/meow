/**
 * learn.ts
 *
 * On-demand learning skill for Meow.
 * Usage: /learn <capability> — learn something new
 *
 * When the user wants to do something Meow doesn't have skills/MCP for,
 * this skill dynamically learns and implements the capability.
 */

import type { Skill, SkillContext, SkillResult } from "./loader.ts";

export const learn: Skill = {
  name: "learn",
  description: "Learn a new capability on-demand. /learn research → learns research skill",
  aliases: ["on-demand-learn", "learn-capability"],

  async execute(args: string, context: SkillContext): Promise<SkillResult> {
    const { learnCapability, formatHarvestCandidates, formatLearnedList, detectCapabilityGap, getHarvestCandidates, initializeOnDemandLearner } = await import("../sidecars/on-demand-learner.ts");

    initializeOnDemandLearner();

    const arg = args.trim();

    // Handle flags
    if (arg === "--list" || arg === "list") {
      return {
        content: formatHarvestCandidates(),
      };
    }

    if (arg === "--status" || arg === "status") {
      return {
        content: formatLearnedList(),
      };
    }

    if (arg === "--auto" || arg === "auto") {
      // Auto-detect gaps
      const candidates = getHarvestCandidates();
      if (candidates.length === 0) {
        return {
          content: "No harvest candidates found. Add repos to docs/harvest/ to enable on-demand learning.",
        };
      }

      let output = "## On-Demand Learning - Available Capabilities\n\n";
      output += "Run `/learn <name>` to learn any of these:\n\n";

      for (const c of candidates.slice(0, 10)) {
        const icon = c.status === "learned" ? "✅" : "📋";
        output += `  ${icon} ${c.name}\n`;
        output += `      ${c.why.slice(0, 70)}...\n\n`;
      }

      output += "\nExamples:\n";
      output += "  /learn research     — Learn autonomous research\n";
      output += "  /learn deploy       — Learn GCP/cloud deployment\n";
      output += "  /learn kafka        — Learn Kafka streaming\n";

      return { content: output };
    }

    // Check for capability gaps in user intent
    const gaps = detectCapabilityGap(arg);
    if (gaps.length > 0) {
      return {
        content: `🎯 Detected capability gaps: ${gaps.join(", ")}

Meow is learning! Run /learn <gap> to learn each capability.

Alternatively, run /learn --list to see all available harvest candidates.`,
      };
    }

    if (!arg) {
      return {
        content: `🐣 MEOW ON-DEMAND LEARN

Usage:
  /learn <capability>   Learn a new capability
  /learn --list         List available capabilities to learn
  /learn --status       Show learned capabilities
  /learn --auto         Auto-detect gaps

Examples:
  /learn research       Learn autonomous research skill
  /learn deploy         Learn GCP deployment skill
  /learn kafka          Learn Kafka streaming

Available to learn: ${getHarvestCandidates().map(c => c.name).join(", ")}`,
      };
    }

    // Learn the requested capability
    const result = await learnCapability(arg);

    if (!result.success) {
      // Suggest closest match
      const candidates = getHarvestCandidates();
      const closest = candidates.find((c) =>
        c.name.toLowerCase().includes(arg.toLowerCase()) ||
        arg.toLowerCase().includes(c.name.toLowerCase())
      );

      if (closest) {
        return {
          content: `${result.message}

Did you mean: /learn ${closest.name}?`,
        };
      }

      return {
        content: result.message,
      };
    }

    return {
      content: result.message,
    };
  },
};
