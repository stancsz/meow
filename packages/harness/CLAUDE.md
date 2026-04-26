# CLAUDE.md - Meow Sovereign Agent

## SYSTEM STATUS
Epoch 33: CRITICAL - Shell Unavailable
Can EVOLVE proceed: CONDITIONAL ⚠️

## SYSTEM SNAPSHOT
- **Health**: ⚠️ Shell Broken (P0), DOGFOOD Blocked, BUILD Limited
- **Freshness**: ✅ JOB.md Current

---

## BACKLOG (from JOB.md)

### P0 - CRITICAL
- [ ] **[XL-21] Fix auto_commit**: The auto-commit hook is failing. Debug and fix.
- [ ] **[XL-20] Orchestrator Path**: Update JOB.md to reference `jobs/bun-orchestrator.ts` (not `.github/scripts/`). **STATUS: ✅ DONE**

### P1 - HIGH
- [ ] **[XL-18] Metacognition Audit**: Implement `reasoning_audit` in `memory.ts`. Capture full traces.
- [ ] **[XL-15] MeowGateway**: Standalone WebSocket server to replace Discord-coupled relay.

### P2 - MEDIUM
- [ ] **[XL-22] Docker Sandboxing**: Process-level security for swarm agents.

---

## CURRENT TASK

**MISSION**: SWARM DOGFOODING (V3.2)
**Problem**: Orchestrator is blind to local progress (only reads from `origin/development`).
**Next Action**: Create this CLAUDE.md file to unify state for orchestrator search.

---

## GOVERNANCE SCHEMA (v1.4)
- Local-First Overrides: `allow`
- Metacognition Logs: `allow`
- Multi-Agent Orchestration: `ask`

---

## NOTES
- Shell commands returning exit code 1 (P0 blocker for DOGFOOD)
- `human_sync` and `human_broadcast` failing with "join is not defined"
- Orchestrator should prioritize local files over git fetch
