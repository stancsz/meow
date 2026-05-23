# meow loop — operating procedure

One thing at a time. Pick it, close it, commit it, find the next thing. Never stop.

---

## orient (once per session)

```bash
# verify env
echo "LLM_API_KEY: ${LLM_API_KEY:+set} | ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:+set} | MEOW_MODEL: ${MEOW_MODEL:-not set}"
```

Preferred provider: MiniMax. If `MINIMAX_API_KEY` + `MINIMAX_BASE_URL` are set:
```bash
export LLM_API_KEY=$MINIMAX_API_KEY
export LLM_BASE_URL=$MINIMAX_BASE_URL
export MEOW_MODEL=${MEOW_MODEL:-"MiniMax-M1"}
```

If neither provider is available: log the blocker in `loop-decisions.md`, skip LLM tasks, work on structural items only.

Read ONLY these three docs. Stop. Do not read anything else in `docs/` unless the specific task you pick requires it.
1. `docs/STATUS.md` — what to work on, open bugs
2. `docs/ROADMAP.md` — wave plan and CLI reference
3. `docs/loop-decisions.md` — what was last done

`docs/rfc/` exists for reference — look up a specific file there only when a task explicitly needs it (e.g. fixing the TUI requires reading `docs/rfc/tui-spec.md`). `docs/archive/` is never read.

---

## step 1 — pick one thing

Take the top open item from `docs/STATUS.md`. Priority:
1. Critical bugs (BUG-01, BUG-02 first)
2. Medium bugs
3. Remaining ROADMAP items (TUI, etc.)

Append to `docs/loop-decisions.md` before touching any code:
```
YYYY-MM-DD — working on: <item>
```

---

## step 2 — test before

```bash
npm test
```

Run one live test relevant to the item:
- kernel issue → `MeowKernel` with `:memory:` SQLite
- agent issue → `meow -p "write hello world to /tmp/test.txt"` and verify file exists
- orchestrator → enqueue real tasks and observe
- TUI → `meow --tui` and verify render

Record what passed and what failed. **Mock-only tests don't count.**

---

## step 3 — do the work and commit

One item only. Then:

1. `npm test` — no regressions
2. Live test — fix confirmed end-to-end
3. Commit:
```bash
git add -A && git commit -m "<what changed and why>"
```

If tests fail: fix them first. If blocked (missing env, broken dep): log exact blocker in `loop-decisions.md`, revert, move to next item.

Update `docs/STATUS.md` to mark the bug closed. Update `docs/ROADMAP.md` checkbox.

---

## step 4 — find the next thing

```bash
meow -p "read docs/STATUS.md and docs/ROADMAP.md. look at src/. what is the single highest-leverage action right now? output only: the action, which of the five AI-native loop layers it targets (sensor/policy/tool/quality-gate/learning), and one sentence on why."
```

Take the output. Log it in `loop-decisions.md`. Add to `STATUS.md` if it's a new bug or to `ROADMAP.md` if it's planned work. Go back to step 1.

---

## conflicts

If docs contradict each other, trust this order:
1. `docs/STATUS.md` (current ground truth)
2. `docs/rfc/ai-native-company-strategy.md` (strategic authority)
3. `docs/ROADMAP.md`
4. `CLAUDE.md`

Document unresolvable conflicts in `docs/STATUS.md` as an open question.
