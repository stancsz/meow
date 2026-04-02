# CLAUDE.md - Meow

## PROJECT OVERVIEW

**Meow** is a sovereign agent platform with two main components:

- **meow** 🐱 - The featherweight CLI agent (~270 lines)
- **meowclaw** 🦀 - The desktop app with Electron + Next.js server

## MISSION

Meow is a **stateless meta-orchestrator**. Its primary mission is to convert natural language intent into a structured execution plan and **delegate the heavy lifting to specialized sub-agents**.

It dispatches ephemeral Cloud Functions (Workers/Sub-Agents) that receive credentials (KMS-decrypted at runtime), load JIT skills, and execute tasks against the user's own Supabase (the Sovereign Motherboard).

## PROJECT STRUCTURE

```
meow/                      # CLI Tool (lean agent)
├── cli/index.ts          # CLI entry point
└── src/core/lean-agent.ts # Core agent (~270 lines)

meowclaw/                  # Desktop App
├── electron/              # Electron main/preload
└── server/server/         # Next.js dashboard + API

docs/research/competitors/ # Competitor research repos (gitignored)
```

## CORE AGENT (lean-agent.ts)

The agent follows a simple loop:
- User → messages[] → LLM API → response
-           ↓
-  tool_use? → execute → loop
-  else → return text

**Tools:** `read`, `write`, `shell`, `git`

**Provider:** MiniMax API (configurable via `MINIMAX_API_KEY`, `MINIMAX_BASE_URL`, `MINIMAX_MODEL`)

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

- The project is **Bun-centric** for the core engine.
- Core engine is ~270 lines in `lean-agent.ts` - extremely lean and portable.
- Project refactored from complex multi-package structure to simple `meow/` + `meowclaw/`.
- MiniMax API used as the default LLM provider (via OpenAI-compatible API).
- `docs/research/competitors/` contains cloned competitor repos for research (gitignored).
