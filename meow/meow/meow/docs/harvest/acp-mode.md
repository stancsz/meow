---
name: acp-mode
repo: https://github.com/google-gemini/gemini-cli
docPath: competitors/gemini-cli/docs/cli/acp-mode.md
why: ACP (Agent Client Protocol) enables programmatic control of Meow from IDEs and tools via JSON-RPC over stdio. Opens ecosystem integrations.
minimalSlice: "A minimal ACP mode: --acp flag starts a JSON-RPC stdio server. Supports: initialize, newSession, prompt, cancel. The agent runs headless, controlled entirely via JSON-RPC messages from stdin/stdout."
fit: sidecar
status: pending
complexity: 4
---

# Harvest: acp-mode from gemini-cli

**Source:** `docs/research/competitors/gemini-cli/docs/cli/acp-mode.md`

## Core Trick

Gemini CLI's `--acp` flag puts it in **Agent Client Protocol mode**:
- JSON-RPC 2.0 over stdio (client sends requests, agent responds)
- Methods: `initialize`, `newSession`, `loadSession`, `prompt`, `cancel`
- Can register MCP servers during `initialize` handshake
- ACP is an open protocol — IDEs can implement once, work with any ACP agent

## Minimal Slice for Meow

Implement as `src/sidecars/acp.ts`:

1. Add `--acp` flag to CLI that puts Meow in server mode
2. Read JSON-RPC requests from stdin, write responses to stdout
3. `initialize` — set up agent config, optional MCP server connection
4. `prompt` — run a single prompt through the agent, return response
5. `cancel` — AbortController abort on current run
6. Keep it simple: single-session, no sub-sessions

## Why Worth It

- High ecosystem value: IDE integrations, automation tools
- Meow as a headless agent that any tool can control
- ACP is an open standard — compatibility with existing ACP clients
- Fits naturally as a sidecar

## Complexity Note

4/5 — requires understanding JSON-RPC protocol, stdio handling, MCP integration, headless mode. Significant but valuable. Do after core loop is stable.
