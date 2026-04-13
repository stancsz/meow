# Meow-Chan Relay: Reliability & Configuration

The Meow-Chan Relay is designed to act as a stateless bridge between Discord and the official **Claude Code** CLI. This document outlines the specific configuration and architectural decisions made to ensure a stable, high-performance, and "snag-free" experience.

## 🏗️ Architecture

The relay follows a "Stateless Brain" pattern:
1. **Trigger**: A message is received via `discord.js`.
2. **Brain**: The relay spawns a one-off `claude` process using the `-p` (print) flag.
3. **Isolation**: The process is isolated from local files and MCP tools to prevent prompts for permission or unexpected side effects.
4. **Delivery**: The plain-text output from the Brain is chunked and delivered back to Discord.

## 🛠️ Critical Configuration

To make this work reliably without manual intervention (especially for automated relays), the following `claude` flags are used:

| Flag | Purpose |
| :--- | :--- |
| `--output-format text` | Ensures Claude outputs only the final answer without terminal styling or UI bloat. |
| `--dangerously-skip-permissions` | Bypasses all interactive permission prompts. Required for non-interactive execution. |
| `--strict-mcp-config` | Prevents Claude from loading any MCP servers from standard locations (like `.mcp.json`). |
| `--mcp-config mcp-null.json` | Points to a dummy empty file to ensure no tools (like a Discord tool) are available to correctly isolate the "Brain". |

## 🧩 Prompt Engineering

To prevent the Claude CLI from intercepting messages as local commands (e.g., slash commands), the relay uses a **Neutral Prefix**:

- **Bad**: `[Discord message from stancsz]: tell a joke` (Starts with `[` - triggers CLI help)
- **Bad**: `/help` (Starts with `/` - intercepted by Claude CLI)
- **Good**: `User Message: tell a joke` (Neutral - passes directly to the LLM)

## 🪟 Windows-Specific Logic (Critical)

Spawning CLI tools on Windows is prone to "Truncation Bugs" and "Shell Splitting" if not handled correctly. Meow-Chan implements the following for maximum reliability:

1. **Direct Node Spawning**: We bypass the `claude.cmd` shell wrapper and execute `node` directly against the Claude Code entry point (`cli.js`).
   - *Reason*: `cmd.exe` often incorrectly splits arguments containing spaces or special characters, leading to "cut off" messages.
2. **Absolute Entry Point**:
   ```typescript
   const claudeJsPath = "C:\\Users\\stanc\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js";
   ```
3. **Shell-less Execution**: Using `shell: false` in Node's `spawn` to ensure that the prompt string is passed as a single atomic argument to the JS engine.

## ⚙️ How to Configure

1. **Prerequisites**:
   - Claude Code installed globally (`npm install -g @anthropic-ai/claude-code`).
   - A Discord Bot Token in `.env`.
2. **Null MCP Setup**:
   Create a `mcp-null.json` with `{ "mcpServers": {} }` in the project root to satisfy the `--mcp-config` requirement.
3. **Environment**:
   Set `CLAUDE_CWD` to your project root to ensure Claude has a stable working directory context.
