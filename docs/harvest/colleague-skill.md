---
name: colleague-skill
repo: https://github.com/titanwings/colleague-skill
why: Multi-agent collaboration framework. Allows multiple AI agents to work together, delegate tasks, and share context.
minimalSlice: "A minimal colleague-skill: exposes a /delegate command that spawns a sub-agent for a specific task, collects results, and merges back."
fit: sidecar
status: pending
complexity: 3
---

# Harvest: colleague-skill from titanwings

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
