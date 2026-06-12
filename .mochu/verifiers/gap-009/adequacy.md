# gap-009: W4 — Trim the perimeter (adequacy audit)

## Lazy artifacts this suite blocks

1. **Partial trim**: some perimeter dirs deleted but others remain. The wave isn't complete.

2. **Heartbeat broken**: something in src/ that meow.ts imports was deleted. meow birth crashes.

3. **LOC grows**: deleted some dirs but added files elsewhere. Ratchet reverses.

4. **src/ not empty enough**: too many dirs remain in src/. W4 is supposed to get src/ close to empty.

## How the suite blocks each

| Artifact | Blocker |
|---|---|
| Partial trim | v009-1 checks extensions/, mcp/, eval/; v009-2 checks .husky/, dist-runtime/, scratch/ |
| Heartbeat broken | v009-3 runs meow birth |
| LOC grows | v009-4 checks thinning ratchet |
| src/ not empty | v009-5 checks src/ contains only core dirs |

## Dimension

developer-experience