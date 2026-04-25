---
name: claude-code
repo: https://github.com/anthropics/claude-code
docPath: docs/implemented/features.md
why: Learn Claude Code's advanced features - hooks, MCP, agent modes, streaming, and more
minimalSlice: "Implement --hooks flag, --mcp-config, --agent modes, --print streaming"
fit: skill
complexity: 3
status: pending
---

# Claude Code Capability

Learn from Claude Code to implement advanced features for Meow.

## Core Features to Implement

1. **Hooks** - Pre/post command hooks for automation
2. **MCP Integration** - --mcp-config for Model Context Protocol servers
3. **Agent Modes** - --agent flag for custom agent personas
4. **Streaming** - AsyncGenerator-based streaming responses
5. **Permission System** - Pattern-matching permissions

## Minimal Slice

Create `src/sidecars/claude-code-features.ts`:

1. `hooks` - Execute scripts on pre/post commands
2. `mcpConfig` - Load and manage MCP server configurations
3. `agentModes` - Support --agent flag with custom agent prompts
4. `streaming` - AsyncGenerator streaming interface

## Why Worth It

- Brings Claude Code's best features to Meow
- Improves tool integration via MCP
- Better streaming UX
