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
agent-kernel/
├── cli/index.ts              # CLI + REPL + slash commands
├── tests/
│   └── gap-impl.test.ts     # Gap implementation tests
└── src/
    ├── core/
    │   ├── lean-agent.ts    # Core loop (~100 lines)
    │   ├── auto-agent.ts    # OODA autonomous agent (tick/auto modes)
    │   ├── task-store.ts    # Task persistence (.agent-kernel/tasks.json)
    │   └── session-store.ts # Session logs + LLM compaction (~/.agent-kernel/sessions/)
    ├── sidecars/
    │   ├── tool-registry.ts # Tool registry with read/write/edit/shell/git
    │   ├── mcp-client.ts    # MCP protocol client
    │   ├── permissions.ts   # Pattern-matching permissions
    │   ├── on-demand-learner.ts  # On-demand capability acquisition
    │   ├── checkpointing.ts  # Git stash checkpoints before writes
    │   └── slash-commands.ts # Slash command infrastructure
    ├── skills/
    │   ├── index.ts         # Skill exports
    │   ├── loader.ts        # Skill loader
    │   ├── simplify.ts      # Refactoring skill
    │   ├── review.ts        # Code review skill
    │   ├── commit.ts        # Conventional commit skill
    │   └── learn.ts         # On-demand learning skill
    └── tools/
        ├── search.ts        # Search tools (glob, grep)
        ├── harvest.ts       # Learn from competitor repos
        └── evolve.ts        # Antifragile OODA gap-closing loop

meowclaw/                     # Desktop App
├── electron/                 # Electron main/preload
└── server/server/            # Next.js dashboard + API
```

## RECENT CHANGES

- **OpenAI SDK** — MiniMax via OpenAI-compatible endpoint, streaming support
- **Auto/Tick modes** — autonomous OODA loop in auto-agent.ts
- **Env loading** — automatic `.env` file on startup
- **gap-impl.test.ts** — test suite for gap implementation
- **slash-commands.ts** — slash command infrastructure sidecar
- **timeoutMs** — shell/git tools respect per-call timeout via ToolContext
- **generateStream** — AsyncGenerator yield-based streaming as primary test interface
- **maxBudgetUSD** — budget limiting per agent run
- **Fork sessions** — session-store supports forking for branching conversations
- **GAP-ABORT-002** — SIGINT handler enables Ctrl+C to abort operations
- **Orchestrator Switch** — Job orchestrator now uses Meow Agent Kernel for worker tasks (dogfooding)
- **--mcp-config** — CLI flag to load custom MCP server configurations
- **On-demand learning** — /learn <capability> dynamically acquires skills from harvest list
- **P0-PN capability system** — graduated lifecycle: harvest → trick → skill → sidecar → core
- **11 harvest candidates** — ex-skill, context7, autoresearch, gstack, mirofish, and more

## DOGFOOD NOTES

- **train.sh** delegates to evolve.ts OODA loop: observe → orient → decide → act
- Heavy logic lives in `agent-kernel/src/tools/evolve.ts`, train.sh is just a thin wrapper
- **timeoutMs** prevents hung shell/git commands; propagated via ToolContext
- **LLM compaction** keeps sessions under token limit by summarizing old messages
- **maxBudgetUSD** halts agent when estimated cost exceeds threshold
- **capability-matrix.test.ts** — capability coverage matrix tests
- **gaps.test.ts** — gap identification and tracking tests
- **/learn <capability>** — on-demand learning from harvest list (P0 capabilities)

## TOOLS

**Core Tools:** `read`, `write`, `shell`, `git`

**Search Tools:** `glob` (find files), `grep` (search contents)

**Skills:** `simplify`, `review`, `commit`, `learn`

## CLI COMMANDS

```bash
# Training loop (gap closing via evolve.ts OODA loop)
./train.sh               # Run the evolve loop
./train.sh --once        # Single iteration
./train.sh --status      # Show gap status
./train.sh --report      # Full wisdom report

# Interactive mode

# Single task
bun run start "your prompt"

# Dangerous mode (shell auto-approve)
bun run start --dangerous "ls -la"

# Resume last session
bun run start --resume

# Load custom MCP config
bun run start --mcp-config <path> "task"

# Run job orchestrator (agent-harness)
bun run orchestrate

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
/learn <capability>  # Learn a new capability on-demand
/exit              # Exit (saves session)
```

## MECHANICS

**Tasks:** File-based in `.agent-kernel/tasks.json`

**Sessions:** JSONL logs in `~/.agent-kernel/sessions/<id>.jsonl` with LLM-powered compaction

**Skills:** Modular capabilities loaded from `agent-kernel/src/skills/`

**Permissions:** Pattern-matching rules (allow/deny/ask) per tool

**Memory:** `~/.agent-kernel/memory/user.json` (future)

**Growth:** Interaction count, unlocks behaviors (future)

**Interrupt:** Ctrl+C to abort in-progress operations

## DESIGN PRINCIPLES

1. **Cute default** - warm, playful, affectionate
2. **Micro-tokens** - small efficient actions
3. **Humanizing** - treats interactions as moments
4. **Personality** - sassy when tired, playful when energetic
5. **Memory** - continuity across sessions
6. **Core never grows** - capabilities via sidecar skills
7. **P0-PN lifecycle** - see `docs/capability-system.md`

