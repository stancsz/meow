/**
 * colleague-skill.ts
 * # Harvest: colleague-skill from titanwings

**Source:** `https://github.com/titanwings/colleague-skill`

## Core Trick

Multi-agent collaboration allowing delegation of subtasks to specialized agents with result aggregation.

## Minimal Slice for Meow

Implement as `src/sidecars/colleague.ts`:
1. `/delegate <task>` command
2. Spawn lean-agent for subtask
3. Collect and merge results
4. Share context between agents

## Why Worth It

- Enables parallel task processing
- Composable agent workflows
- Delegation pattern for complex tasks
 *
 * Harvested from: https://github.com/titanwings/colleague-skill
 * Why: Multi-agent collaboration framework. Allows multiple AI agents to work together, delegate tasks, and share context.
 * Minimal slice: A minimal colleague-skill: exposes a /delegate command that spawns a sub-agent for a specific task, collects results, and merges back.
 */

import { type Skill } from "./loader.ts";

const DESCRIPTION = `# Harvest: colleague-skill from titanwings

**Source:** \`https://github.com/titanwings/colleague-skill\`

## Core Trick

Multi-agent collaboration allowing delegation of subtasks to specialized agents with result aggregation.

## Minimal Slice for Meow

Implement as \`src/sidecars/colleague.ts\`:
1. \`/delegate <task>\` command
2. Spawn lean-agent for subtask
3. Collect and merge results
4. Share context between agents

## Why Worth It

- Enables parallel task processing
- Composable agent workflows
- Delegation pattern for complex tasks`;

export const colleague_skill: Skill = {
  name: "colleague-skill",
  description: DESCRIPTION,
  async execute(context) {
    // TODO: Implement colleague-skill capability from https://github.com/titanwings/colleague-skill
    // A minimal colleague-skill: exposes a /delegate command that spawns a sub-agent for a specific task, collects results, and merges back.
    return { success: true, message: "colleague-skill capability" };
  },
};
