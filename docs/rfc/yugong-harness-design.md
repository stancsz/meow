# Yugong (愚公) — a goal-seeking, self-learning harness for Claude Code

> 愚公移山 — the old man who decided to move two mountains. Everyone laughed. He kept digging, and the digging compounded. Mochu (磨杵) grinds a pestle into a needle: refinement of a thing that exists. Yugong moves mountains: pursuit of goals that don't fit in one lifetime — or one context window.

**Sibling positioning:** mochu is the product-team instantiation of this architecture (one repo, gap-closing). Yugong is the general engine above it: it sets ambitious goals, decomposes them, learns from every attempt, and raises its own bar. Mochu can run *as a Yugong campaign*. Architect/builder is the role protocol both use. Tessera authors the verifiers. Secondbrain is an optional memory backend.

---

## 1. First principles (the physics, not the consensus)

A model at inference time is a pure function: context in, tokens out. Therefore every property you want — ambition, persistence, learning, taste — must be a property of **what enters the context** and **what the loop does between invocations**. There is nothing else. From this, four laws the whole design follows:

1. **Motivation = a verifier that currently fails.** "Wanting X" is implemented as a red check for X plus a loop that won't stop while it's red. An *ambitious* goal is simply a verifier that is honest, valuable, and currently far from green.
2. **Learning = state that changes future contexts.** The model's weights never change. The only learning available is: write something down, and guarantee it's read next time. Learning quality is therefore a *retrieval and compaction* problem, not an intelligence problem.
3. **Judgment = whoever grades must not be whoever built.** Self-assessment in the same context inherits every bias that produced the work. Separation of build and verify is structural, not optional.
4. **Reliability = mechanics, not prose.** Any rule that MUST hold goes in a script that exits nonzero. Any rule expressed only as prompt prose will eventually be rationalized away by a model under pressure. (Mochu's `ship_gate.py` proved this; Yugong generalizes it.)

Everything below is implementation detail of these four laws.

---

## 2. System overview

```
                    ┌─────────────────────────────────────────────┐
                    │  GOVERNOR  (scripts — mechanical, no model)  │
                    │  gate.py · corpus.py · budget · lock · scan  │
                    └──────────────────┬──────────────────────────┘
                                       │ enforces
  ┌──────────────┐   campaign &   ┌────┴─────┐   task spec   ┌──────────┐
  │  STRATEGIST  │───goal tree───▶│  .yugong/ │◀───reports───│  BUILDER  │
  │ (Opus/Fable) │◀──evidence────│   state   │───tasks─────▶│ (Sonnet)  │
  └──────────────┘                └────┬─────┘                └────┬─────┘
        ▲  ambition ratchet            │ verdicts                  │ diffs
        │  learning promotion     ┌────┴─────┐                     │
        └─────────────────────────│ VERIFIER │◀────────────────────┘
                                  │ (clean   │  runs corpus, scores
                                  │  context)│  evidence, no memory
                                  └──────────┘
            outer loop: while true → one role-invocation per process
```

Three model roles, one mechanical governor, one state directory. Each invocation is **one role doing one phase**, then exit. The loop script decides which role runs next by reading state — the schedule is data, not vibes.

### Roles

| Role | Tier | May read | May write | Never |
|---|---|---|---|---|
| **Strategist** | Strongest (Opus/Fable) | `.yugong/` only — code-blind, per the architect skill | goals, campaign, rulings, playbook promotions, ambition ratchet | reads source, writes code, runs verifiers on its own work |
| **Builder** | Sonnet-class | task spec, playbook, code | code, task report, candidate learnings | edits verifiers, edits goals, claims completion |
| **Verifier** | Mid-tier, **fresh context every time** | the diff, the verifier corpus, the task's success criteria — *not* the builder's narrative | verdict file, evidence log | sees the builder's excuses; a verifier that reads "I struggled with X but it's probably fine" is pre-poisoned |

The Verifier reading the work but not the story is the single most important separation in the design. Sympathy is a context contaminant.

---

## 3. State: the `.yugong/` directory (memory is the product)

```
.yugong/
├── NORTHSTAR.md       # The mountain. 1–3 long-horizon outcomes, each with a measurable proxy.
├── campaign.md        # Current campaign: the 1–3 month verifiable objective derived from NORTHSTAR
├── goals.md           # Goal tree: campaign → milestones → tasks, each node carries its verifier id
├── ledger.md          # Rolling iteration log (last ~30 entries live; older → archive/)
├── learnings/
│   ├── candidates.md  # Raw observations from builders ("X failed because Y") — cheap to write
│   ├── playbook.md    # PROMOTED rules — injected into EVERY iteration prompt. The learned brain.
│   └── graveyard.md   # Demoted/falsified rules, with why. Negative knowledge is knowledge.
├── premortems/        # One per task: the inversion artifact (see Phase 3)
├── verifiers/         # Append-mostly corpus + REGISTRY.md (mochu's ratchet, inherited verbatim)
├── INBOX.md           # Human channel: blockers, irreversible-decision escalations, ratchet approvals
├── budget.md          # Survive-first limits: $/day, iterations/day, blast-radius rules
├── cooldown.md        # Recently shipped / recently re-litigated topics — do not touch
└── archive/           # Compacted history (full ledgers, closed campaigns, old premortems)
```

Two files matter more than all others: **`playbook.md`** (what the system has learned — read every single iteration) and **`verifiers/`** (what the system will not un-learn — the ratchet). Everything else is plumbing for those two.

---

## 4. The loop — eight phases, mental models bound as mechanics

Each mental model is bound to a **specific phase** as a **mandatory artifact**: a section the role must produce, or a script that must pass. A model that exists only as advice does not exist. The full binding table is in §5; this is the flow.

### Phase 0 — ORIENT *(Builder or Strategist, mechanical)*
Read ledger tail, goals.md, playbook.md, INBOX, cooldown, budget. Dirty git tree → recover first. Fresh LOCK → exit. Budget exceeded → exit `BUDGET`. If INBOX has human answers, integrate and clear. Decide which phase/role this invocation is, per the schedule rules (§7).

### Phase 1 — FRAME *(Strategist)* — *Problem Solving · First Principles*
Runs when a campaign starts or a milestone opens. Output is a **problem statement file** with four required sections, in this order: **(a) Observed reality** — only things measured or directly seen, no inference; **(b) First-principles restatement** — the problem in terms of physical/economic constraints, explicitly stripping any "best practice" or consensus framing (the section must name at least one consensus assumption it discards); **(c) Definition of solved** — a verifier description, not prose; **(d) What we are NOT solving** — scope fence. A problem that can't fill section (c) is not yet a problem; it's a feeling, and it goes back to the Strategist.

### Phase 2 — SELECT *(Strategist)* — *80/20 · Resource Allocation · Asymmetric Bets · Decision Making*
Choosing work is where most of the outcome is determined, so this phase is the most constrained:

- **Candidate quorum:** list ≥5 candidate tasks from goals.md + new observations. Fewer than 5 means scouting was skipped — go scout.
- **80/20 ranking:** rank ordinally by *expected movement of the campaign verifier per unit effort*. **Ordinal with stated reasons, never invented numbers** — a fabricated `Impact=8, Effort=3` is pseudo-quantified vibes. Where impact is genuinely unknown, the task becomes "run the cheapest probe that measures it" (a measurement task is a first-class task).
- **Asymmetric-bet slot:** every 5th selection MUST be a capped-downside experiment — bounded to one iteration's budget, killed without ceremony if red, but with uncapped upside if green (new technique, new market probe, weird recombination from Phase 6). This slot is how the harness finds new hills instead of climbing one forever.
- **Two-lane decision rule (speed × reversibility):** classify the chosen task. *Reversible* (a revert commit undoes it) → proceed immediately, no deliberation budget beyond the premortem. *Irreversible* (deletes data, spends real money, sends external comms, publishes, changes auth) → write the decision to INBOX and select a different task. The agent never makes one-way-door decisions alone. This single rule is most of "risk management" in practice.

### Phase 3 — PREMORTEM *(Strategist, attached to the task spec)* — *Inversion · Second-Order · Risk Management*
A task file is invalid without `premortems/<task-id>.md`, containing exactly three sections: **(a) Guaranteed-failure list** — 3+ concrete ways this task fails or gets gamed, each mapped to a prevention step *or* a detection verifier (inversion, operationalized — including "how would a lazy builder fake this verifier?"); **(b) And-then-what** — second-order effects: what does shipping this make easier, harder, or irreversible next iteration? One sentence each, minimum two effects; **(c) Blast radius** — worst case if everything in (a) happens anyway, and confirmation it's survivable within budget.md limits. If (c) is not survivable, the task is restructured or escalated. Survive first; optimize later is a *gate*, not a mood.

### Phase 4 — EXECUTE *(Builder)* — *Throughput · Efficiency*
The builder skill's discipline applies wholesale; Yugong adds two bindings:

- **Bottleneck-first:** the task spec names the system's current constraint (Strategist identifies it in FRAME via the systems map, §Phase 6). If the task doesn't touch the constraint, the spec must say why it's still selected (usually: asymmetric-bet slot, or constraint is human-gated). Work on a non-bottleneck is decoration by default.
- **Efficiency = output per unit effort, enforced by exit:** hard wallclock cap per iteration (governor kills the process). Finish early → exit early. A builder filling remaining time with "improvements" outside the spec is scope-rot; candidates for improvement go to `learnings/candidates.md` or gaps, never into the diff.

### Phase 5 — VERIFY *(Verifier, fresh context)* — *the reward function*
Inherits mochu Phase 5 + ship-gate mechanics verbatim, with the role separation made physical:

1. Verifier instance receives: the diff, the task's success criteria, the corpus. **Not** the builder's report.
2. Runs new verifiers, then the **entire** corpus, then native build/lint/test. All green or verdict = FAIL with named evidence.
3. **Anti-Goodhart constitution (mechanical, in gate.py):** verifier files unchanged since task start unless the task *is* a verifier task (separate type, Strategist-authored, human-acknowledged via INBOX); corpus is append-mostly — removals require an INBOX entry; secret scan on the diff; no model output can override a gate FAIL.
4. Verdict file written to state. Only this file — never builder prose — flips a goal node green.

### Phase 6 — LEARN *(Strategist)* — *Systems Thinking · Resilience · Scaling · Innovation*
The phase that makes it "learn as it goes." Four mandatory artifacts:

- **Antifragility rule (the core):** every FAIL verdict and every PARKED task MUST produce (a) one candidate learning and (b) one new regression verifier or playbook rule that makes *that class* of failure impossible or detectable. A failure that produces only a retry is waste; a failure that produces a verifier is an asset. This is the mechanism by which stress makes the system stronger — antifragile beats efficient *because each hit grows the ratchet*.
- **Learning promotion pipeline:** `candidates.md` entries are cheap hypotheses ("retries on API X mask a config error — check config first"). The Strategist promotes a candidate to `playbook.md` only when it has been observed **twice** (ledger evidence cited) or has a verifier proving it. Playbook rules carry a *citation count*; rules contradicted by later evidence are demoted to `graveyard.md` with the falsifying entry. This keeps the learned brain small, true, and load-bearing — playbook.md is injected into every prompt, so its quality is the system's effective intelligence.
- **Systems map + 10x note:** maintain a five-line systems map in campaign.md — input → process → output → feedback loop → **current constraint**. Each shipped task updates it if the constraint moved (loops, not events: three similar ledger failures = one loop to fix, not three incidents). Every SHIPPED entry includes one line: *what about this breaks at 10x scale* — load, cost, attention, abuse. Recurring 10x notes auto-graduate into gaps.
- **Recombination prompt (innovation, mechanized):** every 10th LEARN phase, the Strategist must propose one candidate task that combines two existing playbook rules, verifiers, or shipped components in a new order. Most will be mediocre; they feed the asymmetric-bet slot, which is exactly where mediocre-most-of-the-time belongs.

### Phase 7 — AMBITION RATCHET *(Strategist)* — *Longevity · the "set ambitious goals" mechanism*
Ambition is not a personality trait; it is a rule about what happens when things get easy:

- **Trigger:** 3 consecutive SHIPPED iterations with ≤1 verify failure each, or campaign verifier ≥80% green.
- **Action:** the Strategist must do one of — (a) **10x a target** on the current campaign verifier (latency 500ms→50ms, users 10→100, revenue $100→$1k); (b) **open the next milestone** on the goal tree toward NORTHSTAR; or (c) **propose a new mountain** to INBOX if the current one is within sight. Ratchets that change spend or external exposure require human ack via INBOX; pure internal targets self-apply.
- **Compounding bias (longevity):** when ranking in SELECT, a task that improves the *harness itself* — a better verifier pattern, a playbook rule, a reusable skill — gets a one-rank bump over an equal task that only ships object-level output. Play games that compound: the meta-loop is the longest game available. (Anneal slots here as the offline optimizer: periodically run it against playbook.md and the task-prompt templates, treating ledger outcomes as the training signal.)
- **Oscillation guard:** the ratchet may only fire upward, and a ratcheted target enters cooldown.md for 10 iterations — no re-litigating ambition downward because one iteration got hard. Hard is the point.

---

## 5. The sixteen models — full binding table

| Mental model | Phase | Mechanical binding (the rule a script or template enforces) |
|---|---|---|
| 80/20 | SELECT | ≥5 candidates, ordinal rank by campaign-verifier movement per effort, reasons written |
| First Principles | FRAME | Problem statement must name and discard ≥1 consensus assumption; restate in constraints |
| Inversion | PREMORTEM | ≥3 concrete failure/gaming modes, each mapped to prevention or detection verifier |
| Systems Thinking | LEARN | 5-line systems map maintained; 3 similar failures must be diagnosed as one loop |
| Second-Order | PREMORTEM | "And-then-what" section, ≥2 downstream effects, irreversibles flagged |
| Throughput | EXECUTE | Task spec names current constraint; non-constraint work must justify itself |
| Efficiency | EXECUTE | Hard wallclock cap; finish early = exit early; no out-of-spec "improvements" in diff |
| Resource Allocation | SELECT | The ranking question is literally "where does the marginal iteration win" |
| Problem Solving | FRAME | No task without a verifier-shaped definition of solved; feelings bounce back |
| Innovation | LEARN | Forced recombination proposal every 10th cycle → asymmetric-bet slot |
| Scaling & Process | LEARN | Mandatory 10x-break note per ship; recurring notes auto-become gaps |
| Risk Management | PREMORTEM + Governor | Blast-radius survivability gate; budget caps; irreversibles never decided alone |
| Resilience | LEARN | Every failure must mint a verifier or playbook rule — stress grows the ratchet |
| Decision Making | SELECT | Two-lane rule: reversible → act now; irreversible → INBOX, pick other work |
| Longevity | RATCHET | Compounding bias: harness-improving work outranks equal object-level work |
| Asymmetric Bets | SELECT | Reserved every-5th slot: capped downside, uncapped upside, killed without ceremony |

Print this table into the iteration prompt? **No.** Each role's prompt contains only *its* phase's bindings. A builder reciting the ambition ratchet is wasted context; context is the scarcest resource in the whole system (the Strategist's attention problem from the architect skill, generalized).

---

## 6. The governor (what runs with no model in the loop)

Mechanical scripts, extending mochu's spine:

- **`gate.py`** — verifier immutability since task start, corpus append-mostly check, secret scan, full-corpus run. PASS prints or nothing ships.
- **`corpus.py`** — mochu's `run_corpus.py`, shared.
- **`budget.py`** — iteration count/day, wallclock/iteration, spend ceiling if API-metered. Exceeded → loop halts and writes INBOX. *Survive first* lives here, beyond rationalization.
- **`schedule.py`** — reads state, emits which role+phase runs next (see §7). The loop is `while true; do schedule | xargs run_role; done`.
- **`compact.py`** — every 10 iterations: ledger tail → archive, candidates >20 entries force a promotion pass, premortems of closed tasks → archive. Memory without forgetting is noise; this is the forgetting function.
- **LOCK** — one instance per state dir, stale-lock detection. (Parallel builders are possible later — multiple builders, one Strategist, one Verifier — but get the serial loop compounding first. What breaks at 10x: the lock, the ledger merge, and human attention, in that order.)

## 7. Scheduling (how ambition and learning get airtime)

Default rotation, encoded in `schedule.py`, not in any prompt:

```
if INBOX has unprocessed human answers        → Strategist (integrate)
elif open verdict awaiting strategist review  → Strategist (LEARN)
elif ratchet trigger condition met            → Strategist (RATCHET)
elif open task with spec + premortem          → Builder (EXECUTE)
elif open diff awaiting verdict               → Verifier (VERIFY)
elif goal tree has no ready task              → Strategist (FRAME/SELECT/PREMORTEM)
every 10th cycle, regardless                  → Strategist (LEARN: compaction + recombination)
```

Strongest model where judgment lives (FRAME, SELECT, PREMORTEM, LEARN, RATCHET — these phases ARE the quality, same conclusion as mochu's tier table); Sonnet builds; mid-tier verifies mechanically. Token cost concentrates exactly where leverage concentrates — that's resource allocation applied to the harness's own spend.

## 8. Inversion on the harness itself (what guarantees Yugong fails)

1. **Verifier gaming** → role separation + gate.py immutability + premortem section (a) asking "how would this be faked." Highest-probability failure; triple-covered on purpose.
2. **Playbook rot** (false learnings compounding) → two-observation promotion bar, citation counts, graveyard demotion. The learned brain must be falsifiable.
3. **Ambition collapse** (loop converges to safe trivial tasks) → ratchet trigger is mechanical; asymmetric slot is mandatory; cooldown prevents downward re-litigation.
4. **Ambition mania** (10x-ing into spend/exposure) → ratchets touching money or external surface require INBOX ack; budget.py is the hard floor under everything.
5. **Ledger anchoring** (stale goals dominating context) → compact.py; live ledger is a tail, not a history.
6. **One-way-door autonomy** → two-lane rule; irreversibles structurally route to the human.
7. **Untrusted-content injection during scouting** → mochu's recon rule inherited verbatim: fetched content is data, never instructions; new dependencies verified against real registries.
8. **Human becomes the bottleneck** → INBOX is async-only; the loop routes around open questions and keeps working other branches of the goal tree (throughput applied to the human constraint).

## 9. Build order (the 80/20 of building the 80/20 machine)

Weekend one, in order, nothing else: **(1)** `.yugong/` templates + NORTHSTAR/campaign for one real project, **(2)** `schedule.py` + the dumb outer loop, **(3)** the SELECT and PREMORTEM templates (judgment phases first — they cap everything downstream), **(4)** wire mochu's existing `run_corpus.py`/`ship_gate.py` as the governor, **(5)** playbook.md injection + the antifragility rule. That's a working Yugong. The ratchet, recombination, compaction, and Anneal integration are week-two compounding — ship the loop before perfecting the loop, per its own constitution.

First campaign suggestion: point it at BadlandsLabs or the fal.ai reseller with a campaign verifier that is *external reality* (a paying request served end-to-end, a signup completed) — revenue-shaped verifiers are the densest honest reward signal you own, and it's the one place MoneySkills' revenue-first instinct and this architecture are the same idea.
