# Meow 🐱 — The Self-Evolving Sovereign Agent

> **Meow is antifragile.** Every failure makes it stronger. Every gap it closes compounds.

Meow is a featherweight CLI agent that **never stops growing**. While other agents are static artifacts shipped by large companies, Meow is an **organism** — it runs the same OODA loop that closed its own gaps, forever.

The goal: achieve super-intelligence匹敌 (rival) Claude Opus using **cheap APIs** (MiniMax, DeepSeek) + **antifragile compounding** + **competitor harvesting**.

---

## Why Meow Wins

```
Claude Opus:    $15.00 per 1M tokens
Meow (MiniMax): $0.001 per 1M tokens
                              ─────────────
Cost ratio:                    15,000x cheaper
```

You can run **15,000 Meows** for the cost of one Opus query. Meow's strategy isn't to match Opus *per query* — it's to **compound learnings** across infinite cheap iterations until the aggregate intelligence surpasses.

### What Makes Meow Different

| Property | Claude Code | Cursor | Meow |
|----------|-----------|--------|------|
| Self-evolving | No | No | **Yes — OODA loop** |
| Learns from failures | No | No | **Yes — antifragile** |
| Harvests competitors | No | No | **Yes — auto-clone & slice** |
| Wisdom accumulation | No | No | **Yes — persists forever** |
| Architecture | Monolith | Monolith | **Sidecar modular** |
| Cost per iteration | $0.50+ | $0.30+ | **$0.0001** |
| Core size | 10K+ lines | 50K+ lines | **~100 lines** |
| Language support | en | en | **en · zh · zt** |

---

## How It Works

### The Antifragile OODA Loop

```
        ┌─────────────────────────────────────────┐
        │            MEOW EVOLVE LOOP             │
        │                                         │
        │   OBSERVE → ORIENT → DECIDE → ACT       │
        │      ↑                        │         │
        │      └────────────────────────┘         │
        │           (learns from every step)      │
        └─────────────────────────────────────────┘
```

**Every failure is catalogued, scored, and remembered.** Failure patterns accumulate across iterations. After enough failures, a gap gets blocked with a reason — so Meow never retries the same dead end.

### Wisdom Files (Persisted Forever)

```
dogfood/wisdom/
├── failure-modes.jsonl    # Every failure, root cause, timestamp
├── gap-difficulty.json   # Attempts-to-solve per gap (1-10 score)
├── solved-gaps.json      # What worked, implementation notes
├── attempt-log.jsonl     # Every attempt with outcome & duration
└── state.json           # Session state, total attempts, success rate
```

This is how Meow gets smarter without additional API calls. Claude Opus **forgets** every session. Meow **compounds**.

### Harvesting — Learning from the Competition

Meow doesn't just close its own gaps — it **studied the competitors**:

```
docs/research/competitors/
├── claude-code-source-code/  # Studied Claude Code's architecture
├── gemini-cli/               # Google's CLI agent
├── open-interpreter/          # Open source local agent
├── aider/                    # AI pair programming
├── clinerules/               # Hooks + rules engine
├── open-hands/               # Full-stack AI agent
├── mempalace/                # Memory palace — spatial memory system
└── hermes-agent/             # Self-improving agent with reflection loop
```

When Meow encounters a capability it lacks, it can:
1. Read the competitor's implementation
2. Clone the repo to `tmp/harvest/`
3. Implement a **minimal slice** as a sidecar or technique
4. Integrate it into Meow without the bloat

### Sidecar Architecture (Anti-Bloat)

```
Core Agent (~100 lines, FIXED — never grows)
├── read, write, shell, git (via tool-registry)
└── Sidecars (modular capabilities):
    ├── tool-registry.ts   # Tool registration
    ├── permissions.ts     # Pattern-matching permissions
    ├── mcp-client.ts      # MCP protocol client
    ├── checkpointing.ts   # State checkpoint/restore
    ├── i18n/              # en · zh · zt translations
    └── skills/            # simplify, review, commit
```

**The core never grows.** Capabilities are added as sidecars. When a sidecar becomes unnecessary, it can be removed without touching the core.

---

## Quick Start

```bash
# Interactive mode
bun run start

# Single task
bun run start "refactor the auth middleware"

# Dangerous mode (shell auto-approved)
bun run start --dangerous "ls -la && git status"

# Resume last session
bun run start --resume

# Language switch
/lang zh    # 简体中文
/lang zt    # 繁體中文
/lang en    # English
```

---

## Architecture

```
meow/
├── cli/index.ts              # CLI entry + REPL + slash commands
├── src/
│   ├── core/
│   │   ├── lean-agent.ts     # Core loop (~100 lines, fixed)
│   │   ├── auto-agent.ts     # OODA autonomous agent (tick/auto modes)
│   │   ├── task-store.ts     # Task persistence (.meow/tasks.json)
│   │   └── session-store.ts  # Session logs + LLM compaction
│   ├── sidecars/
│   │   ├── tool-registry.ts  # Tool registry (read/write/shell/git)
│   │   ├── permissions.ts   # Pattern-matching permissions
│   │   ├── mcp-client.ts     # MCP protocol client
│   │   ├── checkpointing.ts  # State checkpoint/restore
│   │   ├── slash-commands.ts # /help, /plan, /lang, /tasks, etc.
│   │   └── i18n/             # Three-locale translations
│   ├── skills/
│   │   ├── simplify.ts       # Refactoring skill
│   │   ├── review.ts         # Code review skill
│   │   └── commit.ts         # Conventional commit skill
│   └── tools/
│       ├── evolve.ts         # Antifragile OODA loop (run it!)
│       └── harvest.ts        # Repo learning orchestrator
└── tests/
    ├── gaps.test.ts          # Gap identification
    └── gap-impl.test.ts      # Gap implementation tests
```

---

## Self-Evolution (evolve.ts)

```bash
# Run the full antifragile loop (runs forever)
bun run meow/src/tools/evolve.ts

# Single iteration (for CI/testing)
bun run meow/src/tools/evolve.ts --once

# Check current status
bun run meow/src/tools/evolve.ts --status

# Full wisdom report
bun run meow/src/tools/evolve.ts --report
```

### Rigorous 3-Step Verification

Before declaring a gap **solved**, evolve.ts runs three **independent** checks:

1. **Direct test run** — parses `bun test` output for real pass/fail counts (not self-reported)
2. **CLI smoke test** — spawns a fresh Claude Code process to exercise the feature
3. **gaps.test.ts认可** — verifies the gap is no longer flagged

If any step fails, the failure is logged, root cause extracted, difficulty score incremented, and the gap re-attempted in the next iteration.

---

## Harvesting (harvest.ts)

Meow can learn tricks from other projects automatically:

```bash
bun run meow/src/tools/harvest.ts
```

It reads from `docs/harvest/`:
- `watchlist.yaml` — P1-P3 prioritized sources to harvest from
- Implementation patterns cloned to `src/sidecars/` or `src/techniques/`

---

## Slash Commands

```
/help              Show all commands
/plan <task>       Plan mode — shows intent before executing
/dangerous         Toggle dangerous mode (auto-approve shell)
/clear             Clear screen and conversation
/tasks             List tasks
/add <task>        Add a task
/done <id>         Complete a task
/sessions          List saved sessions
/resume <id>       Resume a session
/lang en|zh|zt     Switch language (persists to ~/.meow/config.json)
/exit              Exit and save session
```

---

## The Cost of Intelligence

| Model | Cost/1M tokens | Meow-equivalent iterations |
|-------|---------------|---------------------------|
| Claude Opus | $15.00 | 1 query |
| Claude Sonnet | $3.00 | 5 queries |
| GPT-4o | $2.50 | 6 queries |
| **MiniMax** | **$0.001** | **15,000 iterations** |
| **DeepSeek V3** | **$0.001** | **15,000 iterations** |

Meow spends $0.0001 per iteration (MiniMax + Claude Code CLI overhead). At that price, **$100 of compute closes 1,000,000 gaps**.

---

## Why Not Just Use Claude Code?

Claude Code is a **tool**. Meow is a **creature**.

- Claude Code has no memory between sessions
- Claude Code doesn't self-improve
- Claude Code is a product, not a platform
- Claude Code costs 15,000x more per iteration

Meow's edge is **compounding**. Every gap it closes, every failure it learns from, every trick it harvests — it **never forgets**. Run it for a week and you have an agent that knows your codebase better than any static model could.

---

## Design Principles

1. **Core never grows** — capabilities live in sidecars
2. **Antifragile** — failures are data, not embarrassment
3. **Micro-tokens** — efficiency over brute force
4. **Harvest over reinvent** — clone and slice from competitors
5. **Dogfood or it didn't happen** — every feature tested before declared done
6. **Trash the bloat** — stray files go to `.trash/`, not the codebase
7. **Cute default** — 🐱 personality in every interaction

---

## Recent Evolutions

- **GAP-SLASH-001** — `/help` and `/plan` slash commands work
- **GAP-ABORT-002** — SIGINT handler for Ctrl+C abort
- **GAP-I18N-003** — Three-language support (en · zh · zt)
- **Antifragile loop** — evolve.ts with 3-step verification
- **Checkpointing** — State restore from `~/.meow/checkpoints/`

---

*Meow is not a product. Meow is a process. The process is the point.*
