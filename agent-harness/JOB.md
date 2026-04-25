# JOB.md
[Status: MISSION - COWORKER STABILITY GATE]

**Goal:** Transform the theoretical Coworker architecture into a 100% operational, validated workstation.

## 🛠️ MISSION: THE STABILITY GATE (COMPLETE ✅)
**Priority**: CRITICAL
**Success Criteria**:
- [x] **[BOOT-01] Orchestrator-Governance Hook**: Unified `GovernanceEngine` integration with `bun-orchestrator.ts`.
- [x] **[BOOT-02] Live Stream Broadcast**: Orchestrator now uses `POST /broadcast` for real-time mission logs.
- [x] **[BOOT-03] Validation Test (Shadow Mirror)**: `tests/coworker_handshake.test.ts` PASSES.

## 📋 BACKLOG: COWORKER MASTER (Post-Stability)
1. **[COWORK-02] Real-time SSE Streaming**: High-fidelity reasoning token stream to `MissionLog`.
2. **[COWORK-03] Routine Scheduler**: Background "Crontab" for agent dailies.
3. **[COWORK-04] Skill Registry**: Standardized `.meow/skills/` manager.
4. **[COWORK-05] Electron Distribution**: Finalize the Electron build scripts for Windows/Linux installers. (✅ Shell implemented).
5. **[COWORK-06] Shared Templates**: Repeatable OODA prompt library.
6. **[COWORK-07] HeyGen Hyperframes Video Editing**: Integrate the `VideoHyperframesSkill` enabling "Video as Code" workflows. Implement the `/hyperframes` command in the orchestrator and the Video Studio view in the Dashboard.

## ⚖️ GOVERNANCE SCHEMA (v1.0)
- Tools requiring `ask`: `run_command`, `write_to_file`, `replace_file_content`, `multi_replace_file_content`.
- Tools requiring `allow`: `list_dir`, `view_file`, `grep_search`.
- Global Policy: `denied` by default for any filesystem action outside of the workspace root.
