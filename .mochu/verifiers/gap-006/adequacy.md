# gap-006: Thinning ratchet (adequacy audit)

## Gap

Thinning ratchet: baseline.json + v000X_thinning_ratchet.py per docs/MIGRATION.md §3

## Dimension

performance (the ratchet is a performance meta-tool — it measures and enforces thinning speed)

## Lazy artifacts this suite blocks

1. **Presence without enforcement**: baseline.json exists and is updated manually, but ship_gate.py doesn't check it. Someone could ship and not update the baseline, or update it backward.

2. **Baseline updated but LOC grows**: baseline.json is updated with a lower number, but src/ actually grew (e.g., accidentally added files). The baseline is a lie.

3. **Hardcoded threshold**: The LOC check uses a hardcoded number instead of reading from baseline.json. When baseline.json is updated, the check doesn't.

## How the suite blocks each

| Artifact | Blocker |
|---|---|
| Presence without enforcement | v006-4 checks ship_gate.py for thinning signals |
| LOC grows but baseline updated backward | v006-2 checks current baseline < W0 baseline; v006-3 checks src/ LOC ≤ baseline non_core_loc |
| Hardcoded threshold | v006-1 and v006-2 both read baseline.json as the source of truth |

## Why this matters

The thinning ratchet is what makes the migration irreversible. Without it, someone could ship a wave that actually increases src/ LOC and claim success. The ratchet makes regression impossible.