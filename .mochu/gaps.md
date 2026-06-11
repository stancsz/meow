# gaps.md — scored backlog

Format: id · dimension · description · evidence · impact 1-5 · effort 1-5 · confidence 1-5 · score = I*C/E

## Derived from .meow/gaps.md

| id | dimension | description | evidence | impact | effort | confidence | score |
|----|-----------|-------------|----------|--------|--------|------------|-------|
| gap-001 | reliability-errors | Heartbeat verifier suite (spawn, stdin, @file, stub read-back, exit contract) | v0001_scaffold_integrity passes; no heartbeat verifiers yet | 5 | 3 | 5 | 8.3 |
| gap-002 | features | v0002_one_life_e2e: end-to-end mocked life through schedule→birth→gate | Schedule and birth are scaffolded, not yet tested E2E | 5 | 3 | 4 | 6.7 |
| gap-003 | developer-experience | Freeze legacy: branch legacy-swarm, strip quantum/swarm deps from package.json | W1 of MIGRATION.md; src/ still has legacy deps | 4 | 1 | 5 | 20.0 |
| gap-004 | onboarding-first-run | meow init command: scaffold .meow/ + PROBLEM.md interview for a target repo | No init command exists | 3 | 3 | 3 | 3.0 |
| gap-005 | features | Metric adapter stub: read a target's real-world metric into the ledger at SHIP | PROBLEM.md has metric defined but no adapter | 4 | 5 | 2 | 1.6 |
| gap-006 | performance | Thinning ratchet: baseline.json + v000X_thinning_ratchet.py per docs/MIGRATION.md §3 | baseline.json exists (22911 LOC), no thinning verifier yet | 3 | 1 | 4 | 12.0 |

## Parked

(none)

## Discovered gaps (during build)

(none yet)