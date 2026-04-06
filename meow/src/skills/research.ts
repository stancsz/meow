/**
 * research.ts
 * ---
name: research
repo: https://github.com/assafelovic/gpt-researcher
why: Autonomous agentic research that plans, browses multiple sources, and synthesizes findings
minimalSlice: "Multi-agent: one planner + one execution agent. Uses Tavily for web search. Output: markdown report."
fit: skill
complexity: 3
status: pending
---

# Research Capability

Learn autonomous web research - multi-agent that browses, synthesizes, and reports.
 *
 * Harvested from: 
 * Why: 
 * Minimal slice: 
 */

import { type Skill } from "./loader.ts";

export const research: Skill = {
  name: "research",
  description: "---
name: research
repo: https://github.com/assafelovic/gpt-researcher
why: Autonomous agentic research that plans, browses multiple sources, and synthesizes findings
minimalSlice: "Multi-agent: one planner + one execution agent. Uses Tavily for web search. Output: markdown report."
fit: skill
complexity: 3
status: pending
---

# Research Capability

Learn autonomous web research - multi-agent that browses, synthesizes, and reports.",
  async execute(context) {
    // TODO: Implement research capability from 
    // 
    return { success: true, message: "research capability" };
  },
};
