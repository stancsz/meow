# Claude Bridge Docker 🐱

Docker-based Discord relay that bridges messages to Claude Code and back — giving Meow a home on Discord with persistent memory.

## Quick Start

```bash
cp .env.example .env
# Edit .env with your DISCORD_TOKEN and GH_PAT
docker-compose up --build
```

## What It Does

```
Discord → relay.ts → Claude Code CLI → Meow's response → Discord
```

- Authenticates `gh` CLI at startup using `GH_PAT`
- Hierarchical memory system (persisted to `./data/`)
- Skill installation from GitHub repos
- Interactive backup/restore to GitHub

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | Yes | - | Discord bot token |
| `GH_PAT` | Yes | - | GitHub PAT for skill install & backup |
| `BACKUP_REPO` | No | - | GitHub repo for memory backup |
| `CLAUDE_CWD` | No | `/app` | Working directory |
| `RELAY_CHANNELS` | No | all | Channel IDs (comma-separated) |
| `RELAY_PREFIX` | No | - | Message prefix filter |
| `RELAY_MENTION_ONLY` | No | - | Set "1" for mention-only |
| `RELAY_TYPING` | No | "1" | Show typing indicator |

## Persistent Volumes

```yaml
volumes:
  - ./data:/app/data          # Memory, profiles, threads
  - ./.claude:/app/.claude    # Skills directory
```

## Bot Commands

- **"backup yourself"** — backup memory & skills to GitHub (interactive first time)
- **"restore yourself"** — restore from GitHub backup
- **"install skill <repo>"** — install a skill from GitHub
- **"list skills"** — show installed skills

## Discord Setup

1. Create a Discord bot at https://discord.com/developers/applications
2. Enable **Message Content Intent** and **Server Members Intent**
3. Copy the bot token to `DISCORD_TOKEN`
4. Add the bot to your server

## Direct Usage (without Docker)

```bash
bun install
bun run relay.ts
```
