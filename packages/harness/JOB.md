# JOB.md
[Status: MISSION - SWARM DOGFOODING (V3.1)]

**Goal:** Use the newly active Meowju Swarm to close the final architectural gaps with competitors like OpenClaw and Vellum, achieving "Sovereign Agent" status.

## ✅ COMPLETED MISSIONS (V3 FOUNDATION)
- [x] **[XL-16] Shared Memory Bus**: SQLite WAL multi-process core.
- [x] **[XL-17] Proactive Heartbeat**: Background daemon.
- [x] **[XL-08] Swarm Spawning**: `pounce` tool with autonomous reporting.

## 🛠️ MISSION: DOGFOODING - THE SOVEREIGN UPGRADE
**Priority**: CRITICAL
**Dogfooding Strategy**: Meow must spawn a Researcher-Kitten to design the MeowGateway while a Coder-Kitten implements the Metacognition Audit.

### [XL-15] MeowGateway (Decoupling)
- [ ] **Goal**: Move Discord logic into a standalone WebSocket gateway.
- [ ] **Success**: Main loop runs independently of any chat platform.

### [XL-18] Metacognition Audit (Self-Correction)
- [ ] **Goal**: Add `reasoning_audit` table to SQLite. Record Every "Final Thought" vs "Tool Failure".
- [ ] **Success**: Meow can query past failures to avoid repeating mistakes.

### [XL-19] Dockerized Sandbox (Security)
- [ ] **Goal**: Run the `pounce` runner inside a transient Docker container for untrusted tasks.
- [ ] **Success**: No filesystem escape possible during background research.

### [XL-11] MeowHub (Skill Marketplace)
- [ ] **Goal**: Implement `fetch_skill` to pull from a git-based registry.
- [ ] **Success**: Meow can learn new tools without a code change.

# EVOLVE
[Status: RESEARCHING - Gateway Decoupling]
**Priority**: HIGH

## MISSION
Spawn a `Researcher-Kitten` to find the best WebSocket implementation for a Node/Bun gateway.
- `pounce "Research best Bun WebSocket patterns for agent-to-gateway communication" --role "Researcher"`

# PLAN
[Status: IDLE]
**Priority**: HIGH

## MISSION
Design the `reasoning_audit` schema. Every `AgentResult` should be persisted with its `messages[]` history to enable future "Experience Replay."

# BUILD
[Status: IDLE]
**Priority**: CRITICAL

## MISSION
Implement `fetch_skill` tool to allow Meow to pull `.md` skill files from a remote repository.

# DOGFOOD
[Status: ACTIVE]
**Priority**: CRITICAL

## MISSION
Ask Meow: "Pounce on a task to audit our own security. Have a kitten check for sensitive keys in the repo using `grep` and report back."
- **Verify**: The swarm reports findings to the bus, and the relay pings the user with the report.

---

## ⚖️ GOVERNANCE SCHEMA (v1.3)
- Multi-Process IPC: `allow` (Memory Bus usage).
- Remote Skill Fetching: `ask` (human verifies new skills).
- Docker Pounce: `allow` (default for untrusted domains).
