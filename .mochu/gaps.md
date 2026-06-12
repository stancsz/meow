# gaps.md — scored backlog

Format: id · dimension · description · evidence · impact 1-5 · effort 1-5 · confidence 1-5 · score = I*C/E

## Shipped

| id | dimension | description | evidence |
|---|---|---|---|
| gap-001 | reliability-errors | Heartbeat verifier suite (spawn, stdin, @file, stub read-back, exit contract) | **SHIPPED** — 7/7 green, ship_gate PASS |
| gap-003 | developer-experience | Freeze legacy: branch legacy-swarm, strip quantum/swarm deps | **SHIPPED** — 11/11 green, ship_gate PASS |
| gap-006 | performance | Thinning ratchet: baseline.json + ship_gate enforcement | **SHIPPED** — 15/15 green, ship_gate PASS |
| gap-008 | developer-experience | W3: src/agent/, orchestrator/, kernel/, cli/ deleted | **SHIPPED** — 20/20 green, ship_gate PASS; 11,201 deletions |
| gap-009 | developer-experience | W4: perimeter trimmed (.husky, dist-runtime, scratch, legacy skills) | **SHIPPED** — 25/25 green, ship_gate PASS; 4,718 deletions |
| gap-010 | developer-experience | W5: src/ empty | **SHIPPED** — 30/30 green (2 skipped), ship_gate PASS; 2,317 deletions |

## Active

(none — migration complete)

## Parked

(none)

## Discovered gaps (during build)

- **gap-007** · developer-experience · INBOX.md stub threshold: ship_gate.py checks ≥3 non-empty lines | **SHIPPED** (iter-1)
- **gap-008** · developer-experience · src/agent/*.ts import errors (9 TS errors) | **SHIPPED** (iter-4, W3)
- **gap-011** · performance · run_corpus.py SKIP handling: exit 2 treated as FAIL instead of SKIP | **SHIPPED** (iter-6, W5)

## Next (post-migration)

| id | dimension | description | impact | effort | confidence | score |
|---|---|---|---|---|---|---|---|
| gap-012 | features | meow init: scaffold .meow/ + PROBLEM.md interview for a target repo | 4 | 4 | 3 | 3.0 |
| gap-013 | features | meow status: TUI showing active life, budget, gaps | 4 | 4 | 3 | 3.0 |
| gap-014 | onboarding-first-run | docs: migrate legacy docs/ to skills/meow/docs/ | 3 | 3 | 4 | 4.0 |
