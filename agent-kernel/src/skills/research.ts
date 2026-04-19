/**
 * research.ts - Harvested skill for research capability
 *
 * Autonomous agentic research that plans, browses multiple sources, and synthesizes findings.
 */

import { type Skill } from "./loader.ts";

const DESCRIPTION = `---
name: research
repo: https://github.com/assafelovic/gpt-researcher
why: Autonomous agentic research that plans, browses multiple sources, and synthesizes findings
minimalSlice: "Multi-agent: one planner + one execution agent. Uses Tavily for web search. Output: markdown report."
fit: skill
complexity: 3
status: pending
---

# Research Capability

Learn autonomous web research - multi-agent that browses, synthesizes, and reports.`;

export const research: Skill = {
  name: "research",
  description: DESCRIPTION,
  async execute(context) {
    // TODO: Implement research capability
    return { success: true, message: "research capability" };
  },
};
