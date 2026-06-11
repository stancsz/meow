# HANDOFF — read this first, then STATUS.md

> For any agent or human picking up meow cold. Written 2026-06-11, the day of
> the Nine Lives repivot. The files are the conversation; this is its opening.

## What meow is now

meow is the **exoskeleton for Claude Code** — not a coding agent. A Bun
heartbeat (`bin/meow.ts`) owns the session boundary: it births `claude -p`
sessions with motive + memory + state, enforces an exit contract at death, and
guarantees rebirth. Judgment lives in markdown (`skills/meow/`), enforcement in
Python (`scripts/`), state in files (`.meow/`), learned knowledge in
`.meow/brain.db` (second-brain).

Canonical design docs — the only two that are alive:

1. `docs/rfc/nine-lives.md` — the body: mission, heartbeat, gates, brain, migration.
2. `docs/rfc/yugong-harness-design.md` — the mind: four laws, eight phases,
   sixteen mental models bound as mechanics, tri-role split.

Everything else in `docs/.refs/` is historical. Do not resurrect ideas from
`.refs/` without a verifier-backed reason. `src/` is the FROZEN legacy swarm —
never extend it; it only shrinks (see `docs/MIGRATION.md`).

## How to run it

```bash
bun bin/meow.ts status        # problem, ledger tail, budget, next role:phase
bun bin/meow.ts birth         # debug: print the assembled birth prompt, spawn nothing
bun bin/meow.ts -p "<task>"   # one life
bun bin/meow.ts live          # the loop (default 9 lives, budget-capped)
bun bin/meow.ts review        # pending human gates
```

The governor runs standalone too (Python 3.10+, stdlib only):

```bash
python3 scripts/schedule.py        # who runs next (role:phase)
python3 scripts/run_corpus.py      # the ratchet — all verifiers
python3 scripts/ship_gate.py       # the full exit contract
python3 scripts/compact.py         # regenerate playbook.md from the brain
```

## The rules that outrank everything (memorize these five)

1. **One life = one role doing one phase.** Then die well: ledger entry, brain
   distill, WIP serialized to `.meow/tasks/`, gates green.
2. **Grader ≠ builder.** The verifier role never reads the builder's narrative.
   Only a verdict file flips a goal node.
3. **Mechanics over prose.** `ship_gate.py` FAIL is final. Route around it with
   better work, never by editing gates or verifiers (verifier edits require a
   strategist-authored verifier task, `MEOW_VERIFIER_TASK=1`).
4. **Two-lane rule.** Reversible → act. Irreversible (spend, send, deploy,
   publish, auth) → `.meow/reviews/pending-*.md`, halt, pick other work.
5. **Read back every file you write.** A title-only stub is a failed write —
   confirmed failure mode, now also caught by the gate.

## State of the world (2026-06-11)

Done: repivot RFC accepted; Yugong merged; second-brain installed
(`.claude/skills/second-brain/`) and seeded (6 drawers incl. 3 Do-Not-Repeat);
scaffold complete and gate chain verified green (corpus 1/1, SHIP); legacy docs
in `docs/.refs/`; meow's own PROBLEM.md set (25-life streak on an external target).

Not done: no real life has run end-to-end yet (`bun` was unavailable in the
authoring sandbox — first `meow birth` + `meow -p` smoke test happens on the
host); legacy `src/` not yet branched to `legacy-swarm`; heartbeat verifier
suite (gaps #1) unwritten. Next work = top of `.meow/gaps.md`.

## Gotchas (paid for, don't re-buy)

- **Windows spawn:** `spawn(shell:true)` for `claude -p` races stdout on
  cmd.exe. Use exec-style with `@file` prompts, stdin ignored. Source:
  `docs/FEEDBACK.md`, brain drawer "Do-Not-Repeat: spawn(shell:true)…".
- **Brain FTS:** hyphens are NOT operators in FTS5 — quote searches:
  `search '"do-not-repeat"'`.
- **Brain on weird mounts:** WAL mode can fail read-only opens; `compact.py`
  already falls back to a temp copy. Don't "fix" this by disabling WAL.
- **playbook.md is generated.** Never hand-edit; promote drawers in the brain,
  then run `compact.py`. One home per fact — dual bookkeeping killed the old meow.
- **Trust order when docs contradict:** `.meow/` state > nine-lives.md >
  yugong-harness-design.md > STATUS.md > everything else.

## Who decides what

Human (Stan): INBOX answers, review approvals, ratchets touching money/exposure.
Strategist: everything else with judgment. Governor scripts: everything that
must hold. The heartbeat: nothing — it only keeps the cat alive.
