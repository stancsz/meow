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
packages/
├── kernel/                   # The soul - Core agent logic
│   ├── cli/index.ts          # CLI + REPL + slash commands
│   └── src/
│       ├── core/             # Lean agent OODA loop
│       ├── sidecars/         # Logical sidecars (MCP, registration)
│       └── skills/           # High-level skills (commit, review)
└── harness/                  # The body - Research & Dogfooding
    ├── jobs/                 # Orchestrators & workers
    ├── evolve/               # Evolution findings
    └── src/                  # Harness-specific tools

apps/
├── desktop/                  # Electron main process
└── dashboard/                # Next.js UI (the "server")
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
- **Orchestrator Switch** — Job orchestrator now uses @meow/kernel for worker tasks (dogfooding)
- **--mcp-config** — CLI flag to load custom MCP server configurations
- **On-demand learning** — /learn <capability> dynamically acquires skills from harvest list
- **P0-PN capability system** — graduated lifecycle: harvest → trick → skill → sidecar → core
- **11 harvest candidates** — ex-skill, context7, autoresearch, gstack, mirofish, and more

## WORKSPACE ORGANIZATION

To prevent file clutter and keep the project organized, always use the dedicated **Zones**:

| Zone | Path | Purpose |
| :--- | :--- | :--- |
| **Research** | `packages/harness/evolve/research/` | Research findings |
| **Dogfood** | `packages/harness/dogfood/results/` | Test results |
| **Design** | `packages/harness/design/proposals/` | UI/UX designs |
| **Computer** | `packages/harness/computer/` | General automated outputs |
| **Scratch** | `packages/harness/scratch/` | Temporary files |

**Rules:**
1. **Never** create one-off files in the root or `src/` directories.
2. Use the `Scratch` zone for any temporary work that doesn't fit a specific mission.
3. Path references in `JOB.md` should always follow these standards.

## DOGFOOD NOTES

- **train.sh** delegates to evolve.ts OODA loop: observe → orient → decide → act
- Heavy logic lives in `@meow/kernel/src/tools/evolve.ts`, train.sh is just a thin wrapper
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

# Single task
bun run start "your prompt"

# Dangerous mode (shell auto-approve)
bun run start --dangerous "ls -la"

# Run job orchestrator (@meow/harness)
bun run orchestrate
```

## AGENT WORKSPACE

### CURRENT MISSION: V3.2 ORCHESTRATION SYNC
**Objective**: Fix the mission stall by patching the orchestrator to be "Local-First."
**Progress**: 0%
**Active Swarm**: IDLE

## BACKLOG

1. **[XL-20] Orchestrator Local-First Sync**: Patch `orchestrator.ts` to read local files. [HIGH]
2. **[XL-18] Metacognition Audit**: Implement reasoning logs in SQLite. [HIGH]
3. **[XL-15] MeowGateway**: Standalone WebSocket server. [MEDIUM]
4. **[XL-11] MeowHub**: Skill marketplace integration. [LOW]

*Note: For the full detailed backlog and mission status, see packages/harness/JOB.md.*
