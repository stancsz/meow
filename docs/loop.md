# meow agent loop instructions

This loop never stops. Each iteration picks one thing, closes it, commits it, then finds the next thing. The goal is always the same: make meow a real self-improving AI-native system as described in `docs/AI_NATIVE_COMPANY_PLAN.md`.

---

## before the first iteration only — orient yourself

read these once to build your mental model. you do not need to re-read them every loop:

- `docs/AI_NATIVE_COMPANY_PLAN.md` — the north star. what this whole thing is for.
- `docs/AI_NATIVE_MEOW_PLAN.md` — what meow should become
- `docs/ROADMAP.md` — current planned work
- `docs/ARCHITECTURAL_GAP_ANALYSIS.md` — known gaps between intent and reality
- `CLAUDE.md` — how to operate meow right now

after that, each loop is the same four steps.

---

## env check — run once at the start of every session

before picking any work, verify the environment. run this and record what is present and what is missing:

```bash
echo "MINIMAX_API_KEY:   ${MINIMAX_API_KEY:+set}"
echo "MINIMAX_BASE_URL:  ${MINIMAX_BASE_URL:+set}"
echo "LLM_API_KEY:       ${LLM_API_KEY:+set}"
echo "LLM_BASE_URL:      ${LLM_BASE_URL:+set}"
echo "ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:+set}"
echo "MEOW_MODEL:        ${MEOW_MODEL:-not set}"
echo "MEOW_BUDGET_CENTS: ${MEOW_BUDGET_CENTS:-not set}"
echo "MEOW_AUDIT_DIR:    ${MEOW_AUDIT_DIR:-not set}"
```

**preferred provider is MiniMax.** if `MINIMAX_API_KEY` and `MINIMAX_BASE_URL` are set, configure meow to use them:

```bash
export LLM_API_KEY=$MINIMAX_API_KEY
export LLM_BASE_URL=$MINIMAX_BASE_URL
export MEOW_MODEL=${MEOW_MODEL:-"MiniMax-M1"}
```

if MiniMax is not available, fall back to `ANTHROPIC_API_KEY`. if neither is set, document it in `docs/loop-decisions.md` as a blocker, skip any work that requires LLM calls, and focus on structural/non-LLM items instead. do not invent or hardcode keys.

---

## step 1 — pick one thing to work on

check `docs/ARCHITECTURAL_GAP_ANALYSIS.md` for open gaps. check `docs/ROADMAP.md` for planned items. check `docs/loop.md#decisions` for what was last worked on.

pick the single highest-value open item. priority order:

1. anything **critical** (meow crashes, loses data, silently does the wrong thing)
2. anything **fragile** (breaks on edge cases, tests are mocked where they should be live)
3. a **gap** that blocks one of the five loop layers from `AI_NATIVE_COMPANY_PLAN.md`:
   - sensor layer — ingesting real signals
   - policy layer — what runs autonomously vs. needs human sign-off
   - tool layer — deterministic APIs the agent can call
   - quality gate — checks, filters, auditing
   - learning mechanism — the system sees its own failures and improves
4. anything in `docs/ROADMAP.md` not yet done

append your chosen item to `docs/loop-decisions.md` before doing any work:
```
YYYY-MM-DD — working on: <item>
```

---

## step 2 — perform live tests before and after

before touching code, run the suite and record what passes and what fails:

```bash
npm test
```

then run at least one live test relevant to the item you picked:

- if it's a kernel issue: create a `MeowKernel` with a real `:memory:` SQLite and verify behavior
- if it's an agent issue: run `meow -p "write hello world to /tmp/test.txt"` and check the file exists
- if it's an orchestrator issue: enqueue real tasks and watch them execute
- if it's a TUI issue: spawn `meow --tui` and check it renders

record what you ran, what happened, and whether it matched the expected behavior. **if a test only works with mocks, it doesn't count as passing.**

---

## step 3 — do the work, then commit it

make the change. do not do more than the one item you picked. then:

1. run `npm test` again — confirm nothing regressed
2. run the live test again — confirm the fix works end to end
3. commit:

```bash
git add -A
git commit -m "<short description of what changed and why>"
```

do not leave work uncommitted. if you can't commit because tests fail, fix the tests first. if you can't fix the tests, document why in `docs/ARCHITECTURAL_GAP_ANALYSIS.md` and revert the change.

if you are blocked by a missing env var, missing dependency, or broken environment: log it in `docs/loop-decisions.md` with the exact blocker, revert any incomplete changes, and move to the next item. do not get stuck.

update `docs/ARCHITECTURAL_GAP_ANALYSIS.md` to mark the gap as closed if applicable.

---

## step 4 — find and commit to the next highest-leverage action

after committing, do not stop. do not ask for input. decide and move.

run:

```bash
meow -p "read docs/AI_NATIVE_COMPANY_PLAN.md, docs/AI_NATIVE_MEOW_PLAN.md, docs/ARCHITECTURAL_GAP_ANALYSIS.md, and docs/ROADMAP.md. look at the current code in src/. apply 80/20 thinking: what is the single action that would deliver the most value toward making meow a real self-improving AI-native system? consider the five loop layers (sensor, policy, tool, quality gate, learning mechanism) and pick whichever is most broken or most missing. output only: the action, which layer it targets, and one sentence on why it is the highest-leverage move right now."
```

take the output as the decision. do not second-guess it. add it to `docs/ROADMAP.md` and `docs/ARCHITECTURAL_GAP_ANALYSIS.md` as the next open item. record the decision and the reasoning in `docs/loop-decisions.md`. go back to step 1.

the loop never ends. there is always a next thing.

---

## resolving conflicts

if anything is unclear or two docs contradict each other, resolve it by reading in this order:

1. `docs/AI_NATIVE_COMPANY_PLAN.md` — highest authority
2. `docs/AI_NATIVE_MEOW_PLAN.md` + `docs/ROADMAP.md`
3. `docs/ARCHITECTURAL_GAP_ANALYSIS.md`
4. `CLAUDE.md`

if the conflict still can't be resolved, document it in `docs/ARCHITECTURAL_GAP_ANALYSIS.md` as an open question and make the most conservative choice.

---

## decisions

decisions are logged in `docs/loop-decisions.md`. append there, not here.
