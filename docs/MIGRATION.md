# MIGRATION — the thinning plan (every iteration thinner, the core unchanged)

> The repivot's direction in one rule: **meow only ever loses mass.** Each wave
> deletes legacy and tightens the skeleton; what never changes is the core
> contract below. Thinning is enforced as a ratchet, not an aspiration.

## 1. The core (invariant — this is what "stays the same" means)

The core is a **contract**, not bytes. These must exist, keep their meaning,
and keep their boundaries — everything else is candidate mass:

| Core element | Where | Invariant |
|---|---|---|
| Mission: exoskeleton, not agent | `docs/rfc/nine-lives.md` §0 | meow never reimplements what Claude Code does |
| The heartbeat owns the session boundary | `bin/meow.ts` | birth context → exit contract → rebirth; never judges; ≤500 LOC |
| One life = one role × one phase | `skills/meow/` | tri-role split; grader ≠ builder; verifier reads no narrative |
| Mechanics over prose | `scripts/` | governor is Python stdlib; Bun shells out, never reimplements; no model overrides a FAIL |
| State is files in git | `.meow/` | PROBLEM/campaign/goals/gaps/ledger/tasks/verdicts/premortems/INBOX/reviews/budget/cooldown |
| The ratchet | `.meow/verifiers/` | append-mostly; removals need INBOX ack; full corpus every ship |
| The brain | `.meow/brain.db` + generated `playbook.md` | single source of truth; distill-at-death is a gate |
| The leash | budget.py + reviews/ + INBOX | irreversibles never decided alone; budget beyond rationalization |

Guard: `v0001_scaffold_integrity.py` already protects existence; the thinning
ratchet (§3) protects the direction. Any wave that would break a row in this
table is not a thinning — it's a redesign, and needs an RFC amendment + INBOX ack.

## 2. The waves (each = one or a few lives, shipped through the normal gates)

Status legend: ✅ done · ⏳ next · ▢ later. Every wave ends with: corpus green,
ledger entry, brain distill, baseline.json updated (§3).

**W0 — Scaffold** ✅ (2026-06-11) Heartbeat, governor, skill, `.meow/`, brain,
docs reorganized to `legacy/`. Gate chain verified.

**W1 — Prove the heartbeat** ⏳ (gaps #1, #2) Host smoke test (`meow birth`,
`meow -p`), then the heartbeat verifier suite from the Do-Not-Repeat drawers,
then `v0002_one_life_e2e`. *Nothing is deleted before the new path is proven —
thinning without a proven replacement is amputation.*

**W2 — Freeze and branch** (gaps #3) `git branch legacy-swarm` → on main,
delete `src/swarm/`, `src/agent/quantum_*`, and drop `quantum-circuit`,
`blessed`, `blessed-contrib`, `ws` from package.json. Tests referencing deleted
modules move to `legacy-swarm`. Expected: −~2,500 LOC, −4 deps.

**W3 — Gut the agent substrate** Delete `src/agent/` (custom LLM client, edit
parsers, embeddings, memory, reasoning) after harvesting: placeholder-detection
heuristics → `audit_verifiers.py`; any unique prompt fragments → `skills/meow/`.
Delete `src/orchestrator/`, `src/kernel/`, `src/cli/` (TUI/REPL). Expected:
−~11,000 LOC. CLI surface in package.json shrinks to the compiled heartbeat.

**W4 — Trim the perimeter** Delete `src/extensions/`, `src/swarm` remnants,
`src/mcp`, `src/eval` (harvest missions.jsonl → verifier ideas first),
`.husky/` (gates replace hooks), legacy `skills/*` that no role references
(mano-p, game-vision, play-game, token-max… each gets a keep/kill ruling in one
strategist life). `dist-runtime/`, `scratch/`, stray root files (`-p`, `380`,
`meow.db*`). Expected: src/ is EMPTY and removed; repo is bin + skills +
scripts + .meow + docs.

**W5 — Thin the thinner** Re-audit what remains against the ≤500 LOC heartbeat
budget and the governor's "boring" bar; compile the binary; `package.json`
becomes Bun-only (no node deps). From here on, thinning happens organically via
the compounding bias (harness-simplifying gaps outrank equal object-level gaps).

## 3. The thinning ratchet (mechanical, like everything else)

A verifier makes "each iteration thinner" enforceable:

- `.meow/baseline.json` records `{ "non_core_loc": N, "deps": M }` — counted
  over everything outside the core whitelist (bin/, skills/meow/, scripts/,
  .meow/, docs/, .claude/).
- `v000X_thinning_ratchet.py` (author in W1): FAIL if current count **exceeds**
  the recorded baseline; on ship, the gate rewrites the baseline downward.
  Like the ambition ratchet, it only moves one way.
- Exception path: a genuinely new core capability that adds LOC requires a
  strategist INBOX entry + baseline adjustment ack — additions are deliberate,
  never drift.

## 4. Cleanup rules (apply to every wave)

1. **Branch before delete, once:** `legacy-swarm` is the single graveyard; no
   per-wave branches, no commented-out code, no `_old` files.
2. **Harvest before delete:** each deletion life lists what was extracted
   (→ scripts, skills, verifier ideas, brain drawers) in its ledger entry. An
   empty harvest list is fine; a skipped harvest check is not.
3. **Delete = ship:** every wave goes through the full exit contract — corpus
   green (proving the deletion broke nothing the ratchet protects), ledger,
   brain distill, baseline update.
4. **One wave in flight:** no interleaving. A blocked wave gets parked with a
   task file, and the loop works gaps instead.
5. **Docs follow code:** anything describing deleted machinery moves to
   `docs/legacy/` in the same life. STATUS.md and this file are updated together
   (the dual-bookkeeping lesson, applied to the cleanup itself).

## 5. Done-when

`src/` gone; deps ≤ a handful of Bun dev-tools; heartbeat ≤500 LOC compiled to
one binary; governor unchanged in shape since W0; baseline.json strictly
monotone downward across every ledger SHIPPED entry; and the 25-life streak
(PROBLEM.md) achieved on an external target — at which point this file's job is
over and it moves to `docs/legacy/` too.
