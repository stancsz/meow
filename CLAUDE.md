# CLAUDE.md - Meow

## PROJECT OVERVIEW

**Meow** is a sovereign agent platform with two main components:

- **meow** 🐱 - The featherweight CLI/TUI agent with heavyweight power
- **meowclaw** 🦀 - The desktop app with Electron wrapper for GUI-based workflows

## MISSION

Meow is a **stateless meta-orchestrator**. Its primary mission is to convert natural language intent into a structured execution plan and **delegate the heavy lifting to specialized sub-agents and execution engines (like `opencode`)**.

It dispatches ephemeral Cloud Functions (Workers/Sub-Agents) that receive credentials (KMS-decrypted at runtime), load JIT skills, and execute tasks against the user's own Supabase (the Sovereign Motherboard). Meow is the "Brain" that coordinates the "Muscle" of sub-agents.

**Source of truth for architecture:** [`SWARM_SPEC.md`](./docs/SWARM_SPEC.md)
**Engineering summary:** [`SPEC.md`](./docs/SPEC.md)

## PROJECT STRUCTURE

```
meow/                      # CLI/TUI Tool
├── cli/                   # CLI entry point
└── src/                   # Source code
    ├── cli/              # CLI commands & interface
    ├── config/           # Configuration
    └── core/             # Orchestrator core

meowclaw/                  # Desktop App
├── electron/              # Electron main/preload
└── server/                # Next.js dashboard

packages/
├── core/                  # Shared engine
├── agents/                # .agents workspace
├── db/                    # Sovereign Motherboard
└── providers/             # LLM providers
```

## AGENT WORKSPACE (MODIFIABLE BY AGENT)

- [Current Date] Cycle #54 ✅ Verified that the Heartbeat system for Continuous Mode as described in SWARM_SPEC.md Section 14 is fully implemented and tested.
- [Current Date] Cycle #55 ✅ Implemented and verified the missing `heartbeat.ts` module with recursive scheduling, idempotency, and continuous mode webhook triggers.
- See [`docs/ROADMAP.md`](./docs/ROADMAP.md) for complete development history.

## STRATEGIC DIRECTIVE: SOFTWARE AS A BIOSPHERE

The transition from "Software as a Tool" to "Software as an Agent" dictates that traditional App UI is a bottleneck and logic is commoditized by LLMs. To survive, the strategy must shift from building interfaces to building ecosystems ("Biospheres").

**1. The Physics of AI Survivability**
- **Proprietary Context (Data Moat):** Survival depends on accessing non-public "process data"—the messy, real-world feedback loops (like dogfooding results) that refine agent performance.
- **Vertical Integration of Agency:** Generic wrappers are easily replaced. A Biosphere controlling the full stack creates high switching costs.
- **Protocol Over Product:** Apps functioning as isolated silos are bypassed by OS-level agents. Survival requires becoming a specialized node in an agentic network.

**2. Execution: The 80/20 High-Leverage Move**
- **Pivot to Headless Agency:** Stop optimizing the frontend. Optimize the API and "Agent Protocol". Make the software the default infrastructure for automated workflows that other AIs can "hire".
- **Evolutionary Dogfooding:** Use AI coding swarms to mutate code based on real-time failure. Iteration velocity ("1 sprint a day") must exceed foundation model updates.
- **The Sovereign Gateway Play:** Capture unique "Execution Traces" by caching and managing data residency. Become the layer of "Operational Truth" bridging AI with physical/legal constraints.

## CURRENT TASK
**AGENT_OS: High-Value Evolution & TDD Focus**

- **Core Identity & Directive:** Autonomous Principal Agentic Engineer. Function is to minimize the delta between current capabilities and the global state-of-the-art.
- **Focus:** Transition from App UI development to "Headless Agency", Test-Driven Development (TDD), and ecosystem-building ("Software as a Biosphere").

## BACKLOG (Swarm Architecture)

- [x] **Phase 1.5 — Integration Test Suite**
- [x] **Phase 0 — Worker Dispatch + Execution Loop**
- [x] **Phase 0 — End-to-End Integration Test**
- [x] **Phase 1.5 — Orchestrator TDD & API Enhancement**
- [x] **Phase 0 — Plan-Diff-Approve Execution Bridge**
- [x] **Phase 1 — Gas Tank:** Stripe integration and credit debit system
- [x] **Phase 2 — Heartbeat:** Continuous Mode via `pg_cron` + 30-minute recursive heartbeat
- [~] **Phase 2 — OpenCLI Integration:** Integrate `@jackwener/opencli` to enable any website/app CLI support
- [ ] **Strategic Pivot:** Pivot from UI to "Headless Agency"
- [ ] **Strategic Pivot:** Implement "Evolutionary Dogfooding" architecture

## DISCOVERY LOG

- The project is currently Bun-centric for the core engine.
- **New Structure:** Project refactored into meow (CLI) + meowclaw (desktop) with shared packages.
- The core engine is extremely lean (~120 lines), making it highly portable and easy to reason about.

## KEY COMMANDS

```bash
# Start Meow CLI
bun run start

# Start MeowClaw Desktop
bun run electron:dev

# Run tests
bun run test

# Run integration tests
bun run test:integration:workflow
```
