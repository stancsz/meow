# JOB.md
[Status: MISSION - SWARM DOGFOODING (V3.2)]

**Goal:** Close the "Orchestration Gap." Meow must autonomously manage her own mission state by aligning the Orchestrator with the new Sovereign V3 architecture.

## ✅ COMPLETED MISSIONS
- [x] **[XL-16] Shared Memory Bus**: Multi-process SQLite WAL core.
- [x] **[XL-17] Proactive Heartbeat**: Background daemon active.
- [x] **[XL-08] Swarm Spawning**: Sub-kitten delegation verified.
- [x] **[XL-20] Orchestrator Path**: Updated JOB.md to reference `jobs/bun-orchestrator.ts`.
- [x] **[XL-21] Auto-commit Fix**: Added read-only filesystem detection to auto-daemon.ts.
- [x] **[XL-18] Metacognition Audit**: Created reasoning-audit.ts + reasoning-audit-hook.ts, wired into DoneHooks.

## 🛠️ MISSION: DOGFOODING - THE ORCHESTRATION SYNC
**Priority**: CRITICAL

### [XL-15] MeowGateway (Platform Sovereignty) [PENDING]
- [ ] **Goal**: Standalone WebSocket server to replace the Discord-coupled relay.
- [ ] **Success**: Sub-process gateway sends pings to a local web dashboard.

### [XL-22] Docker Sandboxing [PENDING]
- [ ] **Goal**: Process-level security for swarm agents.

---

## 🚨 KNOWN BLOCKERS
- Shell exit 255: Cannot run DOGFOOD tests. May need manual git push for staged changes.

## 📊 CURRENT ORCHESTRATION STATUS
- **Agent**: Embers
- **Completed**: XL-18 (Metacognition Audit) wired into relay.ts DoneHooks
- **In Progress**: Waiting on sub-kitten reports (SRE-Debug, Researcher)
- **Next Priority**: XL-15 (MeowGateway), XL-22 (Docker Sandboxing)

---

## ⚖️ GOVERNANCE SCHEMA (v1.4)
- Local-First Overrides: `allow` (for faster dev cycles).
- Metacognition Logs: `allow` (privacy-first local storage).
- Multi-Agent Orchestration: `ask` (human review of swarm plans).