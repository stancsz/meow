/**
 * mirofish.ts
 * # Harvest: MiroFish from 666ghj

**Source:** `https://github.com/666ghj/MiroFish`

## Core Trick

AI-powered Miro board interaction for visual collaboration and diagramming.

## Minimal Slice for Meow

Implement as `src/skills/miro.ts`:
1. `/board` command for Miro interaction
2. OAuth authentication with Miro API
3. Read/write widgets to boards
4. Visual thinking and diagramming

## Why Worth It

- Visual collaboration capability
- Board-based brainstorming
- Differentiator for creative tasks
 *
 * Harvested from: https://github.com/666ghj/MiroFish
 * Why: AI-powered Miro board interaction. Allows agents to read/write boards for visual collaboration and diagramming.
 * Minimal slice: A minimal mirofish skill: /board command that authenticates with Miro API, reads/writes widgets to boards for visual thinking.
 */

import { type Skill } from "./loader.ts";

export const mirofish: Skill = {
  name: "mirofish",
  description: "# Harvest: MiroFish from 666ghj

**Source:** `https://github.com/666ghj/MiroFish`

## Core Trick

AI-powered Miro board interaction for visual collaboration and diagramming.

## Minimal Slice for Meow

Implement as `src/skills/miro.ts`:
1. `/board` command for Miro interaction
2. OAuth authentication with Miro API
3. Read/write widgets to boards
4. Visual thinking and diagramming

## Why Worth It

- Visual collaboration capability
- Board-based brainstorming
- Differentiator for creative tasks",
  async execute(context) {
    // TODO: Implement mirofish capability from https://github.com/666ghj/MiroFish
    // A minimal mirofish skill: /board command that authenticates with Miro API, reads/writes widgets to boards for visual thinking.
    return { success: true, message: "mirofish capability" };
  },
};
