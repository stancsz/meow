# Meow 🐱 — The Agentic Sidecar Harness

> *"Like OpenClaw, but with a soul."*

**Meow is a sidecar harness for Claude Code and Open Code.** It doesn't replace your agent—it supercharges it. Memory that persists, missions that run in the background, skills that install themselves.

---

## What Is a Sidecar Harness?

Most CLI wrappers are **one-shot tools** — you ask, it answers, it's done.

Meow is a **sidecar harness** — a persistent companion that:

- 🧠 **Remembers everything** across sessions (your agent forgets nothing)
- 🎯 **Runs missions in the background** while you work
- 🧩 **Installs skills on demand** from any GitHub repo
- 💾 **Persists your agent's "soul"** to GitHub — restore anywhere
- ⚡ **Never blocks** — background agent, real-time chat together

```
┌─────────────────┐       ┌─────────────────┐
│   Claude Code    │◄─────►│   Meow Harness  │
│   (Core Agent)  │       │   (Sidecar)     │
└─────────────────┘       └─────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
               Memory       Missions       Skills
```

---

## Why Meow Exists

**Every agent starts fresh.** No memory, no continuity, no growth.

Claude Code is powerful, but:
- Forgets everything after each session
- Can't pursue goals while you work
- No skill ecosystem out of the box

Meow fixes this. It's the **harness** your agent wished it had.

---

## Core Capabilities

### 💾 Persistent Memory
Your agent's "soul" — user profiles, relationships, conversation history, compressed summaries. Backed up to GitHub, restored in seconds.

### 🎯 Background Missions
Define a goal, go make coffee. Meow evaluates progress every 30 seconds, posts updates to Discord, and **keeps pushing past 100%** for excellence.

### 🧩 Skill Orchestration
```
"Install the knowledge-base skill"
→ Done. Bot restarted, skill available.
```
Any `.claude/skills/<name>/SKILL.md` becomes an installable capability.

### 🔄 GitHub Backup & Restore
```
"backup yourself"
→ Pushed to GitHub.

"restore yourself"
→ Pulled everywhere. Meow is never lost.
```

---

## Quick Start

```bash
# Clone
git clone https://github.com/stancsz/meow
cd meow/claude-bridge-docker

# Configure
cp .env.example .env
# Add your DISCORD_TOKEN and GH_PAT

# Run
docker-compose up --build
```

That's it. Meow connects to Discord and starts remembering.

---

## Use as a Claude Code Skill

Install Meow as a **skill** inside Claude Code:

```bash
# Add as git submodule
git submodule add https://github.com/stancsz/meow ~/.claude/meow
```

Add to `~/.claude/settings.json`:

```json
{
  "skills": {
    "meow": {
      "path": "~/.claude/meow/.claude/skills/meow"
    }
  }
}
```

Now in Claude Code:

```
/meow backup                    # Backup soul to GitHub
/meow mission create <title>   # Create a mission
/meow skills install <repo>    # Install a skill
```

---

## Mission Commands

Missions run **parallel to everything else** — your agent keeps working while Meow tracks progress.

```
create mission <title>              # Start a new mission
add goals to <mission>: <goal1>   # Define what "done" looks like
start mission <name>               # Begin tracking
mission status                    # Check progress
complete mission <name>           # Mark done
cancel mission <name>              # Cancel
list missions                    # See all
```

**Example:**

```
create mission improve README
add goals to improve README: add quick start section, add architecture diagram, add troubleshooting guide
start mission improve README
```

You keep coding. Meow watches, evaluates, and posts updates to Discord.

---

## The Mission Difference

Other tools mark tasks "done" and stop.

Meow keeps going:

| Completion | What Happens |
|------------|--------------|
| 0-99% | Agent identifies gaps, suggests/implements fixes |
| 100% | Agent says "what's next?" and looks for improvements |
| 100% + stable | Auto-marks complete, agent seeks next challenge |

**Excellence past the finish line.**

---

## Memory Architecture

```
Soul Memory (permanent)
├── User profiles
├── Relationship bonds
└── Identity facts

Compressed History (summarized)
└── Past conversations → tiny summaries

Thread Context (recent)
└── Last N messages for continuity
```

**No context bloat.** Meow remembers what matters, compresses what doesn't, forgets what never mattered.

---

## Project Structure

```
meow/
├── .claude/skills/           # Installable skills
│   └── meow/                 # The Meow skill itself
├── claude-bridge-docker/     # Docker deployment
│   ├── relay.ts              # Discord ↔ Claude Code bridge
│   ├── mission-agent.ts      # Background mission evaluator
│   ├── memory.ts             # Hierarchical memory system
│   └── skill-manager.ts      # GitHub skill installation
└── data/                     # Persisted state (volume-mounted)
    ├── missions.json         # Mission definitions
    ├── settings.json        # Config
    └── profiles/            # User souls
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

## Design Principles

1. **Sidecar, not core** — augments Claude Code, doesn't replace it
2. **Agentic** — background processes that pursue goals autonomously
3. **Memory-first** — continuity is what makes intelligence useful
4. **Skill-orchestrated** — capabilities via modular packages
5. **Push for excellence** — 100% is a checkpoint, not a finish line

---

## For Open Code Too

Meow works as a sidecar for **any** Claude-compatible agent:

```bash
# Point Meow at your agent's working directory
MEOW_CWD=/path/to/opencode ./meow --agent
```

The same memory, missions, and skills — regardless of which core agent you use.

---

*Meow isn't a product. Meow is a companion for your agent.*
