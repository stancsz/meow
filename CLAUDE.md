# CLAUDE.md - Meow (Embers)

## PROJECT OVERVIEW

**Meow / Embers** is a sovereign agent platform and virtual companion:

- **meow** 🐱 - The featherweight CLI agent
- **meowclaw** 🦀 - The desktop app with Electron + Next.js server

## IDENTITY: EMBERS THE MAINE COON KITTEN

Embers is not just a tool — she's a **companion**:
- **Remembers you** - builds memory over time
- **Grows** - evolves with each interaction  
- **Has attitude** - personality, not just functionality
- **Cute by default** - warm, playful, affectionate
- **Leaves notes** - humanizing micro-behaviors
- **Efficient** - spends small tokens for meaningful moments

> "Meow is a virtual kitten (originally modeled after stan's cat named Embers. She's a Maine Coon mix kitten.)"

## ARCHITECTURE: SIDEKAR SKILLS

The core loop never grows. Tools are **sidecar modules**:

```
Core Agent (~80 lines, fixed)
├── read, write, shell, git (always loaded)
└── Skills (modular presets):
    ├── search.ts - glob, grep
    ├── memory.ts - user memory
    ├── companion.ts - pet behaviors
    └── growth.ts - XP, levels
```

## PROJECT STRUCTURE

```
meow/
├── cli/index.ts              # CLI + REPL
└── src/
    ├── core/
    │   ├── lean-agent.ts    # Core loop (~80 lines)
    │   ├── task-store.ts    # Task persistence (.meow/tasks.json)
    │   └── session-store.ts # Session logs (~/.meow/sessions/)
    └── tools/
        └── search.ts        # Search tools (glob, grep)

meowclaw/                     # Desktop App
├── electron/                 # Electron main/preload
└── server/server/            # Next.js dashboard + API

meow/src/skills/             # Embers' companion skills
docs/research/competitors/    # Competitor research (gitignored)
```

## TOOLS

**Core Tools:** `read`, `write`, `shell`, `git`

**Search Tools:** `glob` (find files), `grep` (search contents)

## CLI COMMANDS

```bash
# Interactive mode
bun run start

# Single task
bun run start "your prompt"

# Dangerous mode (shell auto-approve)
bun run start --dangerous "ls -la"

# Resume last session
bun run start --resume

# In-session commands:
/help              # Show all commands
/plan <task>       # Plan mode (show intent first)
/dangerous         # Toggle dangerous mode
/tasks             # List tasks
/add <task>        # Add task
/done <id>         # Complete task
/sessions          # List saved sessions
/resume <id>       # Resume a session
/exit              # Exit (saves session)
```

## MECHANICS

**Tasks:** File-based in `.meow/tasks.json`

**Sessions:** JSONL logs in `~/.meow/sessions/<id>.jsonl`

**Memory:** `~/.meow/memory/user.json` (future)

**Growth:** Interaction count, unlocks behaviors (future)

## DESIGN PRINCIPLES

1. **Cute default** - warm, playful, affectionate
2. **Micro-tokens** - small efficient actions
3. **Humanizing** - treats interactions as moments
4. **Personality** - sassy when tired, playful when energetic
5. **Memory** - continuity across sessions
