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

# EVOLVE
[Status: RESEARCH LOOP - Capability Gap Discovery]
**Priority**: HIGH

## MISSION
Research and identify capability gaps. Focus on:
1. Scan `dogfood/validation/*.json` for NOT_IMPLEMENTED/FAIL epochs
2. Find patterns in job history errors
3. Research fixes for the most impactful gaps
4. Document findings in `evolve/research/`

## Output
Create `evolve/research/epoch-XX-gaps.md` with:
- Top 3 capability gaps found
- Proposed implementation approach
- Risk assessment

---

# PLAN
[Status: IDLE - Awaiting EVOLVE findings]
**Priority**: HIGH

## MISSION
Choose ONE gap from EVOLVE research, write architecture.md and validation.test.ts.

## Output
Create in the epoch directory:
- `architecture.md` - Full technical design
- `validation.test.ts` - TDD test that defines "done"

---

# BUILD
[Status: IDLE - Awaiting PLAN]
**Priority**: CRITICAL

## MISSION
Implement code to pass validation.test.ts. Create the actual implementation files.

## Output
Implement the files specified in architecture.md. Must include:
- All source files
- All配套 tests
- Epoch comment markers

---

# DOGFOOD
[Status: VALIDATION LOOP - Testing Implementations]
**Priority**: CRITICAL

## MISSION
Run tests. If pass → mark epoch VALIDATED. If fail → report exact fix needed.

## Output
Create `dogfood/validation/epoch-XX.json` with:
- `status`: "VALIDATED" | "FAIL" | "NOT_IMPLEMENTED"
- `verdict`: Brief description
- `exact_fix`: What BUILD needs to fix

---

## ⚖️ GOVERNANCE SCHEMA (v1.0)
- Tools requiring `ask`: `run_command`, `write_to_file`, `replace_file_content`, `multi_replace_file_content`.
- Tools requiring `allow`: `list_dir`, `view_file`, `grep_search`.
- Global Policy: `denied` by default for any filesystem action outside of the workspace root.
