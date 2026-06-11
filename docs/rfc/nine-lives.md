# RFC: Nine Lives — meow as the Exoskeleton for Claude Code

**Date:** 2026-06-11 (amended same day: mission, Bun heartbeat core, harness+skill duality; second amendment: Yugong cognitive layer)
**Status:** Accepted (supersedes Wave 5 plan in STATUS.md)
**Decisions:** Rebuild thin — scrap the custom agent substrate, keep the ideas. Value target is layered: meow grinds external target repos toward income, and improves itself only when its own failures block target progress. Core stays **Bun** (the heartbeat); verification stays **Python** (the gates); judgment stays **markdown** (the skill). The cognitive protocol inside each life is **Yugong** (`docs/rfc/yugong-harness-design.md`) — Nine Lives is the body, Yugong is the mind.

## 0. Mission

meow is not another coding agent and never competes with Claude Code. meow is the **exoskeleton** that turns Claude Code from a brilliant stateless tool into a persistent agent. Claude Code already has the hands and the intelligence; what it lacks is everything *between* sessions: it wakes with no motive, no memory, no unfinished business, and it dies when the context ends. meow supplies exactly that missing layer — **motive** (PROBLEM.md), **brain** (second-brain), **independence** (the resurrection loop), **discipline** (mechanical gates) — and nothing Claude Code already does.

The name: a cat with nine lives. The architectural claim is that all of Claude Code's autonomy gaps live at one place — the session boundary — so meow's highest-leverage move is to **own that boundary**: control what is injected at birth, enforce a contract at death, and guarantee there is always a next life.

meow is therefore two artifacts in one repo:

- **meow-the-harness** (Bun binary) — the body. Guarantees the next session exists and arrives properly equipped. Never makes judgments.
- **meow-the-skill** (markdown, loaded by Claude Code) — the mind. The roles and iteration discipline executed *inside* the session, where the intelligence lives.

The brain is shared by both, called as a CLI.

---

## 1. Audit Verdict

meow-swarm got the **principles** right and the **substrate** wrong. The principles — definition-of-done before code, quality gates, evidence-based completion, checkpoint-everything, the MEOW-3-RULE separation between "do the task" and "fix the harness" — are exactly what an autonomous loop needs. But they were implemented by rebuilding a coding agent from scratch (17,372 LOC of TypeScript), which means meow spent nearly all of its development effort re-solving problems that `claude -p` / Claude Code already solve better, and almost none on the part that's actually novel: the orchestration loop that points the agent at the right work and refuses to accept unverified results.

The evidence is in this repo's own docs. `docs/FEEDBACK.md` records the two defining failures: (1) `fixMeow()` fighting Windows `spawn`/`exec` semantics for weeks just to invoke `claude -p`, and (2) the stub-write failure — a task "completes," reports success, and the file on disk contains one title line. Both are substrate failures, not orchestration failures. Meanwhile the loop itself (docs/loop.md) has been pointed at meow's own bug list for waves, an inward spiral that produces commits but no external value.

## 2. What Works (keep these ideas)

- **Definition-of-done before code.** Deriving acceptance criteria before touching anything (README §1) is the same insight as mochu's "verifiers first" — meow had it, but implemented it as prose criteria the same agent later self-grades, instead of executable verifiers a script grades.
- **Quality gates as a named pipeline.** Placeholder detection, lint/typecheck, coverage, coherence, human sign-off. The gate list is right; the enforcement (in-process TS, self-reviewed) is weak.
- **MEOW-3-RULE.** Task fails 3× → fix the harness, not the task. This is a sound generalization and survives the repivot as the self-improvement trigger.
- **Checkpoint/resume discipline.** Every task state persisted; any process can die and be resumed. Keep the property, not the SQLite+kernel implementation — files in git give the same property with `git log` as the audit trail.
- **Docs-as-coordination.** STATUS.md / loop-decisions.md / "the files are the conversation" was converging on the architect-builder protocol independently. Keep and formalize it.
- **Honest failure ledgers.** FEEDBACK.md, ANTI_PATTERNS.md, the write-verification rule in CLAUDE.md. This culture is the most valuable asset in the repo.
- **Fire-and-forget ergonomics.** `meow -p "task"` then check back later is the right UX. Keep the command shape.

## 3. What Doesn't Work (cut these)

- **The custom agent substrate.** `src/agent/agent.ts` implements its own LLM HTTP client, SEARCH/REPLACE + udiff edit parsers, reasoning-tag stripping, token budgeting, lint-fix loops (1,654 LOC in that file; 6,160 LOC across `src/agent/` with memory, embeddings, reasoning, discovery). Every line duplicates Claude Code, with fewer eyes and more bugs (the stub write IS this layer failing).
- **Speculative distributed-systems machinery.** `src/swarm/` Raft consensus, FedHub WebSocket federation, `quantum_reasoning.ts` with a real `quantum-circuit` dependency, `quantum_memory.ts`. There are zero deployments that need consensus. ~1,180 LOC in `src/swarm/` plus the quantum modules and their deps. Pure cost.
- **In-process orchestration state.** Orchestrator/TaskQueue/ParallelExecutor/FileCoordinator hold coordination in TS objects + SQLite. Opaque to humans, opaque to the next cold agent, and the cause of the dual-bookkeeping drift (STATUS vs ROADMAP) called out as a HIGH RISK failure mode in CLAUDE.md.
- **Self-graded verification.** The "Coherence" gate is an LLM reviewing its own diff; BUG-07 (Architect fallback validation always passes) shows what happens. A gate the worker can talk its way past is not a gate.
- **The navel-gazing loop.** docs/loop.md step 1 is "pick from meow's own STATUS.md." The loop has no problem definition outside itself, so "every piece of work pushes toward the right direction" is undefined. Waves 1–5 are all meow-improving-meow.
- **Windows-hostile UX surface.** blessed TUI, husky hooks that fail on MSYS2, spawn quirks. The TUI rewrite is still on the roadmap — cut it instead.

## 4. The Repivot — Design

### 4.1 One sentence

meow becomes a **thin exoskeleton for Claude Code**: a Bun heartbeat that resurrects `claude -p` sessions forever, each born with motive + memory + state and not allowed to die until a deterministic exit contract is met — markdown state + git, an append-only verifier corpus, and nothing ships without machine proof.

### 4.2 What each parent contributes

| Source | Idea adopted |
|---|---|
| **architect-builder-skills** | Role split with a hard information barrier: an architect role that plans/decides and never reads source; builder roles that implement and report. Coordination ONLY through files in `docs/` (tasks, reports, decisions). Either side cold-restartable — the files are the conversation. |
| **mochu** | The iteration shape: orient → scout → synthesize → specify → build → verify → ship, one gap per iteration. Verifiers authored before code. Append-only verifier corpus as a regression ratchet. Mechanical ship gate (tamper check, secrets scan, full corpus green). Dimension rotation for breadth. `loop.sh` outer harness for unattended runs. |
| **spec-driven-qa-skill** | LLM judgment and deterministic scripts strictly split: Claude writes the requirement graph and rubrics; scripts generate the classical test backbone (EP/BVA/decision tables/pairwise), execute, and score. Readiness decision (ship / ship-with-caveats / hold). Mandatory `limitations.md` — green-by-omission is the named enemy. Visual verification of rendered output. |
| **monkey-skills** | The value layer: an explicit problem/business definition file the loop reads before choosing work; every completed unit of work attributed back to the goal it serves; a learning ledger with a Do-Not-Repeat section; deterministic hooks that BLOCK bad tool calls rather than advising; human review gates on irreversible/external actions (sends, payments, deploys, pricing). |
| **second-brain** | The memory substrate: a local SQLite knowledge graph (`brain_cli.py`, stdlib-only) replacing both flat learning files and the legacy `AgenticMemory`/sqlite-vec/quantum_memory stack. Distilled know-how as titled, tagged, wikilinked drawers; FTS5 recall; typed relations (`contradicts` matters for learnings). One file, versioned in git. See §4.8. |
| **yugong-harness-design** | The cognitive protocol — four laws (motivation = a failing verifier; learning = state that changes future contexts; judgment = grader ≠ builder; reliability = mechanics, not prose), the eight-phase life-cycle with sixteen mental models bound as mandatory artifacts, the tri-role split (code-blind strategist / builder / fresh-context verifier), playbook promotion with a graveyard, the ambition ratchet, and schedule-as-data. Nine Lives is the body; Yugong is the mind. |

### 4.3 Problem definition (the missing piece, now mandatory)

A target repo is not eligible for the loop until it has `.meow/PROBLEM.md`:

```
# PROBLEM
Outcome: <the single measurable outcome, e.g. "$500 MRR from X" or "100 weekly installs">
Metric: <how it is measured, and the command/API that reads it>
Constraints: <what must never be done — spend caps, no external sends without review, ...>
Done-when: <the falsifiable stop/raise-the-bar condition>
Not-the-problem: <explicitly out of scope, the anti-drift list>
```

Every iteration's gap selection must cite which line of PROBLEM.md the work serves. Work that cannot be traced to the outcome is rejected at the synthesize step — this is the mechanical answer to "every piece of work pushes toward the right direction."

### 4.4 Architecture (three layers, all thin)

```
Layer 0 — THE HEARTBEAT (meow-the-harness, Bun binary)
  Owns the session boundary. One job, done perfectly: the resurrection loop.
    BIRTH:   assemble the waking context and spawn `claude -p`
               motive   ← PROBLEM.md + campaign.md (why am I alive)
               learning ← playbook.md, whole file   (what I've promoted to law)
               memory   ← brain recall vs gaps      (what do I know about this)
               state    ← ledger tail + WIP         (what was I doing)
               role     ← schedule.py verdict       (who am I this life)
    DEATH:   enforce the exit contract before the session may end:
               gates green · ledger appended · brain distilled · WIP serialized
    REBIRTH: budget/schedule check (MAX_ITERS, MAX_SECONDS, spend cap,
             pending human reviews) → spawn the next session. Forever.
  Never makes judgments. Knows nothing about content. The off-switch
  and the human-review halt live here — independence with a leash.

Layer 1 — THE MIND (meow-the-skill, markdown; one session = ONE ROLE doing ONE PHASE)
  Reads:  PROBLEM.md, campaign.md, playbook.md, ledger.md, gaps.md
  Roles (Yugong's tri-role, replacing architect/builder/qa):
    strategist (strongest tier; code-blind — reads .meow/ only;
                FRAME, SELECT, PREMORTEM, LEARN, RATCHET phases)
    builder    (implements against a task spec until verifiers pass;
                never edits verifiers or goals, never claims completion)
    verifier   (FRESH CONTEXT every time; sees the diff + criteria + corpus,
                NEVER the builder's narrative — sympathy is a contaminant.
                Only its verdict file flips a goal node green.)
  All coordination through files. No daemon-side state, no IPC.
  Which role+phase runs next is decided by schedule.py from state —
  the schedule is data, not vibes; the heartbeat just obeys it.

Layer 2 — THE GOVERNOR (Python stdlib; the model cannot vote here)
  run_corpus.py      all verifiers green or no ship
  ship_gate.py       verifier tamper check, corpus append-mostly, secrets scan,
                     write-verification; no model output overrides a FAIL
  select_gap.py      ranks gaps by campaign-verifier movement per unit effort
  audit_verifiers.py rejects weak/rubric-only suites (classical backbone required)
  schedule.py        reads state → emits next role+phase (the loop's brainstem)
  budget.py          $/day, lives/day, wallclock/life — survive-first, beyond
                     rationalization; exceeded → halt + INBOX entry
  compact.py         the forgetting function: ledger tail → archive, force
                     playbook promotion pass, regenerate playbook.md from brain
```

**Language split, by what each layer is worth:** Bun owns the product surface (the heartbeat, CLI, compiled `meow` binary via `bun build --compile` — distribution is the funnel if meow itself is ever the product). Python stdlib owns the trust surface (gates + brain — boring, auditable, shared runtime with mochu/spec-driven-qa/second-brain heritage). The contract between them: the Bun shell only *shells out* to the gate scripts and never reimplements their logic, so the gates stay independently runnable and a Bun regression can degrade UX but never weaken verification. Exactly one risky seam exists — Bun spawning `claude -p` on Windows — and it gets a dedicated verifier suite (§5 step 4).

State lives in `.meow/` inside the **target** repo (Yugong's `.yugong/` layout, meow-named):

```
.meow/
├── PROBLEM.md      the mountain (Yugong's NORTHSTAR): outcome, metric, constraints
├── campaign.md     current 1–3 month verifiable objective + 5-line systems map
├── goals.md        goal tree: campaign → milestones → tasks, each node carries a verifier id
├── ledger.md       rolling iteration log (tail lives here; compact.py archives the rest)
├── gaps.md         scored backlog
├── playbook.md     GENERATED from brain.db by compact.py — promoted rules injected
│                   into every birth prompt. Build artifact, never hand-edited:
│                   the brain is the single source of truth (no dual bookkeeping).
├── premortems/     one per task — inversion artifact, mandatory before build
├── verifiers/      append-mostly corpus + REGISTRY.md (the ratchet)
├── brain.db        second-brain graph: candidates, promoted, graveyard, decisions (§4.8)
├── INBOX.md        human channel: blockers, irreversible-decision escalations, ratchet acks
├── reviews/        pending human gates (external/irreversible actions halt here)
├── budget.md       survive-first limits the governor enforces
├── cooldown.md     recently shipped / ratcheted topics — do not re-litigate
└── archive/        compacted history
```

Git is the database; commits are the checkpoints; `git log .meow/` is the audit trail. This preserves meow's checkpoint/resume property with zero kernel code. The two files that matter more than all others, per Yugong: **playbook.md** (what the system has learned — read every life) and **verifiers/** (what it will not un-learn). The brain↔playbook split resolves Yugong's flat-file limitation: candidates, citations, and graveyard live as drawers/collections in `brain.db`; `compact.py` renders the promoted subset to `playbook.md` for cheap whole-file injection at birth.

### 4.5 The life-cycle — Yugong's eight phases (slow, careful, verifiable)

One life = one role doing one phase, then death. Full phase specs live in `yugong-harness-design.md` §4; the binding here is which mental models each phase is *forced* to produce as artifacts:

0. **ORIENT** *(mechanical)* — read state; dirty tree → recover; budget exceeded → exit; INBOX answers → integrate. **Recall:** playbook injected whole; brain queried against PROBLEM.md and open gaps.
1. **FRAME** *(strategist — First Principles, Problem Solving)* — problem statement with observed reality, a consensus assumption explicitly discarded, a verifier-shaped definition of solved, and a scope fence. No verifier-shaped "solved" = not a problem yet.
2. **SELECT** *(strategist — 80/20, Resource Allocation, Asymmetric Bets, Decision Making)* — ≥5 candidates, ordinal ranking by campaign-verifier movement per effort (no invented numbers), every 5th pick a capped-downside experiment, two-lane rule: reversible → act; irreversible → INBOX and pick other work. Mandatory `do-not-repeat` brain query before committing to an approach.
3. **PREMORTEM** *(strategist — Inversion, Second-Order, Risk Management)* — task invalid without `premortems/<id>.md`: ≥3 concrete failure/gaming modes each mapped to prevention or a detection verifier (including "how would a lazy builder fake this?"), and-then-what (≥2 downstream effects), blast radius survivable within budget.md. Survive first is a gate, not a mood.
4. **BUILD** *(builder — Throughput, Efficiency)* — spec names the current constraint; non-constraint work must justify itself. Red suite first (authored in PREMORTEM/SPEC, must fail before code). Hard wallclock cap; finish early = exit early; out-of-spec "improvements" go to candidates, never the diff. 10 attempts with approach rotation.
5. **VERIFY** *(verifier, fresh context)* — receives the diff + criteria + corpus, **never the builder's report**. New verifiers, ENTIRE corpus, native build/lint/test — all green or FAIL with named evidence. Write-verification: every written file read back; stub = failure. Only the verdict file flips a goal node.
6. **SHIP** *(mechanical)* — `ship_gate.py` (tamper check, append-mostly corpus, secrets, no model override) → commit → ledger + metric snapshot. External/irreversible actions write `reviews/pending-*.md` and halt.
7. **LEARN** *(strategist — Systems Thinking, Resilience, Innovation, Scaling)* — the antifragility rule: every FAIL/PARKED must mint a candidate learning AND a verifier-or-playbook-rule making that failure class detectable. Candidates promote to playbook only on two cited observations or a proving verifier; falsified rules demote to the graveyard collection. Systems map + 10x note updated. Every 10th LEARN: forced recombination proposal → asymmetric-bet slot. Distillation is a gate: a life without a brain write does not ship.
8. **RATCHET** *(strategist — Longevity)* — 3 clean ships or campaign ≥80% green → must 10x a target, open the next milestone, or propose a new mountain via INBOX. Harness-improving work gets a one-rank SELECT bump (compounding bias). Ratchets only fire upward; ratcheted targets enter cooldown.

### 4.6 The layered value loop

The loop normally runs against target repos. MEOW-3-RULE generalizes to the meta-trigger:

```
iteration on TARGET fails ×3 for the same harness reason
  → file a harness gap in meow's own .meow/gaps.md (with the failing evidence)
  → meow's own loop (same skill, pointed at meow) fixes it, verifier-first
  → resume the TARGET iteration
```

meow never self-improves speculatively. Self-work is admitted only with a target-repo failure as evidence — that's the structural fix for the Wave 1–5 inward spiral. Income attribution flows the other way: when a target repo's metric moves, the ledger records which iterations (and thus which harness capabilities) earned it, monkey-style.

### 4.7 What `meow -p` becomes — the heartbeat CLI (Bun)

Keep the command shape, shrink the implementation to the resurrection loop:

```
meow init <repo>          scaffold .meow/ + interview → PROBLEM.md
meow -p "<task>"          one life: birth → iteration → exit contract → death
meow live [--lives N]     the loop: rebirth until budget/review halt ("meow loop" alias)
meow status               read .meow/ledger.md + gaps.md + brain summary
meow review               list/approve pending human gates (the leash)
meow sleep "<cron>"       schedule the heartbeat (host cron / Task Scheduler)
```

Responsibilities, exhaustively: parse args, assemble the birth prompt (PROBLEM.md + brain recall + ledger/WIP), spawn `claude -p` (exec-style, @file prompt — the FEEDBACK.md lessons as code), run the exit-contract gates, decide rebirth. Nothing else. Implementation budget: ≤ ~500 LOC of Bun/TypeScript + the Python gate scripts. Ships as a compiled single binary (`bun build --compile`). No blessed TUI (`meow status` is text; the TUI rewrite stays cancelled).

### 4.8 The brain — self-learning layer (second-brain)

The legacy stack tried to give meow memory three times — `AgenticMemory` + sqlite-vec embeddings, `quantum_memory.ts`, and flat learning docs — all in-process, none surviving the repivot. The replacement is [second-brain](https://github.com/stancsz/second-brain): a stdlib-only Python CLI over one SQLite file. Installed at `.claude/skills/second-brain/`; invoked as `python3 .claude/skills/second-brain/scripts/brain_cli.py --db <brain>`.

**Two brains, mirroring the two-layer value loop (§4.6):**

- **Target brain** — `.meow/brain.db` in each target repo. Holds product/domain know-how: what users wanted, which approaches shipped, which experiments failed, decisions wikilinked to PROBLEM.md outcomes. Versioned with the target repo; travels with it.
- **Harness brain** — `.meow/brain.db` in the meow repo itself. Holds cross-target, harness-level know-how: substrate quirks, claude -p invocation lessons, verifier-authoring patterns, Do-Not-Repeat entries. This is what makes iteration N+1 on a *new* target cheaper than iteration 1 was — growth, not just memory.

**Wiring into the loop** (all explicit CLI calls by the orchestrator — deterministic, not hook-dependent):

- Orient/Scout: `search` both brains against PROBLEM.md and the candidate gaps; inject hits.
- Synthesize: mandatory query of the `do-not-repeat` collection before approach selection.
- Learn: mandatory distill — outcome, evidence, failures — as titled drawers; `contradicts` relations used when new evidence overturns an old learning (the graph keeps both; the loop trusts the newer, linked drawer).
- MEOW-3-RULE escalations write the failing evidence to the **harness** brain before filing the harness gap, so the same wall is never hit twice silently.

The brain is queryable by humans too (`summary`, `traverse`, Obsidian export) — it doubles as the project's institutional memory. Promotion rule: a learning that proves out in ≥2 target repos gets copied from the target brain to the harness brain. Optional for interactive sessions: run `install.sh` on the host to wire second-brain's auto-capture/recall hooks into Claude Code; the loop itself never relies on hooks.

Bootstrap status: **installed and seeded** (2026-06-11). meow's harness brain holds the repivot and Nine Lives decisions, MEOW-3-RULE, and three Do-Not-Repeat entries distilled from FEEDBACK.md (custom substrate, Windows spawn, trusting reported writes).

## 5. Migration

1. **Freeze** `src/` — branch `legacy-swarm`, no further investment. Delete `quantum-circuit`, swarm, FedHub from main immediately; nothing references a deployment that needs them.
2. **Harvest** into the new gate scripts: placeholder-detection logic, write-verification rule, the gate list, evals/missions.jsonl as seed verifier ideas.
3. **Scaffold** the new shape: `skills/` (architect, builder, qa — adapted from architect-builder + spec-driven-qa), `scripts/` (gates, adapted from mochu), `bin/meow` heartbeat (Bun). ✅ Brain installed: `.claude/skills/second-brain/` + seeded `.meow/brain.db` (2026-06-11).
4. **Heartbeat verifier suite first (the first dogfood target).** Before the Bun heartbeat is trusted, the qa role derives its red suite from the harness brain's Do-Not-Repeat drawers: spawn-under-cmd.exe, stdin closing, @file prompts, output captured under load, stub-write read-back, exit-contract enforcement. The FEEDBACK.md lessons stop being prose and become the heartbeat's regression corpus; the builder implements until green. meow's first real iteration produces its own front door.
5. **Dogfood bootstrap:** meow's own `.meow/PROBLEM.md` v1 = "run 25 consecutive lives against one external target repo with zero harness-failure aborts." That makes meow's first target… a real target, and makes harness quality measurable instead of aspirational.
6. **First income target:** pick one external repo with a plausible revenue metric and run the loop there from day one. The loop must never run > 1 week without an external target, by rule.
7. Update STATUS.md (Wave 5 cancelled, Nine Lives is the plan) and ROADMAP.md per the dual-bookkeeping rule.

## 6. Risks

- **Verifier gaming** — the builder optimizing for green over good. Mitigations: qa and builder are separate invocations with separate context; `audit_verifiers.py` adequacy linting; ship gate tamper check on the verifier corpus.
- **Metric latency** — income moves slowly; iterations need proxy metrics (installs, signups, audit-passes) declared in PROBLEM.md so the loop isn't flying blind between revenue events.
- **Loss of parallelism** — the old ParallelExecutor is gone; v1 is deliberately serial (one gap per iteration). Parallelism returns later, if ever, as multiple independent loop instances on disjoint targets — not as in-process worker pools.
- **`claude -p` dependency** — the substrate is now an external product. That is the point: its failures are Anthropic's roadmap, not yours. The FEEDBACK.md spawn lessons (exec over spawn, @file prompts, CI env) move into the heartbeat as tested code.
- **Bun on the spawn seam** — Bun's Windows subprocess layer is younger than Node's (still landing teardown/fd-leak fixes in 2026). Contained by design: Bun touches exactly one risky operation (spawning `claude -p`), that seam has a dedicated verifier suite (§5 step 4), and the Python gates remain runnable without the Bun shell — a Bun regression can stall a life, never fake a green one.
- **Runaway independence** — a loop that always wakes up needs a leash: spend caps and MAX_LIVES enforced in the heartbeat (not the prompt), human-review halts on anything external/irreversible, and `meow review` as the single approval surface. Independence is a mechanical property here, and so is the off-switch.
- **Playbook rot** — false learnings compounding into every birth prompt. Mitigations inherited from Yugong: two-observation promotion bar with ledger citations, falsified rules demoted to the graveyard (negative knowledge is knowledge), and playbook.md regenerated from the brain by `compact.py` rather than hand-edited — the learned brain stays small, true, and falsifiable.
- **Ambition collapse / mania** — the loop converging on safe trivial tasks, or 10x-ing into spend. Mitigations: the ratchet trigger is mechanical (not a mood), the asymmetric-bet slot is mandatory, cooldown blocks downward re-litigation, and any ratchet touching money or external exposure requires INBOX ack with `budget.py` as the hard floor.
