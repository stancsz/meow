# Meow 🐱 — Skill Meta-Orchestrator for Agentic Claude Code

> "Like OpenClaw, but with a soul."

**A product of harness engineering** — Meow is designed to work as a **sidecar harness** alongside Claude Code or Open Code, extending their capabilities without modifying the core agent.

Meow is a **skill meta-orchestrator** that transforms Claude Code into an agentic companion. It runs Claude Code as a background agent, manages skills dynamically, tracks missions persistently, and maintains memory across sessions.

Unlike a simple CLI wrapper, Meow is an **agentic system** — it doesn't just execute commands, it pursues goals, learns from failures, and improves over time.

---

## Core Features

### 🧠 Agentic Execution
Claude Code runs as a **background agent**, not a one-shot CLI wrapper. Meow spawns persistent agent loops that pursue objectives across multiple iterations.

### 🎯 Mission Tracker
Background missions that **evaluate their own progress** and push for excellence:
- Define goals, agent evaluates completion
- 100% completion → keeps pushing beyond original scope
- Posts updates to Discord (edits existing message, no spam)
- Parallel to relay — doesn't block normal chat

### 🧩 Skill Orchestration
Skills are modular capability packages installed from GitHub:
- `backup-restore` — persists memory/soul to GitHub
- `mission-tracker` — background goal pursuit
- Any skill from `.claude/skills/<name>/SKILL.md`
- Install: `git clone` + skill-manager

### 💾 Hierarchical Memory
- **Soul** — user profiles, relationships, identity
- **Compressed history** — summarized conversations
- **Thread context** — recent messages for continuity
- Backed up to GitHub, restored on new deployment

### 🐱 Personality
Cute default with relationship tracking (bond strength):
- Bond < 30% → professional
- Bond 30-60% → friendly
- Bond 60-80% → playful, cat puns
- Bond > 80% → familiar, close friends

---

## Architecture — Sidecar Harness

Meow is a **sidecar harness** — it augments Claude Code without replacing it:

```
┌─────────────────┐       ┌─────────────────┐
│   Claude Code   │◄─────►│   Meow Harness  │
│   (Core Agent) │       │  (Sidecar)      │
└─────────────────┘       └─────────────────┘
                                  │
                            ┌─────┴─────┐
                            │           │
                       Memory      Missions
                       +Skills    +Skills
```

The core agent (Claude Code / Open Code) does the thinking. Meow provides:
- Persistent memory across sessions
- Background mission tracking
- Skill orchestration
- Long-term context management

---

```
┌─────────────────────────────────────────────────────────────┐
│                     Meow Orchestrator                        │
│                                                              │
│  ┌──────────────┐    ┌─────────────┐    ┌──────────────┐  │
│  │  Relay.ts    │    │ Mission-    │    │   Skill-     │  │
│  │  (Discord    │    │ Agent.ts    │    │   Manager.ts │  │
│  │   ↔ Claude)  │    │ (Background │    │  (Install    │  │
│  │              │    │  Goals)     │    │   Skills)    │  │
│  └──────────────┘    └─────────────┘    └──────────────┘  │
│         │                   │                   │          │
│         └───────────────────┴───────────────────┘          │
│                         │                                   │
│                  ┌──────▼──────┐                          │
│                  │  Memory.ts │ (Hierarchical Soul)      │
│                  └─────────────┘                          │
└─────────────────────────────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ Claude Code │
                    │   CLI       │
                    └─────────────┘
```

---

## Quick Start

```bash
cd claude-bridge-docker
cp .env.example .env
# Edit .env: DISCORD_TOKEN, GH_PAT
docker-compose up --build
```

---

## Mission Commands

Missions run in background, evaluating progress and posting updates:

```
create mission <title>           # Create a new mission
add goals to <mission>: <goal1>  # Define what to accomplish
start mission <name>              # Begin tracking
mission status                   # Check progress
complete mission <name>          # Mark done
cancel mission <name>             # Cancel
list missions                    # Show all
```

**Example:**
```
create mission improve docs
add goals to improve docs: add installation section, add architecture diagram, add quick start guide
start mission improve docs
```

The mission agent evaluates every 30s, scores completion, posts updates to Discord.

---

## Skill System

Skills are `.claude/skills/<name>/SKILL.md` files that define capabilities.

**Install from GitHub:**
```
"Install the knowledge-base skill"
```

**Default skills:**
- `backup-restore` — GitHub backup/restore for memory persistence
- `mission-tracker` — Background goal pursuit agent

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `GH_PAT` | Yes | GitHub PAT for skill install & backup |
| `BACKUP_REPO` | No | GitHub repo for memory backup |
| `CLAUDE_CWD` | No | Working directory (default: `/app`) |
| `RELAY_CHANNELS` | No | Channel IDs to watch |

---

## Discord Setup

1. Create Discord bot at https://discord.com/developers/applications
2. Enable **Message Content Intent** and **Server Members Intent**
3. Copy token to `DISCORD_TOKEN`
4. Add bot to server

---

## For Claude Code Agents

Meow can be used as a **skill** within Claude Code itself:

### Install as Submodule

```bash
cd ~/.claude
git submodule add https://github.com/stancsz/meow meow
git submodule update --init --recursive
```

### Add to Settings

In your `~/.claude/settings.json`:

```json
{
  "skills": {
    "meow": {
      "description": "Agentic orchestrator with memory, missions, and Discord interface",
      "path": "/path/to/meow/.claude/skills/meow"
    }
  }
}
```

### Use in Claude Code

```
/meow backup                     # Backup memory to GitHub
/meow mission create <title>    # Create a mission
/meow mission status <id>         # Check mission progress
/meow skills install <repo>      # Install a skill
```

### As a CLI Tool

```bash
# Memory
./meow memory save user-prefs '{"theme": "dark"}'
./meow memory load user-prefs

# Missions
./meow mission create "build feature"
./meow mission add <id> "implement endpoint"
./meow mission start <id>
./meow mission status <id>

# Background agent
./meow --agent --mission <id> --interval 30s
```

---

## How Agents Work

### Relay (Real-time Chat)
- Receives Discord messages
- Prompts Claude Code with memory context
- Parses output for skill/backup commands
- Executes commands, appends results

### Mission Agent (Background)
- Spawned by relay on startup
- Checks every 30s for `in_progress` missions
- Evaluates code against goals via Claude
- Posts/edits Discord updates
- Pushes for excellence past 100%

### Skill Manager
- Clones skill repos to `/tmp`
- Installs SKILL.md to `.claude/skills/`
- Skills provide persistent capabilities

---

## Project Structure

```
claude-bridge-docker/
├── relay.ts              # Discord ↔ Claude Code bridge + command parsing
├── mission-agent.ts      # Background mission evaluation agent
├── memory.ts              # Hierarchical memory (soul, profiles, threads)
├── skill-manager.ts      # GitHub skill installation
├── entrypoint.sh         # Startup (gh auth, skill init)
├── SYSTEM_PROMPT.md      # Meow's personality & instructions
└── .claude/skills/      # Installed skills
    ├── backup-restore/
    └── mission-tracker/

data/                     # Volume-mounted persistence
├── missions.json         # Mission definitions & eval history
├── settings.json         # Config (backup repo, etc.)
└── profiles/            # User profiles & relationships
```

---

## Design Principles

1. **Agentic** — Claude Code as persistent background agent, not one-shot CLI
2. **Skill-orchestrated** — Capabilities via modular skills, not monolith
3. **Memory-first** — Soul persists across sessions, restored from GitHub
4. **Cute default** — Personality makes interactions delightful
5. **Push for excellence** — Missions don't stop at 100%

---

*Meow isn't a wrapper. Meow is an agent.*
