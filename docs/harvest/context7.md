---
name: context7
repo: https://github.com/upstash/context7
why: MCP server for Retrieval-Augmented Generation using context from project files. Provides relevant code context to LLMs automatically.
minimalSlice: "A minimal context7 MCP integration: connects to context7-compatible servers, retrieves relevant code snippets based on user intent, injects into conversation context."
fit: sidecar
status: pending
complexity: 2
---

# Harvest: context7 from upstash

**Source:** `https://github.com/upstash/context7`

## Core Trick

MCP server for RAG-based context retrieval from project files. Automatically finds and injects relevant code snippets.

## Minimal Slice for Meow

Implement as `src/sidecars/context7.ts`:
1. Connect to context7-compatible MCP servers
2. Query for relevant code based on user intent
3. Inject retrieved snippets into conversation context

## Why Worth It

- Improves LLM responses with project-specific context
- Reduces token waste on irrelevant context
- MCP integration fits existing architecture
