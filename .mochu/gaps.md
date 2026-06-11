# gaps.md — scored backlog

Format: id · dimension · description · evidence · impact 1-5 · effort 1-5 · confidence 1-5 · score = I*C/E

## Active

| id | dimension | description | evidence | impact | effort | confidence | score |
|----|-----------|-------------|----------|--------|--------|------------|-------|
| gap-001 | reliability-errors | Heartbeat verifier suite (spawn, stdin, @file, stub read-back, exit contract) | **SHIPPED** — 7/7 green, ship_gate PASS | — | — | — | — |
| gap-002 | features | v0002_one_life_e2e: end-to-end mocked life through schedule→birth→gate | **PASSING** — v0002_one_life_e2e.py green in corpus | 5 | 3 | 5 | 8.3 |
| gap-003 | developer-experience | Freeze legacy: branch legacy-swarm, strip quantum/swarm deps from package.json | **SHIPPED** — 11/11 green, ship_gate PASS; 194 insertions, 1457 deletions | — | — | — | — |
| gap-004 | onboarding-first-run | meow init command: scaffold .meow/ + PROBLEM.md interview for a target repo | No init command exists | 3 | 3 | 3 | 3.0 |
| gap-005 | features | Metric adapter stub: read a target's real-world metric into the ledger at SHIP | PROBLEM.md has metric defined but no adapter | 4 | 5 | 2 | 1.6 |
| gap-006 | performance | Thinning ratchet: baseline.json + v000X_thinning_ratchet.py per docs/MIGRATION.md §3 | baseline.json exists (22911 LOC), no thinning verifier yet | 3 | 1 | 4 | 12.0 |

## Parked

(none)

## Discovered gaps (during build)

- **gap-007** · developer-experience · INBOX.md stub threshold: ship_gate.py checks for ≥3 non-empty lines in .md files; any .md file with <3 lines is flagged. All state files must be ≥3 lines. (evidence: INBOX.md had 2 lines, flagged by ship_gate during iter-1) | impact:2 | effort:1 | confidence:5 | score:10.0
- **gap-008** · developer-experience · src/agent/*.ts still reference deleted quantum_* files; typecheck fails until W3. These files need to be deleted in W3 or the imports removed. (evidence: 9 TypeScript errors after W2 deletions) | impact:3 | effort:2 | confidence:5 | score:7.5