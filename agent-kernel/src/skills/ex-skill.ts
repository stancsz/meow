/**
 * ex-skill.ts
 * # Harvest: ex-skill from titanwings

**Source:** `https://github.com/titanwings/ex-skill`

## Core Trick

External skill system that allows agents to define and register new capabilities dynamically at runtime using natural language descriptions.

## Minimal Slice for Meow

Implement as `src/sidecars/ex-skill.ts`:
1. Parse natural language skill requests
2. Generate TypeScript skill templates
3. Register dynamically via registerSkill()

## Why Worth It

- Enables on-demand capability expansion
- Core never grows but skills can evolve
- High value for the on-demand learning feature you're building
 *
 * Harvested from: https://github.com/titanwings/ex-skill
 * Why: External skill system for extending agent capabilities at runtime. Lets you define new skills from natural language descriptions without code changes.
 * Minimal slice: A minimal ex-skill sidecar: given a natural language skill request, parse intent, generate a TypeScript skill template, and register it dynamically.
 */

import { type Skill } from "./loader.ts";

const DESCRIPTION = `# Harvest: ex-skill from titanwings

**Source:** \`https://github.com/titanwings/ex-skill\`

## Core Trick

External skill system that allows agents to define and register new capabilities dynamically at runtime using natural language descriptions.

## Minimal Slice for Meow

Implement as \`src/sidecars/ex-skill.ts\`:
1. Parse natural language skill requests
2. Generate TypeScript skill templates
3. Register dynamically via registerSkill()

## Why Worth It

- Enables on-demand capability expansion
- Core never grows but skills can evolve
- High value for the on-demand learning feature you're building`;

export const ex_skill: Skill = {
  name: "ex-skill",
  description: DESCRIPTION,
  async execute(context) {
    // TODO: Implement ex-skill capability from https://github.com/titanwings/ex-skill
    // A minimal ex-skill sidecar: given a natural language skill request, parse intent, generate a TypeScript skill template, and register it dynamically.
    return { success: true, message: "ex-skill capability" };
  },
};
