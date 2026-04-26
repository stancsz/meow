# JOB.md
[Status: MISSION - SWARM DOGFOODING (V3.2)]

**Goal:** Close the "Orchestration Gap." Meow must autonomously manage her own mission state by aligning the Orchestrator with the new Sovereign V3 architecture.

## ✅ COMPLETED MISSIONS
- [x] **[XL-16] Shared Memory Bus**: Multi-process SQLite WAL core.
- [x] **[XL-17] Proactive Heartbeat**: Background daemon active.
- [x] **[XL-08] Swarm Spawning**: Sub-kitten delegation verified.

## 🛠️ MISSION: DOGFOODING - THE ORCHESTRATION SYNC
**Priority**: CRITICAL
**Problem**: The `orchestrator.ts` is blind to local progress because it only reads from `origin/development`. This breaks the autonomous OODA loop.

### [XL-20] Local-First Orchestration
- [x] **Updated**: Orchestrator path = `jobs/bun-orchestrator.ts` (not `.github/scripts/`).
- [ ] **Goal**: Patch orchestrator to prioritize local `JOB.md` and `CLAUDE.md` over remote git fetches.
- [ ] **Success**: Running `bun run packages/harness/jobs/orchestrate` successfully picks up the V3.2 mission.

### [XL-18] Metacognition Audit (Experience Replay)
- [ ] **Goal**: Implement `reasoning_audit` in `memory.ts`. Capture full traces of swarm successes/failures.
- [ ] **Success**: Meow can use `search_memory` to find "Lessons Learned" from previous tasks.

### [XL-15] MeowGateway (Platform Sovereignty)
- [ ] **Goal**: Standalone WebSocket server to replace the Discord-coupled relay.
- [ ] **Success**: Sub-process gateway sends pings to a local web dashboard.

# EVOLVE
[Status: RESEARCHING - Orchestrator Refactor]
**Priority**: HIGH

## MISSION
Spawn a `SRE-Kitten` to audit `jobs/bun-orchestrator.ts` and propose a patch for "Local-First" execution.
- `pounce "Read jobs/bun-orchestrator.ts and find how to make it load local CLAUDE.md and JOB.md instead of git show origin/development" --role "SRE"`

# PLAN
[Status: IDLE]
**Priority**: HIGH

## MISSION
Unify `JOB.md` and `CLAUDE.md`. Move the Backlog and Current Task sections into `CLAUDE.md` to satisfy the orchestrator's search heuristics.

# BUILD
[Status: IDLE]
**Priority**: CRITICAL

## MISSION
Implement the `reasoning_audit` table and wire it into the `DoneHooks` in `relay.ts`.

# DOGFOOD
[Status: ACTIVE]
**Priority**: CRITICAL

## MISSION
Run the newly patched orchestrator and verify it delegates a task from the V3.2 backlog to "Jules."

---

## ⚖️ GOVERNANCE SCHEMA (v1.4)
- Local-First Overrides: `allow` (for faster dev cycles).
- Metacognition Logs: `allow` (privacy-first local storage).
- Multi-Agent Orchestration: `ask` (human review of swarm plans).
