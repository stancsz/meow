# RELEASE.md — the finish line

Product-level criteria for "done":

- [ ] R1 Onboarding: `meow birth` + `meow -p` smoke test passes on clean host
- [p] R2 Heartbeat: heartbeat verifier suite (v0002+) passes — spawn, @file, exit contract (gap-001 SHIPPED iter-1; 7/7 green)
- [ ] R3 Legacy frozen: `git branch legacy-swarm` created, src/swarm/, quantum deps stripped
- [ ] R4 Legacy gutted: src/agent/, src/orchestrator/, src/kernel/, src/cli/ deleted
- [ ] R5 Perimeter trimmed: src/ empty, dist-runtime/, scratch/ gone, legacy skills pruned
- [ ] R6 Thinner thinner: heartbeat ≤500 LOC compiled to one binary, deps minimal
- [ ] R7 External target: 25-life streak achieved on external target repo
- [ ] R8 Baseline ratchet: baseline.json strictly monotone downward every ledger SHIPPED