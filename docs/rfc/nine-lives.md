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

The evidence is in this repo's own docs. `docs/legacy/FEEDBACK.md` records the two defining failures: (1) `fixMeow()` fighting Windows `spawn`/`exec` semantics for weeks just to invoke `claude -p`, and (2) the stub-write failure — a task "completes," reports success, and the file on disk contains one title line. Both are substrate failures, not orchestration failures. Meanwhile the loop itself (docs/legacy/loop.md) has been pointed at meow's own bug list for waves, an inward spiral that produces commits but no external value.

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
- **The navel-gazing loop.** docs/legacy/loop.md step 1 is "pick from meow's own STATUS.md." The loop has no problem definition outside itself, so "every piece of work pushes toward the right direction" is undefined. Waves 1–5 are all meow-improving-meow.
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

State lives in `.meow/` inside 