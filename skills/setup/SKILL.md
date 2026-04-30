---
name: setup
description: System-wide setup for Meow's specialist tools (Claude Code, Aider, OpenCode)
---

# Setup Skill: Environment Provisioning

This skill allows MEOW to autonomously install and configure its Level-2 specialists (Claude Code, Aider, and OpenCode) based on the current OS and environment variables.

## 🔎 Pre-flight Checks
1. **Identify OS**: Determine if the environment is macOS, Linux, or Windows.
2. **Key Discovery**: 
   - Check local `.env` for `LLM_API_KEY` and `LLM_BASE_URL`.
   - Check process environment for these variables.
   - If missing, ask the user or look for `ANTHROPIC_AUTH_TOKEN`.

## 🛠️ Installation Matrix

### 1. Claude Code
- **Command**: `npm install -g @anthropic-ai/claude-code`
- **Verification**: `claude --version`
- **Config**: Set `ANTHROPIC_API_KEY` to the value of `LLM_API_KEY`.

### 2. Aider
- **Command**: `pipx install aider-chat` (Recommended: Use Python 3.12 for stability)
- **Manual Command**: `pip3.12 install aider-chat`
- **Verification**: `aider --version`
- **Config**: 
  - Set `ANTHROPIC_API_KEY` to `LLM_API_KEY`.
  - If `LLM_BASE_URL` is set, configure the specialist to use it as its API base where applicable (e.g., `OPENAI_API_BASE`).

### 3. OpenCode
- **Command (Mac/Linux)**: `curl -fsSL https://opencode.ai/install | bash`
- **Command (Alternative)**: `npm install -g opencode-ai`
- **Verification**: `opencode --version`
- **Config**: Run `opencode /connect` or set relevant env vars.

## 🚀 Execution Procedure
1. Use the `run` tool to check if each tool is already in the PATH.
2. If missing, use the appropriate package manager (npm, pip, curl) to install.
3. Once installed, verify the installation.
4. Export the necessary environment variables to ensure the specialists are ready for the `summon` tool.

## 🚨 Troubleshooting
- If a package manager is missing (e.g., `npm` or `pip`), report the blocker to the user.
- If installation fails due to permissions, try `sudo` if appropriate, but prefer local/user-level installs.
