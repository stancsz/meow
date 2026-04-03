# Meow Capability System — P0 to PN Design

## Overview

Meow grows through a **graduated capability lifecycle**. New techniques start as harvest candidates and can be promoted through levels based on frequency, stability, and integration complexity.

```
┌─────────────────────────────────────────────────────────────┐
│              MEOW CAPABILITY LIFECYCLE                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  P0 — HARVEST (docs/harvest/)                               │
│  ─────────────────────────────────────────────────────────  │
│  • Untested, unproven techniques                           │
│  • Repo clones + minimal slice stubs                        │
│  • User-triggered via /learn <capability>                  │
│  • Lives in: tmp/learn/, dogfood/learned/                  │
│                                                             │
│  P1 — TRICK (src/techniques/)                             │
│  ─────────────────────────────────────────────────────────  │
│  • Proven pattern, minimal implementation                   │
│  • 20-50 lines, no external deps                           │
│  • Hot-swappable via skill loader                          │
│  • Example: checkpointing, rewind, acp-mode                │
│                                                             │
│  P2 — SKILL (src/skills/)                                 │
│  ─────────────────────────────────────────────────────────  │
│  • Full feature, tested, stable                            │
│  • Slash command interface (/review, /simplify)            │
│  • Requires restart to register (or dynamic import)        │
│  • Example: autoresearch, gstack, miro                     │
│                                                             │
│  P3 — SIDECAR (src/sidecars/)                             │
│  ─────────────────────────────────────────────────────────  │
│  • Core infrastructure extension                            │
│  • MCP integration, protocol handlers                       │
│  • Always-on capabilities                                  │
│  • Example: mcp-client, permissions, on-demand-learner    │
│                                                             │
│  PN — CORE TOOL (src/core/)                               │
│  ─────────────────────────────────────────────────────────  │
│  • Permanently internalized, never removed                  │
│  • Cannot be hot-swapped (core never grows)                │
│  • ~100 lines fixed, everything else is sidecar            │
│  • Example: lean-agent, task-store, session-store           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Level Definitions

### P0 — Harvest

**What:** Untested techniques discovered from competitor repos or community projects.

**Location:** `docs/harvest/<name>.md`

**Format:**
```yaml
---
name: <technique-name>
repo: https://github.com/<owner>/<repo>
why: Why this is worth harvesting (1 sentence)
minimalSlice: Specific feature/implementation target
fit: skill | sidecar | technique | core
status: pending | learning | implemented | skipped
complexity: 1-5 (1=easiest)
---
```

**Lifecycle:**
- User runs `/learn <capability>` → on-demand-learner finds matching harvest doc
- Clones repo to `tmp/learn/<name>/`
- Generates minimal implementation stub
- Saves to `dogfood/learned/learned.json`
- Next `/learn` invocation makes it available as a skill

**When to demote:** Never — P0 is the discovery layer, always stays.

---

### P1 — Trick

**What:** Proven patterns that work but are too minimal or volatile for full skill status.

**Location:** `src/techniques/`

**Criteria:**
- Minimal implementation: 20-50 lines
- No external dependencies beyond Node.js built-ins
- Can be hot-swapped (no restart needed)
- Single-purpose, composable

**Examples:**
- `checkpointing.ts` — git stash before writes, stash pop on /restore
- `rewind.ts` — conversation history revert
- `acp-mode.ts` — alternate protocol mode

**When to promote to P2:**
- Used 5+ times without failure
- Requires external deps (npm packages)
- User requests it via slash command

---

### P2 — Skill

**What:** Full-featured, stable capabilities with slash command interface.

**Location:** `src/skills/<name>.ts`

**Criteria:**
- Complete implementation with error handling
- Registered in `src/skills/index.ts`
- Accessible via `/<name>` slash command
- Has tests in `tests/gap-impl.test.ts`

**Lifecycle:**
- Implemented fully
- Added to skill registry
- Documented in CLAUDE.md under RECENT CHANGES

**Examples:**
- `simplify.ts` — refactoring helper
- `review.ts` — code review
- `commit.ts` — conventional commit
- `autoresearch.ts` — autonomous research (learned)

**When to promote to P3:**
- Requires infrastructure access (filesystem, network, MCP)
- Needs to be always-on (not user-triggered)
- Integration with core agent loop

---

### P3 — Sidecar

**What:** Infrastructure extensions that modify core agent behavior or provide protocol-level capabilities.

**Location:** `src/sidecars/<name>.ts`

**Criteria:**
- Always-on (loaded at startup)
- Modifies agent behavior via hooks
- May require external processes (MCP servers)
- Can access/transform tool calls

**Examples:**
- `mcp-client.ts` — MCP protocol client
- `permissions.ts` — pattern-matching permission system
- `checkpointing.ts` — pre/post tool call hooks
- `on-demand-learner.ts` — dynamic skill acquisition
- `slash-commands.ts` — command infrastructure

**When to promote to PN:**
- Used in every session
- Removing it would break core functionality
- Cannot be implemented as external tool

---

### PN — Core Tool

**What:** Permanently internalized capabilities that define Meow's identity. The core never grows — these are the fixed primitives everything else builds on.

**Location:** `src/core/<name>.ts`

**Criteria:**
- ~100 lines or less each
- Cannot be hot-swapped or disabled
- Removing would fundamentally change Meow
- No external dependencies

**Examples:**
- `lean-agent.ts` — streaming agent loop (~100 lines)
- `auto-agent.ts` — OODA autonomous mode
- `task-store.ts` — file-based task persistence
- `session-store.ts` — session logs + LLM compaction

**Rule:** Core never grows. If a new P3 sidecar becomes PN, something else in core must be simplified to compensate.

---

## Promotion & Demotion Rules

| Transition | Trigger | Process |
|------------|---------|---------|
| P0 → P1 | `/learn` succeeds, works 3+ times | Copy from `tmp/learn/` to `src/techniques/` |
| P1 → P2 | Usage frequency + external deps needed | Full implementation in `src/skills/`, add slash command |
| P2 → P3 | Infrastructure integration required | Rewrite as sidecar, always-on |
| P3 → PN | Mission-critical, session必需品 | Internalize into `src/core/`, simplify existing |
| P2 → P1 | Feature rot, better alternative | Demote to technique, remove slash command |
| P1 → P0 | Doesn't work reliably | Move back to harvest, mark as skipped |

## Escalation Algorithm

When a user request triggers `/learn`:

```
1. detectCapabilityGap(userIntent) → [gaps]
   ↓
2. If gaps detected and harvest candidate exists:
   → clone repo, generate minimal implementation
   → save to dogfood/learned/
   → register as dynamic skill
   ↓
3. If skill used 5+ times successfully:
   → promote from P0 to P1 (if simple trick)
   → or P2 (if full skill)
   ↓
4. If skill needs always-on or infrastructure:
   → promote to P3 sidecar
   ↓
5. If sidecar used in every session for months:
   → consider PN internalization
```

## On-Demand Learning Integration

The `/learn` command is the primary user interface for P0:

```
/learn research       → Learn autoresearch skill
/learn --list        → Show all harvest candidates
/learn --status      → Show learned capabilities
/learn --auto        → Auto-detect gaps in current session
```

## Harvest Candidates (Current)

Located in `docs/harvest/`:

| Candidate | Fit | Complexity | Source |
|-----------|-----|------------|--------|
| ex-skill | sidecar | 2/5 | titanwings/ex-skill |
| colleague-skill | sidecar | 3/5 | titanwings/colleague-skill |
| context7 | sidecar | 2/5 | upstash/context7 |
| gstack | skill | 3/5 | garrytan/gstack |
| autoresearch | skill | 4/5 | karpathy/autoresearch |
| mirofish | skill | 3/5 | 666ghj/MiroFish |
| agent-skills | sidecar | 2/5 | vercel-labs/agent-skills |
| minimax-skills | skill | 2/5 | MiniMax-AI/skills |
| huggingface-skills | skill | 2/5 | huggingface/skills |
| microsoft-skills | skill | 3/5 | microsoft/skills |
| mcp-confluent | sidecar | 3/5 | confluentinc/mcp-confluent |

## Design Principles

1. **Core never grows** — capabilities live outside core, promoted inward only when absolutely necessary
2. **Hot-swappable by default** — new P1/P2 capabilities don't require restart
3. **User-triggered learning** — P0 promotion happens on demand, not automatically
4. **Antifragile** — failures at any level inform the evolve loop (see `src/tools/evolve.ts`)
5. **Minimal first** — always implement the smallest viable slice before expanding
