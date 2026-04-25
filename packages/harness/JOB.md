# JOB.md
[Status: MISSION - CRYSTALLIZATION PROTOCOL]

**Goal:** Implement the "Hermes-class" Skill Self-Crystallization loop, enabling Meow to autonomously learn from successful executions and build its own capability library.

## 🛠️ MISSION: CRYSTALLIZATION PROTOCOL
**Priority**: CRITICAL (Highest Leverage vs Hermes Agent)
**Success Criteria**:
- [ ] **[XL-01] Done Hooks Registry**: Implementation of a hook system that triggers after successful `AgentResult`.
- [ ] **[XL-02] Pattern Capture**: Ability to serialize a successful tool-call sequence into a "Skill SOP" (Standard Operating Procedure).
- [ ] **[XL-03] Skill Tree Storage**: Persistence of SOPs to `.meow/skills/crystallized/` with FTS5 search indexing.
- [ ] **[XL-04] Verification Handshake**: New tests pass in `packages/kernel/tests/crystallization.test.ts`.

## 📋 BACKLOG: HERMES PARITY
1. **[HERMES-01] Skill Self-Crystallization**: (CURRENT MISSION)
2. **[HERMES-02] Cross-Session Recall**: FTS5 session search + LLM summarization.
3. **[HERMES-03] User Modeling (Honcho)**: Learned preference extraction and profile management.
4. **[HERMES-04] Scheduled Automations**: Natural language cron jobs for background maintenance.
5. **[HERMES-05] Context Sandboxing**: 5KB-ref summarization for 98% context reduction.

# EVOLVE
[Status: RESEARCHING - Pattern Serialization]
**Priority**: HIGH

## MISSION
Research and define the "Meow Skill SOP" format.
1. Analyze `packages/harness/evolve/backlog/skill-self-crystallization.md`.
2. Define the exact JSON/Markdown structure for a "Crystallized Skill".
3. Map `ToolCall[]` to `SOP.Steps`.
4. Document the serialization logic in `packages/kernel/docs/crystallization-logic.md`.

# PLAN
[Status: IDLE]
**Priority**: HIGH

## MISSION
Define the `DoneHook` interface and the `SkillCrystallizer` implementation. Write the `crystallization.test.ts` to define the success criteria for pattern capture.

# BUILD
[Status: IDLE]
**Priority**: CRITICAL

## MISSION
Implement the `DoneHooks` system in `lean-agent.ts` and create the `crystallization` sidecar to handle SOP writing and FTS5 indexing.

# DOGFOOD
[Status: IDLE]
**Priority**: CRITICAL

## MISSION
Run a multi-step task (e.g., "Create a new React component with tests and a storybook file"), verify Meow identifies the pattern, and check if a new skill file is autonomously generated in `.meow/skills/crystallized/`.

---

## ⚖️ GOVERNANCE SCHEMA (v1.1)
- New Skill Creation: Requires `ask` (human review before a crystallized skill becomes "active").
- Skill Recovery: `allow` (agent can read its own crystallized skills).
- Filesystem Workspace: `packages/` and `.meow/`.
