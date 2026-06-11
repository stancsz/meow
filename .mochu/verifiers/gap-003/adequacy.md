# gap-003: W2 — Freeze and branch (adequacy audit)

## Lazy artifacts this suite blocks

1. **Branch only, files intact**: `git branch legacy-swarm` created but src/swarm/ and quantum files NOT actually deleted from main. Branch exists but nothing was cleaned up.

2. **Package.json touched, nothing deleted**: The four deps removed from package.json but the actual files still exist on disk (src/ unchanged). Code still imports broken deps.

3. **Heartbeat broken by deletions**: src/swarm/ or quantum deps removed but bin/meow.ts still imports from them — meow birth crashes after W2.

## How the suite blocks each

| Artifact | Blocker |
|---|---|
| Branch only | v003-2 checks src/swarm/ and quantum files are gone from main; v003-1 checks branch exists |
| Package.json only | v003-2 checks filesystem, not just package.json |
| Heartbeat broken | v003-4 runs `meow birth` after all deletions and must pass |

## Dimension

developer-experience (thinning is DX hygiene — it makes the repo navigable)

## Why this matters

W2 is the first real deletion. If it's done wrong, the repo is in a broken state
and W3+ cannot proceed. The three-pronged check (branch, files, heartbeat) ensures
the thinning is real, not cosmetic.