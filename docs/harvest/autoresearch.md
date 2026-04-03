---
name: autoresearch
repo: https://github.com/karpathy/autoresearch
why: Andrej Karpathy's autonomous research agent. Self-directed learning and hypothesis testing loop for AI research.
minimalSlice: "A minimal autoresearch skill: /research command that takes a research question, performs iterative web search + reasoning, generates hypotheses, and validates against sources."
fit: skill
status: pending
complexity: 4
---

# Harvest: autoresearch from karpathy

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
