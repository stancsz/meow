# EVOLVE.md - Learning & Evolution Log

## V3.3 SOVEREIGN UPGRADE - EXECUTION SUMMARY

### What We Built
| Component | Status | Key Learnings |
|-----------|--------|---------------|
| MeowGateway | ✅ Complete | WebSocket protocol separation from Discord enables true platform sovereignty |
| SandboxManager | ✅ Complete | Docker isolation critical for untrusted agent code; host fallback essential |
| GovernanceEngine | ✅ Complete | Human-in-the-loop prevents autonomous runaway; auto-approval timeout balances safety/speed |
| ReasoningAudit | ✅ Complete | OODA loop tracking creates actionable metacognition; trace logging essential |
| AutoCommitFix | ✅ Complete | Read-only filesystem detection prevents daemon crashes in constrained environments |

### Key Technical Decisions
1. **Token-based auth** for MeowGateway (simpler than certificate rotation)
2. **Auto-fallback to host execution** when Docker unavailable
3. **SQLite WAL mode** for multi-process shared memory
4. **Broadcast routing**: PROMPT → specific agent, HEARTBEAT → all clients

### Architecture Patterns Validated
- Sidecar pattern for governance hooks
- OODA loop for metacognition
- Process sandboxing for security

---

## V3.2 → V3.3 MIGRATION LOG

### Completed
- [x] Gateway decoupling from Discord
- [x] Docker sandboxing for swarm agents
- [x] Metacognition audit system
- [x] Auto-commit read-only FS handling

### Rollback Notes
- None required - all components built incrementally with verification

---

## V3.4 PLANNING HORIZON

### Candidate Backlog Items
1. **MeowGateway Live Integration** - Test PROMPT → RESULT flow end-to-end
2. **Swarm Health Dashboard** - Real-time agent status visualization
3. **Governance Schema v1.5** - Enhanced permission granularity
4. **Cross-Platform Agent Spawning** - Windows/Linux container parity

### Technical Debt
- Shell exit 255 (intermittent) - needs root cause analysis
- Missing integration tests for MeowGateway ↔ MeowAgentClient

---

## LEARNINGS APPLIED

### From V3.2
✅ Local-first overrides = faster dev cycles  
✅ Auto-approval timeout = headless operation  
✅ DoneHooks wiring = automatic audit logging  

### From V3.3
✅ Token auth > certificate rotation for simple deployments  
✅ Host fallback > hard failure when Docker unavailable  
✅ OODA loop > simple trace logging for metacognition  

---

**Last Updated**: Epoch 37 - V3.3 Dogfood Complete
