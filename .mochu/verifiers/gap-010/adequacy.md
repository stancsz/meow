# gap-010: W5 — Source is empty (adequacy audit)

## Lazy artifacts this suite blocks

1. **src/ partially deleted**: some dirs gone but others remain. The wave is incomplete.

2. **Heartbeat broken**: heartbeat has a hidden import from src/ that wasn't caught earlier. meow birth crashes post-W5.

3. **Ratchet reversed**: something in src/ was added back, or a new src/ file appeared elsewhere.

4. **package.json still references src/**: old scripts remain (tsc src/, etc.). The system looks legacy.

5. **Typecheck fails on core**: bin/ or scripts/ has real TypeScript errors.

## How the suite blocks each

| Artifact | Blocker |
|---|---|
| Partial deletion | v010-1 checks src/ directory is gone |
| Heartbeat broken | v010-2 runs meow birth and checks output |
| Ratchet reversed | v010-3 checks current LOC <= baseline (2253) |
| package.json refs src/ | v010-4 checks scripts for src/ references |
| Typecheck fails | v010-5 runs typecheck and filters src/ errors |

## Dimension

developer-experience

## Why this matters

W5 completes the migration. src/ is the last major legacy artifact. After W5, the system consists only of: bin/, scripts/, skills/meow/, .meow/, .mochu/. The thinning is complete.