# gap-008: W3 — Gut the agent substrate (adequacy audit)

## Lazy artifacts this suite blocks

1. **Partial deletion**: src/agent/ deleted but src/orchestrator/ or src/kernel/ or src/cli/ remain. Someone stopped mid-wave.

2. **Heartbeat broken**: src/agent/ deleted but bin/meow.ts still imports something from src/. meow birth crashes.

3. **LOC grows**: Deleted agent/orchestrator/kernel/cli but added new files elsewhere, causing src/ LOC to exceed baseline (15,928). Ratchet reverses.

4. **Non-src/ code broken**: tsc --noEmit fails on bin/, scripts/, or skills/ — core code is broken, not just legacy src/.

## How the suite blocks each

| Artifact | Blocker |
|---|---|
| Partial deletion | v008-2 checks all 3 dirs (orchestrator, kernel, cli) |
| Heartbeat broken | v008-3 runs `meow birth` and checks output |
| LOC grows | v008-4 checks current LOC <= baseline (15,928) |
| Non-src/ broken | v008-5 runs typecheck and filters src/ errors |

## Dimension

developer-experience (thinning is DX hygiene)

## Why this matters

W3 removes ~11,000 LOC. It's the largest single deletion. If the heartbeat breaks,
the loop can't continue. If LOC grows, the ratchet fails. If non-src/ code breaks,
the migration corrupts the core.