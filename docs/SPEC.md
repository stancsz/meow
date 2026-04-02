# Meow — Lean Sovereign Agent

**Version:** 3.0
**Date:** April 2, 2026
**Inspired by:** Claude Code (Anthropic), Claw Code (instructkr)

---

## Philosophy

> *"A lean agent that builds itself. No bloat. No delegation overhead. Just the loop."*

Meow is a **stateless, self-contained agent loop** that directly executes tasks against your codebase. It embodies the Claude Code architectural pattern:

```
User → messages[] → LLM API → response
                         ↓
              tool_use? → execute → loop
              else → return text
```

The core loop is ~50-100 lines. Everything else is bloat.

---

## Core Loop

```typescript
while (iterations < maxIterations) {
  const response = await llm.chat.completions.create({ model, messages, tools });
  const { content, tool_calls } = response;

  if (tool_calls?.length > 0) {
    for (const { function: { name, arguments } } of tool_calls) {
      const result = await tools[name](JSON.parse(arguments));
      messages.push({ role: "tool", content: result });
    }
    continue;
  }

  return content;
}
```

---

## Design Principles

1. **Lean** — No dispatcher, no task queues, no gas tank, no heartbeat
2. **Self-contained** — Single CLI entry point, no external sub-agent delegation
3. **Sovereign** — BYOK (Bring Your Own Keys), BYOI (Bring Your Own Infrastructure)
4. **Self-building** — The agent modifies its own code when instructed

---

## Architecture

```
┌─────────────────────────────────────┐
│           CLI Entry Point           │
│         meow/cli/index.ts           │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│           Lean Agent Core           │
│     meow/src/core/lean-agent.ts     │
│                                     │
│  - runLeanAgent(prompt, options)    │
│  - Core loop (~50-100 lines)        │
│  - Inline tool execution             │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│         Tool Handlers               │
│                                     │
│  read(path)     → Bun.readFile()    │
│  write(path, c) → Bun.write()       │
│  shell(cmd)     → execSync()        │
│  git(args)      → git command       │
└─────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│         LLM: MiniMax API            │
│   OpenAI-compatible at api.minimax.io/v1  │
│   Model: MiniMax-M2.7              │
└─────────────────────────────────────┘
```

---

## Tools

| Tool | Purpose | Implementation |
|------|---------|-----------------|
| `read` | Read file contents | `Bun.file(path).text()` |
| `write` | Write file contents | `Bun.write(path, content)` |
| `shell` | Execute shell command | `execSync(cmd)` |
| `git` | Git operations | `execSync("git " + args)` |

---

## CLI Usage

```bash
# Interactive mode (prompts for input)
bun run start

# Single task mode
bun run start "Read package.json and tell me the dependencies"

# With custom model
MINIMAX_API_KEY=xxx bun run start "Hello world"
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MINIMAX_API_KEY` | required | MiniMax API key |
| `MINIMAX_BASE_URL` | `https://api.minimax.io/v1` | API base URL |
| `MINIMAX_MODEL` | `MiniMax-M2.7` | Model name |

---

## What Was Removed (v2 → v3)

| Component | Reason |
|-----------|--------|
| `opencode-worker.ts` | No external delegation |
| `dispatcher.ts` | Task queuing overhead |
| `runtime.ts` | Heavy bootstrap, server transport |
| `heartbeat.ts` | Continuous mode not needed |
| `extensions.ts` | Plugin registry overhead |
| `payments.ts`, `gas.ts` | No billing |
| `providers/` | MiniMax only |
| `skills.ts` | Dynamic loading overhead |

---

## File Structure

```
meow/
├── cli/
│   └── index.ts          # CLI entry point
└── src/
    └── core/
        ├── lean-agent.ts # Core agent loop
        ├── llm.ts        # MiniMax API client
        ├── types.ts      # Core types
        └── tools.ts      # Tool definitions
```

---

*Meow — Stupidly Simple. Stupidly Scalable.*
