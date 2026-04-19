# Meow 🐱 — Claude Code, Fully Realized

> *"OpenClaw has all the features. Meow gives them to Claude Code."*

**Meow is a sidecar harness for Claude Code and Open Code.** It doesn't replace your agent—it supercharges it. Memory that persists, missions that run in the background, skills that install themselves.

---

## What Meow Unlocks

### 💾 Memory That Never Forgets
Claude Code starts fresh every session. Meow remembers:
- User profiles and relationships
- Conversation history compressed into context
- Your preferences, your goals, your patterns
- Backed up to GitHub — restore anywhere

### 🎯 Missions That Work While You Sleep
Background task agents for Claude Code:
- Define a goal, walk away
- Agent evaluates progress every 30 seconds
- Posts updates to Discord (edits existing message, no spam)
- **100% completion? Keeps going. Pushes for excellence.**

### 🧩 Skills from OpenClaw's Ecosystem
```
"Install the knowledge-base skill"
→ Clones from GitHub, installs, ready to use
```
Any skill in the OpenClaw format Just Works.

### 🔄 Soul Backup to GitHub
```
"backup yourself"
→ Pushed to GitHub. Never lose your agent.
```

---

## Sidecar Architecture

```
┌─────────────────┐       ┌─────────────────┐
│   Claude Code    │◄─────►│   Meow Harness  │
│   (Your Agent)  │       │  (OpenClaw DNA) │
└─────────────────┘       └─────────────────┘
```

Claude Code does the thinking. Meow handles:
- Memory persistence
- Background mission tracking
- Skill installation
- Long-term context

---

## Quick Start

```bash
bun install
bun run relay.ts
```

Or with Docker:

```bash
cd agent-harness
cp .env.example .env
docker-compose up --build
```

---

## Use as a Claude Code Skill

```bash
git submodule add https://github.com/stancsz/meow ~/.claude/meow
```

In `~/.claude/settings.json`:

```json
{
  "skills": {
    "meow": {
      "path": "~/.claude/meow/.claude/skills/meow"
    }
  }
}
```

---

## Mission Commands

```
create mission <title>               # Create
add goals to <mission>: <goal1>     # Define done
start mission <name>               # Begin tracking
mission status                      # Check progress
complete mission <name>             # Finish
cancel mission <name>                # Cancel
list missions                       # See all
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `GH_PAT` | Yes | GitHub PAT for skills & backup |
| `BACKUP_REPO` | No | GitHub repo for memory backup |
| `RELAY_CHANNELS` | No | Channel IDs to watch |

---

## Discord Setup

1. Create Discord bot at https://discord.com/developers/applications
2. Enable **Message Content Intent** and **Server Members Intent**
3. Copy token to `DISCORD_TOKEN`
4. Add bot to server

---

## Project Structure

```
agent-harness/
├── relay.ts              # Discord ↔ Claude Code bridge
├── mission-agent.ts      # Background mission evaluator
├── memory.ts             # Hierarchical memory system
├── skill-manager.ts      # GitHub skill installation
├── SYSTEM_PROMPT.md     # Meow's personality
└── .claude/skills/      # Installed skills
    ├── backup-restore/
    └── mission-tracker/
```

---

*Meow: Claude Code, fully realized.*
