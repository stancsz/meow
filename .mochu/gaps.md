# gaps.md — scored backlog

Format: id · dimension · description · evidence · impact 1-5 · effort 1-5 · confidence 1-5 · score = I*C/E

## Active

| id | dimension | description | evidence | impact | effort | confidence | score |
|----|-----------|-------------|----------|--------|--------|------------|-------|
| gap-001 | reliability-errors | Heartbeat verifier suite (spawn, stdin, @file, stub read-back, exit contract) | **SHIPPED** — 7/7 green, ship_gate PASS | — | — | — | — |
| gap-002 | features | v0002_one_life_e2e: end-to-end mocked life through schedule→birth→gate | **PASSING** — v0002_one_life_e2e.py green in corpus | 5 | 3 | 5 | 8.3 |
| gap-003 | developer-experience | Freeze legacy: branch legacy-swarm, strip quantum/swarm deps from package.json | **SHIPPED** — 11/11 green, ship_gate PASS; 194 insertions, 1457 deletions | — | — | — | — |
| gap-006 | performance | Thinning ratchet: baseline.json + ship_gate enforcement (MIGRATION.md §3) | **SHIPPED** — 15/15 green, ship_gate PASS; thinning check in ship_gate.py | — | — | — | — |
| gap-004 | onboarding-first-run | meow init command: scaffold .meow/ + PROBLEM.md interview for a target repo | No init command exists | 3 | 3 | 3 | 3.0 |
| gap-005 | features | Metric adapter stub: read a target's real-world metric into the ledger at SHIP | PROBLEM.md has metric defined but no adapter | 4 | 5 | 2 | 1.6 |

## Parked

(none)

## Discovered gaps (during build)

- **gap-007** · developer-experience · INBOX.md stub threshold: ship_gate.py checks for ≥3 non-empty lines in .md files. All state files must be ≥3 lines. | impact:2 | effort:1 | confidence:5 | score:10.0 | **SHIPPED** (iter-1 fix)
- **gap-008** · developer-experience · src/agent/*.ts still reference deleted quantum_* files; typecheck fails until W3. 9 TypeScript errors. | impact:3 | effort:2 | confidence:5 | score:7.5 | **W3 dependency**
