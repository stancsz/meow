---
name: meow-setup
description: Set up and use MEOW as a sovereign meta-orchestrator for delegating to Claude Code, Aider, and OpenCode
category: orchestration
---

# MEOW Setup & Usage

## What is MEOW?

MEOW (Meta-Orchestrator) is a **sovereign orchestration layer** — it never writes code directly. Instead, it:
1. Takes a user prompt
2. Decomposes the task into subtasks
3. Delegates to specialists (Claude Code, Aider, OpenCode) via the `summon` tool
4. The specialist does the work
5. `MissionReviewer` independently verifies the output
6. `MeowKernel` tracks heartbeats and respawns frozen agents

## Execution Architecture

### Why This Matters
MEOW uses **Node.js + tsx**, NOT Bun. Bun crashes on `better-sqlite3` (native C++ addons).

### Run MEOW
```bash
npx tsx src/index.ts
```

### Run with a command (non-interactive)
```bash
npx tsx src/index.ts "your task here"
```

### Required environment variables (.env)
```
LLM_API_KEY=your-api-key
LLM_BASE_URL=http://localhost:11434  # or Anthropic endpoint
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
EMBEDDING_DIMENSION=1536
```

## How MEOW Delegates Work

### The Summon Tool
The `summon` tool (in `src/agent/summoner.ts`) invokes external agents:

| Agent | When to Use |
|-------|-------------|
| `cc` / `claude` | Complex reasoning, debugging, state-of-the-art coding |
| `aider` | Multi-file edits, git-integrated refactoring |
| `opencode` | Autonomous project engineering |
| `claude-hermes` | Self-evolving skills and workflow codification |
| `claude-browseros` | Web automation via BrowserOS MCP |
| `eigent` | Multi-agent parallel workforce |

### Delegation Flow
```
USER → MEOW (orchestrator)
       ↓
   [decomposes task]
       ↓
   CLAUDE CODE (specialist) ← summoned via `summon cc {goal}`
       ↓
   MISSION REVIEWER (verifier) ← independent verification
       ↓
   MEOW Kernel (supervisor) ← tracks heartbeats, respawns frozen agents
```

## Verification Loop (CRITICAL)

**Every agent MUST explain back what they understood before starting work.**

Before delegating any task to a specialist, MEOW forces this exchange:

```
MEOW: "Summarize your understanding of the task and how you'll approach it."
AGENT: [explains back]
MEOW: [validates understanding] → proceed OR clarify
```

**Why**: OpenCode/Claude Code are "shit out of the box" — they don't understand unless explicitly asked to explain back. Forcing explanation reveals gaps and prevents lazy execution.

## MeowKernel Responsibilities

| Function | Description |
|----------|-------------|
| `pulse(pid)` | Agents call this periodically to show they're alive |
| `registerMission(pid, agent, goal)` | Track a running mission |
| `watchdogCheck()` | Detect frozen agents (no pulse for 20+ min) |
| `respawnAgent(pid)` | Kill frozen agent, fork replacement |
| `shutdown()` | Graceful drain of queued state before exit |

## Quantum Memory

MEOW stores embeddings in `vec_memory` (sqlite-vec) for semantic recall:

- `embedding float[1536]` dimension
- Recall is LSH-proxy based (mock embedding, not full model)
- Once-read memories are "measured" and removed from superposition (no-cloning theorem)

## File Structure Reference

```
src/
├── agent/
│   ├── agent.ts          # Core chat + LLM logic
│   ├── summoner.ts       # summon() tool + specialist commands
│   ├── mission_reviewer.ts  # verify() — independent verification
│   ├── quantum_memory.ts # Vector store + recall
│   ├── harvester.ts      # Distill successful patterns → SKILL.md
│   └── quantum_reasoning.ts  # Grover amplitude amplification
├── kernel/
│   ├── kernel.ts         # MeowKernel — heartbeat, watchdog, respawn
│   └── database.ts       # MeowDatabase — better-sqlite3 + sqlite-vec
├── orchestrator/         # Task decomposition, parallel execution
└── index.ts              # Entry point
```

## Important Notes

1. **MONOLITH_BLUEPRINT** in `agent.ts` defines the "Rules of the House" — all specialists must follow these.
2. **QUANTUM PRESERVATION**: Do NOT modify `quantum_*.ts` files unless explicitly asked.
3. **SINGLE WRITER PHYSICS**: All state mutations go through MeowKernel — no direct DB writes.
4. **Skills ecosystem**: Before summoning a specialist, check if a skill exists: `npx skills find <topic>`

## Examples

### Summoning Claude Code for a complex fix:
```typescript
await summon("cc", {
  goal: "Fix the race condition in the kernel drain loop",
  files: ["src/kernel/kernel.ts"],
  lastError: "Concurrent writes caused SQLITE_BUSY",
  monolithBlueprint: agent.MONOLITH_BLUEPRINT,
  kernel: kernel
});
```

### Non-blocking parallel summon:
```typescript
const results = await summonParallel([
  { name: "cc", context: { goal: "Fix auth", files: ["src/auth.ts"] } },
  { name: "qa", context: { goal: "Write tests", files: ["src/auth.ts"] } }
]);
```
