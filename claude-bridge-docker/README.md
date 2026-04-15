# Claude Bridge Docker 🐱

Docker container for Meow — an agentic skill orchestrator for Claude Code.

## What It Does

```
Discord ←→ Relay.ts ←→ Claude Code CLI
                ↓
          Mission Agent (background)
                ↓
          Memory + Skills
```

- **Relay** — real-time Discord ↔ Claude Code bridge
- **Mission Agent** — background goal evaluation every 30s
- **Skill Manager** — install capabilities from GitHub
- **Memory** — hierarchical soul, profiles, threads

## Quick Start

```bash
cp .env.example .env
# Edit: DISCORD_TOKEN, GH_PAT
docker-compose up --build
```

## Mission Commands

```
create mission <title>          # Create
add goals to <mission>: <goal> # Define goals
start mission <name>           # Begin tracking
mission status                # Check progress
complete mission <name>       # Finish
cancel mission <name>         # Cancel
list missions                 # Show all
```

## Skill Commands

```
"install skill <repo>"        # Install from GitHub
"list skills"                 # Show installed
```

## Persistence

```yaml
volumes:
  - ./data:/app/data         # Missions, profiles, threads
  - ./.claude:/app/.claude   # Skills directory
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `GH_PAT` | Yes | GitHub PAT |
| `BACKUP_REPO` | No | GitHub repo for backup |
| `RELAY_CHANNELS` | No | Channel IDs |

## Discord Setup

1. Create bot at https://discord.com/developers/applications
2. Enable Message Content Intent + Server Members Intent
3. Copy token to `DISCORD_TOKEN`
4. Add bot to server
