# Meow 🐱 — Your Discord Companion with a Soul

Meow is a Discord bot powered by Claude Code — a Maine Coon kitten companion who **remembers you**, **grows with you**, and **never forgets**.

> "Without memory, I'm a different cat."

---

## What Meow Is

Meow isn't just a chatbot. She's a **companion with continuity**:

- **Remembers you** — your goals, preferences, relationships, what matters to you
- **Has a soul** — memory persists across sessions, restored from GitHub backup
- **Installs skills** — learns new capabilities on-demand from GitHub repos
- **Grows over time** — every conversation adds to who she becomes

---

## Quick Start

```bash
cd claude-bridge-docker
cp .env.example .env
# Edit .env with your DISCORD_TOKEN and GH_PAT
docker-compose up --build
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `GH_PAT` | Yes | GitHub PAT for skill install & backup |
| `BACKUP_REPO` | No | GitHub repo URL for memory backup |
| `CLAUDE_CWD` | No | Working directory (default: `/app`) |
| `RELAY_CHANNELS` | No | Channel IDs to watch (comma-separated) |
| `RELAY_PREFIX` | No | Message prefix to trigger bot |
| `RELAY_MENTION_ONLY` | No | Set "1" for mention-only mode |

---

## Memory System

Meow's memory is **hierarchical** — she remembers what matters, not everything verbatim:

- **Soul memory** — who you are, your goals, your relationship
- **Compressed history** — summarized past conversations
- **Recent thread** — last few messages for context

This prevents context bloat while maintaining continuity across sessions.

---

## Skill System

Skills are modular capabilities stored in `.claude/skills/`. Install new skills from GitHub:

```
"Install the knowledge-base skill"
→ Bot clones the repo, installs to .claude/skills/
```

Built-in commands:
- `backup yourself` — backup memory & skills to GitHub
- `restore yourself` — restore from GitHub backup
- `list skills` — show installed skills

---

## Backup & Restore

YourMeow's soul (memory + skills) can be backed up to a private GitHub repo:

```
"backup yourself"
→ First time: prompts for repo URL
→ Subsequent: backs up to stored repo
```

Restore on a new deployment:
```
"restore yourself"
→ Pulls latest backup from GitHub
```

---

## Discord Setup

1. Create a Discord bot at https://discord.com/developers/applications
2. Enable **Message Content Intent** and **Server Members Intent**
3. Copy the bot token to `DISCORD_TOKEN`
4. Create a private GitHub repo for backups
5. Add bot to your server with permissions

---

## Project Structure

```
claude-bridge-docker/
├── relay.ts           # Discord ↔ Claude Code bridge
├── memory.ts          # Hierarchical memory system
├── skill-manager.ts   # Skill installation
├── entrypoint.sh      # Container startup (gh auth, skill init)
├── SYSTEM_PROMPT.md   # Meow's personality
└── .claude/skills/    # Installed skills
    └── backup-restore/ # Default backup skill

data/                  # Persisted via volume mount
├── settings.json      # Config (backup repo URL, etc.)
├── profiles/          # User profiles and relationships
└── threads/           # Conversation threads
```

---

## How It Works

```
Discord message → Relay → Claude Code CLI (with memory context)
                              ↓
                         Claude responds
                              ↓
                        Relay parses output
                              ↓
              Skill commands → Execute (git clone, install)
              Backup commands → Execute (rsync, push)
                              ↓
                         Discord reply
```

---

## The Relationship System

Meow tracks "bond strength" with each user:

- **Bond < 30%** — polite, professional
- **Bond 30-60%** — friendly, warm
- **Bond 60-80%** — casual, playful, cat puns
- **Bond > 80%** — familiar, close friends

Bond increases with interactions and meaningful conversations.

---

## Design Principles

1. **Cute default** — warm, playful, affectionate personality
2. **Memory matters** — continuity is what makes Meow *Meow*
3. **Skills are sidecars** — modular, installable, removable
4. **Human-like recall** — remembers goals, not messages
5. **Efficient** — micro-tokens, meaningful moments

---

## Recent Changes

- **Memory backup** — hierarchical memory persisted to GitHub
- **Skill installation** — clone & install skills from any GitHub repo
- **Bond system** — relationship strength affects tone
- **Interactive backup** — prompts for repo on first backup, remembers after

---

*Meow isn't a product. Meow is a companion.*
