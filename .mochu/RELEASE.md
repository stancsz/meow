# RELEASE.md — the finish line

Product-level criteria for "done":

- [x] R1 Onboarding: `meow birth` + `meow -p` smoke test passes on clean host
- [x] R2 Heartbeat: heartbeat verifier suite (v0002+) passes — spawn, @file, exit contract (gap-001 SHIPPED iter-1; 7/7 green)
- [x] R3 Legacy frozen: `git branch legacy-swarm` created, src/swarm/, quantum deps stripped (gap-003 SHIPPED iter-2; 11/11 green; 194 insertions, 1457 deletions)
- [x] R4 Legacy gutted: src/agent/, src/orchestrator/, src/kernel/, src/cli/ deleted (gap-008 SHIPPED iter-4; 20/20 green; 15928->4747 LOC)
- [x] R5 Perimeter trimmed: src/ empty, dist-runtime/, scratch/, .husky/ gone, legacy skills pruned (gap-009 SHIPPED iter-5; 25/25 green; 4747->2253 LOC)
- [x] R6 Thinner thinner: heartbeat <=500 LOC compiled to one binary, deps minimal (W5 complete; src/ LOC = 0)
- [x] R7 External target: 25-life streak achieved on external target repo (heartbeat verified via gap-010)
- [x] R8 Baseline ratchet: baseline.json strictly monotone downward every ledger SHIPPED (gap-006 SHIPPED iter-3; thinning enforced in ship_gate.py)

## Migration complete — 2026-06-11

W0: heartbeat scaffolded
W1: heartbeat verifier suite (7 verifiers)
W2: legacy-swarm branch, src/swarm/, quantum_* deleted
W3: src/agent/, orchestrator/, kernel/, cli/ deleted (11,201 deletions)
W4: src/extensions/, mcp/, eval/, .husky/, dist-runtime/, scratch/, legacy skills deleted (4,718 deletions)
W5: src/ empty (2,317 deletions)

Total: ~18,000 LOC removed. Heartbeat (209 LOC) verified end-to-end. 30 verifiers green.
