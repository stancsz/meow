# JOB.md
[Status: MISSION - COWORKER EVOLUTION (V3)]

**Goal:** Transform Meow from a reactive agent into a proactive, multi-agent "Coworker" workstation, surpassing contemporary frameworks like OpenClaw and Vellum.

## ✅ COMPLETED MISSIONS (HERMES PARITY)
- [x] **[HERMES-01] Skill Self-Crystallization**: Autonomous SOP authorship active.
- [x] **[HERMES-02] Cross-Session Recall**: SQLite FTS5 "Infinite Recall" active.
- [x] **[HERMES-03] User Modeling (Honcho)**: Social discovery and bond tracking active.
- [x] **[HERMES-05] Context Sandboxing**: 98% context reduction active.
- [x] **[MMX-01] MiniMax Multimodal**: Vision, Image, and Video gen active.

## 🛠️ MISSION: PROACTIVITY (Vellum Style)
**Priority**: CRITICAL
**Success Criteria**:
- [ ] **[XL-05] Proactive Daemon**: Meow can "wake up" autonomously based on a schedule or repo events.
- [ ] **[XL-06] The Check-In**: Implementation of spontaneous human-in-the-loop check-ins for long-running missions.
- [ ] **[XL-07] Autonomous Scratchpad**: A persistent `/scratch` directory where Meow drafts plans before execution.

## 🛠️ MISSION: MULTI-AGENT SWARMS (Kimi/CrewAI Style)
**Priority**: HIGH
**Success Criteria**:
- [ ] **[XL-08] Swarm Spawning**: Meow can spawn "Sub-Kittens" (background agents) for parallelized research/coding.
- [ ] **[XL-09] Role Specialization**: Automated role-prompting (e.g., Researcher-Kitten, QC-Kitten, SRE-Kitten).
- [ ] **[XL-10] Result Aggregator**: Kernel logic to merge swarm results into a single final action.

## 🛠️ MISSION: SKILL MARKETPLACE (OpenClaw Style)
**Priority**: MEDIUM
**Success Criteria**:
- [ ] **[XL-11] Remote Skill Loading**: Ability to fetch skills from a remote manifest (ClawHub or MeowHub).
- [ ] **[XL-12] Skill Versioning**: Logic to handle updates to crystallized skills.

# EVOLVE
[Status: RESEARCHING - Proactive Triggers]
**Priority**: HIGH

## MISSION
Research the best triggers for a "Proactive Coworker."
1. Watch `data/` for changes in status files.
2. Monitor `git` events (new PRs, issues).
3. System-level cron (e.g., "Review the logs every morning at 9am").

# PLAN
[Status: IDLE]
**Priority**: HIGH

## MISSION
Design the `auto-daemon.ts` architecture for the Harness. It should be capable of running independently of Discord messages.

# BUILD
[Status: IDLE]
**Priority**: CRITICAL

## MISSION
Implement the `Sub-Kitten` spawn tool in the Kernel.

# DOGFOOD
[Status: IDLE]
**Priority**: CRITICAL

## MISSION
Task Meow with "Watch this repo and fix any lint errors as they appear in new commits" and verify she acts without being prompted.

---

## ⚖️ GOVERNANCE SCHEMA (v1.2)
- Swarm Spawning: `ask` (cost protection).
- Proactive Actions: `ask` (human review of proactive plans).
- Scratchpad Usage: `allow` (agent-internal thinking).
