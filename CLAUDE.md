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
Core Agent (~100 lines, fixed)
├── read, write, shell, git (via tool-registry)
└── Sidecars (modular capabilities):
    ├── tool-registry.ts   # Tool registration + built-ins
    ├── permissions.ts     # Pattern-matching permissions
    ├── mcp-client.ts      # MCP protocol client
    └── skills/            # Modular presets (simplify, review, commit)
```

## PROJECT STRUCTURE

```
meow/
├── cli/index.ts              # CLI + REPL + slash commands
├── tests/
│   └── gap-impl.test.ts     # Gap implementation tests
└── src/
    ├── core/
    │   ├── lean-agent.ts    # Core loop (~100 lines)
    │   ├── auto-agent.ts    # OODA autonomous agent (tick/auto modes)
    │   ├── task-store.ts    # Task persistence (.meow/tasks.json)
    │   └── session-store.ts # Session logs + LLM compaction (~/.meow/sessions/)
    ├── sidecars/
    │   ├── tool-registry.ts # Tool registry with read/write/edit/shell/git
    │   ├── mcp-client.ts    # MCP protocol client
    │   └── permissions.ts   # Pattern-matching permissions
    ├── skills/
    │   ├── index.ts         # Skill exports
    │   ├── loader.ts        # Skill loader
    │   ├── simplify.ts      # Refactoring skill
    │   ├── review.ts        # Code review skill
    │   └── commit.ts        # Conventional commit skill
    └── tools/
        └── search.ts        # Search tools (glob, grep)

meowclaw/                     # Desktop App
├── electron/                 # Electron main/preload
└── server/server/            # Next.js dashboard + API
```

## RECENT CHANGES

- **OpenAI SDK** — MiniMax via OpenAI-compatible endpoint, streaming support
- **Auto/Tick modes** — autonomous OODA loop in auto-agent.ts
- **Env loading** — automatic `.env` file on startup
- **gap-impl.test.ts** — test suite for gap implementation
- **gap-close.sh** — script to validate and close gaps
- **slash-commands.ts** — slash command infrastructure sidecar

## TOOLS

**Core Tools:** `read`, `write`, `shell`, `git`

**Search Tools:** `glob` (find files), `grep` (search contents)

**Skills:** `simplify`, `review`, `commit`

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
/skills            # List available skills
/simplify <file>   # Refactor code
/review <file>     # Review code
/commit            # Git commit helper
/exit              # Exit (saves session)
```

## MECHANICS

**Tasks:** File-based in `.meow/tasks.json`

**Sessions:** JSONL logs in `~/.meow/sessions/<id>.jsonl` with LLM-powered compaction

**Skills:** Modular capabilities loaded from `meow/src/skills/`

**Permissions:** Pattern-matching rules (allow/deny/ask) per tool

**Memory:** `~/.meow/memory/user.json` (future)

**Growth:** Interaction count, unlocks behaviors (future)

**Interrupt:** Ctrl+C to abort in-progress operations

## DESIGN PRINCIPLES

1. **Cute default** - warm, playful, affectionate
2. **Micro-tokens** - small efficient actions
3. **Humanizing** - treats interactions as moments
4. **Personality** - sassy when tired, playful when energetic
5. **Memory** - continuity across sessions
6. **Core never grows** - capabilities via sidecar skills
