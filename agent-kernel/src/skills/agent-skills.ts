/**
 * agent-skills.ts
 * # Harvest: agent-skills from vercel-labs

**Source:** `https://github.com/vercel-labs/agent-skills`

## Core Trick

Reusable skill definitions that agents can invoke for common tasks. Skill registry with discoverability.

## Minimal Slice for Meow

Implement as `src/sidecars/skill-registry.ts`:
1. Read skills from `~/.agent-kernel/skills/`
2. Parse skill definition format
3. Register via existing registerSkill()
4. `/skills` for discovery

## Why Worth It

- Skill discoverability and reuse
- File-based skill installation
- Community skill sharing
 *
 * Harvested from: https://github.com/vercel-labs/agent-skills
 * Why: Vercel's skill system for AI agents. Provides reusable skill definitions that agents can invoke for common tasks.
 * Minimal slice: A minimal agent-skills loader: reads skill definitions from ~/.agent-kernel/skills/, registers them dynamically, exposes /skills command.
 */

import { type Skill } from "./loader.ts";

const DESCRIPTION = `# Harvest: agent-skills from vercel-labs

**Source:** \`https://github.com/vercel-labs/agent-skills\`

## Core Trick

Reusable skill definitions that agents can invoke for common tasks. Skill registry with discoverability.

## Minimal Slice for Meow

Implement as \`src/sidecars/skill-registry.ts\`:
1. Read skills from \`~/.agent-kernel/skills/\`
2. Parse skill definition format
3. Register via existing registerSkill()
4. \`/skills\` for discovery

## Why Worth It

- Skill discoverability and reuse
- File-based skill installation
- Community skill sharing`;

export const agent_skills: Skill = {
  name: "agent-skills",
  description: DESCRIPTION,
  async execute(context) {
    // TODO: Implement agent-skills capability from https://github.com/vercel-labs/agent-skills
    // A minimal agent-skills loader: reads skill definitions from ~/.agent-kernel/skills/, registers them dynamically, exposes /skills command.
    return { success: true, message: "agent-skills capability" };
  },
};

