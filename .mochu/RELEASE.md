# RELEASE.md — the finish line

Product-level criteria for "done":

- [ ] R1 Onboarding: `meow birth` + `meow -p` smoke test passes on clean host
- [p] R2 Heartbeat: heartbeat verifier suite (v0002+) passes — spawn, @file, exit contract (gap-001 SHIPPED iter-1; 7/7 green)
- [p] R3 Legacy frozen: `git branch legacy-swarm` created, src/swarm/, quantum deps stripped (gap-003 SHIPPED iter-2; 11/11 green; 194 insertions, 1457 deletions)
- [ ] R4 Legacy gutted: src/agent/, src/orchestrator/, src/kernel/, src/cli/ deleted
- [ ] R5 Perimeter trimmed: src/ empty, dist-runtime/, scratch/ gone, legacy skills pruned
- [ ] R6 Thinner thinner: heartbeat <=500 LOC compiled to one binary, deps minimal
- [ ] R7 External target: 25-life streak achieved on external target repo
- [p] R8 Baseline ratchet: baseline.json strictly monotone downward every ledger SHIPPED (gap-006 SHIPPED iter-3; thinning enforced in ship_gate.py)
