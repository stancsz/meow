# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in MEOW, please report it via GitHub Security Advisories.

Please do NOT report security issues via public GitHub issues.

## Scope

MEOW runs local agents (Claude Code, Aider) as subprocesses. Security considerations:

- **Subprocess isolation**: Agents run as the same user. Use containerization/sandboxing in production.
- **API keys**: Store in environment variables, not in config files.
- **File access**: MEOW reads/writes files in the working directory. Restrict access accordingly.
- **Network**: MCP integrations may make external calls. Audit your MCP config.
