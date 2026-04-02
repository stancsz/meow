# Meow

**A lean sovereign agent that builds itself.**

Meow is a self-contained CLI agent inspired by Claude Code's architecture. It's not a framework, not a platform, not a swarm — just a clean agent loop that directly executes tasks against your codebase.

```
User → messages[] → LLM API → response
                         ↓
              tool_use? → execute → loop
              else → return text
```

## Why

Most agent frameworks are over-engineered. They add dispatchers, task queues, gas tanks, heartbeat schedulers, and external sub-agent delegation before they can even read a file.

Meow is different. The core loop is ~50 lines. The tools are inline. The API is OpenAI-compatible or Anthropic-compatible.

## Quick Start

```bash
# Set your API key
export LLM_API_KEY=your_key_here

# Interactive mode
bun run start

# Single task
bun run start "Read package.json and tell me the dependencies"
```

## Architecture

```
meow/
├── cli/
│   └── index.ts          # CLI entry point
└── src/
    └── core/
        └── lean-agent.ts # The entire agent (~250 lines)
```

One file. One loop. That's it.

## The Core Loop

```typescript
while (iterations < maxIterations) {
  const response = await llm.chat.completions.create({ model, messages, tools });
  const { content, tool_calls } = response;

  if (tool_calls?.length > 0) {
    for (const toolCall of tool_calls) {
      const result = await tools[toolCall.function.name](JSON.parse(toolCall.function.arguments));
      messages.push({ role: "tool", content: result });
    }
    continue;
  }

  return content;
}
```

## Tools

| Tool | What it does |
|------|-------------|
| `read` | Read a file |
| `write` | Write a file |
| `shell` | Run a shell command |
| `git` | Run a git command |

## Design Philosophy

1. **Lean** — No dispatcher, no task queues, no gas tank
2. **Self-contained** — No external sub-agent delegation
3. **Sovereign** — BYOK (Bring Your Own Keys)

## Environment Variables

| Variable | Default | Required |
|----------|---------|----------|
| `LLM_API_KEY` | — | Yes |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | No |
| `LLM_MODEL` | `gpt-4o` | No |

## Status

Meow is being rebuilt. The old architecture (dispatcher, runtime, heartbeat, extensions, payments) has been stripped. The lean agent core is ready.

See [docs/TODO.md](docs/TODO.md) for progress.
