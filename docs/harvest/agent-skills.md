---
name: agent-skills
repo: https://github.com/vercel-labs/agent-skills
why: Vercel's skill system for AI agents. Provides reusable skill definitions that agents can invoke for common tasks.
minimalSlice: "A minimal agent-skills loader: reads skill definitions from ~/.agent-kernel/skills/, registers them dynamically, exposes /skills command."
fit: sidecar
status: pending
complexity: 2
---

# Harvest: agent-skills from vercel-labs

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

