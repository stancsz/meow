# Meow 🐱 — Claude Code, Fully Realized

> *"OpenClaw has all the features. Meow gives them to Claude Code."*

Claude Code is powerful, but OpenClaw has the **features that matter**:

- Persistent memory across sessions
- Background goal-tracking agents
- Skill ecosystem you can install from GitHub
- "Soul" that restores on any machine

**Meow brings OpenClaw's DNA to Claude Code.**

```
OpenClaw DNA ──────► Meow Harness ──────► Claude Code
                      │
                      ├── Memory (soul persists)
                      ├── Missions (background agent)
                      └── Skills (install from GitHub)
```

---

## What Meow Unlocks

### 🧠 Memory That Never Forgets
Claude Code starts fresh every session. Meow remembers:
- User profiles and relationships
- Conversation history compressed into context
- Your preferences, your goals, your patterns
- Backed up to GitHub — restore anywhere

### 🎯 Missions That Work While You Sleep
OpenClaw has background task agents. Meow gives Claude Code the same:
- Define a goal, walk away
- Agent evaluates progress every 30 seconds
- Posts updates to Discord (edits existing message, no spam)
- **100% completion? Keeps going. Pushes for excellence.**

### 🧩 Skills from OpenClaw's Ecosystem
OpenClaw's skill ecosystem — now for Claude Code:
```
"Install the knowledge-base skill"
→ Clones from GitHub, installs, ready to use
```
Any skill in the OpenClaw format Just Works.

### 💾 Soul Backup to GitHub
```
"backup yourself"
→ Pushed to your GitHub. Never lose your agent.

"restore yourself"
→ Pulled anywhere. Meow is never lost.
```

---

## Sidecar Architecture

Meow is a **sidecar harness** — it runs alongside Claude Code, not inside it:

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

**Your agent, fully realized.**

---

## Quick Start

```bash
git clone https://github.com/stancsz/meow
cd meow/claude-bridge-docker
cp .env.example .env
# Add DISCORD_TOKEN and GH_PAT
docker-compose up --build
```

Meow connects to Discord. You're ready.

---

## Use Meow Inside Claude Code

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

Then in Claude Code:

```
/meow backup                    # Backup soul to GitHub
/meow mission create <title>  # Start a mission
/meow skills install <repo>   # Add OpenClaw skills
```

---

## Mission Commands

```
create mission <title>               # Create
add goals to <mission>: <goal1>     # Define done
start mission <name>                 # Begin tracking
mission status                      # Check progress
complete mission <name>             # Finish
cancel mission <name>                # Cancel
list missions                       # See all
```

**Example:**

```
create mission improve docs
add goals to improve docs: add quickstart section, add troubleshooting guide
start mission improve docs
```

Go make coffee. Meow watches, evaluates, updates Discord.

---

## Memory Architecture

```
Soul (GitHub-backed)
├── Who you are
├── What you care about
└── How you work

Context Thread (recent)
└── Last N messages for continuity

Compressed History (summarized)
└── Old conversations → tiny summaries
```

No context bloat. Just memory that matters.

---

## Design Philosophy

1. **Sidecar, not replacement** — Claude Code stays Claude Code
2. **OpenClaw parity** — if OpenClaw has it, Meow brings it
3. **Memory-first** — continuity enables real intelligence
4. **Agentic** — background processes that work while you sleep
5. **Excellence** — 100% completion is a waypoint, not the destination

---

## For Open Code Users

Meow works with Open Code too:

```bash
MEOW_CWD=/path/to/opencode ./meow --agent --mission <id>
```

Same memory, same missions. Your harness, your choice.

---

*Meow: Claude Code, fully realized.*
