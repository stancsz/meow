/**
 * autoresearch.ts
 * # Harvest: autoresearch from karpathy

**Source:** `https://github.com/karpathy/autoresearch`

## Core Trick

Autonomous research agent with OODA-style loop: question → search → synthesize → hypothesize → validate → repeat.

## Minimal Slice for Meow

Implement as `src/skills/autoresearch.ts`:
1. `/research <question>` command
2. Web search for relevant information
3. Synthesize findings into hypotheses
4. Validate against sources
5. Report findings

## Why Worth It

- Autonomous deep research capability
- Complements the evolve.ts OODA loop
- High-value for complex research tasks
 *
 * Harvested from: https://github.com/karpathy/autoresearch
 * Why: Andrej Karpathy's autonomous research agent. Self-directed learning and hypothesis testing loop for AI research.
 * Minimal slice: A minimal autoresearch skill: /research command that takes a research question, performs iterative web search + reasoning, generates hypotheses, and validates against sources.
 */

import { type Skill } from "./loader.ts";

export const autoresearch: Skill = {
  name: "autoresearch",
  description: "# Harvest: autoresearch from karpathy

**Source:** `https://github.com/karpathy/autoresearch`

## Core Trick

Autonomous research agent with OODA-style loop: question → search → synthesize → hypothesize → validate → repeat.

## Minimal Slice for Meow

Implement as `src/skills/autoresearch.ts`:
1. `/research <question>` command
2. Web search for relevant information
3. Synthesize findings into hypotheses
4. Validate against sources
5. Report findings

## Why Worth It

- Autonomous deep research capability
- Complements the evolve.ts OODA loop
- High-value for complex research tasks",
  async execute(context) {
    // TODO: Implement autoresearch capability from https://github.com/karpathy/autoresearch
    // A minimal autoresearch skill: /research command that takes a research question, performs iterative web search + reasoning, generates hypotheses, and validates against sources.
    return { success: true, message: "autoresearch capability" };
  },
};
