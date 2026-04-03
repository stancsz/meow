---
name: ex-skill
repo: https://github.com/titanwings/ex-skill
why: External skill system for extending agent capabilities at runtime. Lets you define new skills from natural language descriptions without code changes.
minimalSlice: "A minimal ex-skill sidecar: given a natural language skill request, parse intent, generate a TypeScript skill template, and register it dynamically."
fit: sidecar
status: pending
complexity: 2
---

# Harvest: ex-skill from titanwings

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
