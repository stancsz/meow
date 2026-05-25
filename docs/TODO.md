# meow TODO — Highest Priority

These are structural gaps that cause meow to report success on work that isn't actually done or isn't actually good. Fix these before adding new features.

---

## 1. Wire `meow -p` through the Orchestrator

**File:** `src/index.ts` line 131

Right now the primary headless path calls `agent.chat(command, false, ...)` directly. This bypasses the Orchestrator, the Liaison, TaskDecomposer, SelfReviewRunner, and all quality gates entirely. Every quality investment in `src/orchestrator/` is dead code for the most common usage pattern.

**Fix:** Route `meow -p` through `Orchestrator.execute()` in SHIP mode by default. The direct `agent.chat()` call should be the fallback for simple one-liners only.

---

## 2. Enforce a Definition of Done before execution starts

**Files:** `src/liaison/MissionBrief.ts`, `src/liaison/Liaison.ts`, `src/orchestrator/TaskDecomposer.ts`

`MissionBrief.successCriteria.acceptanceCriteria` exists in the type but is never populated — `createMissionBrief()` leaves it undefined, and nothing downstream sets it. `TaskDecomposer.buildDecompositionPrompt()` never asks the LLM "what does done look like for this subtask?" — the output schema has no DoD field.

**Fix:**
- Make `Liaison.extractIntent()` derive explicit acceptance criteria from the user's request as part of intent extraction.
- Add a `definitionOfDone: string[]` field to the `Task` type and require `TaskDecomposer` to populate it per subtask.
- Block execution from starting if `successCriteria` is empty for tasks above a complexity threshold. Meow should be able to articulate what it's trying to achieve before it touches a file.

---

## 3. Fix the quality gate wiring — gates never receive the data they need

**File:** `src/orchestrator/SelfReviewRunner.ts` lines 99–104

`executeWithSelfReview` builds a `reviewContext` that only sets `taskId`, `goal`, `artifacts`, and `diff`. It never populates `coverage`, `testResults`, or `humanSignoff`. As a result:

- **Lint Check** passes trivially — its logic explicitly returns `true` when `testResults` is absent.
- **Test Coverage** always fails with "No coverage report available."
- **Human Sign-Off** always fails with "No human sign-off."

The quality score is structurally capped at ~35%, the `QualityConvergenceChecker` sees two stagnant iterations, and exits with `passes: false`. The loop runs, produces numbers, and gives up without actually verifying anything.

**Fix:** Wire real data into `reviewContext` — capture test output and coverage from a `run` or `test` tool call, parse them into `TestResult[]`, and populate `ctx.coverage` and `ctx.testResults` before running gates.

---

## 4. Make test execution mandatory, not optional

**File:** `src/index.ts` line 131, `src/agent/agent.ts` `chat()` signature

`runTests` defaults to `false` everywhere. In `meow -p`, it's hardcoded to `false`. The LINT-FIX LOOP in `agent.chat()` only fires if the model voluntarily calls the `run` or `test` tool. There is no structural enforcement.

**Fix:** `runTests` should default to `true` unless explicitly suppressed with a `--no-test` flag. Meow should run the project's test suite after every set of edits and treat a non-zero exit as a hard failure requiring a fix attempt, not just a warning.

---

## 5. Enforce TDD structurally, not just as a prompt suggestion

**File:** `src/agent/agent.ts` `getBasePrompt()`

The only TDD enforcement is this sentence in the base prompt:

> Goal-Driven Execution: Define success criteria (e.g. "Write test, then make pass"). Loop until verified.

This is advice to the model, not a constraint. Nothing stops meow from writing implementation first, writing a test after, and reporting success.

**Fix:** For tasks classified as `implement` or `debug` in the `MissionBrief`, inject a mandatory step at the start of the agent loop: write or identify a failing test that demonstrates the requirement, confirm it fails, then implement. The gate is: test was red before the change and green after. Without this, meow can satisfy any task by writing a passing test that doesn't actually test the requirement.

---

## 6. Prefer live tests over mocked tests

There is currently no distinction between live integration tests and mocked unit tests anywhere in the codebase. A model that mocks every dependency and makes the test pass has formally satisfied the system.

**Fix:** Add an instruction in the system prompt and a quality gate check that:
- Flags tests where every external dependency is mocked as low-confidence.
- Requires at least one live call (real file I/O, real subprocess, real DB write) to be exercised in the test for tasks that touch those layers.
- Scores "real execution coverage" separately from "assertion coverage" in the quality gate report.

---

## 7. LLM-as-judge: require evidence that produced work is actually good

This is the most important missing piece. Meow currently has no step where it looks at the end product and asks "is this actually what was requested?"

After every task completion, run a judge pass — a separate LLM call that receives:
- The original task description and acceptance criteria
- The full diff of every file changed
- Captured stdout/stderr from running the code or tests
- Screenshots (for UI tasks) or log output (for server/CLI tasks)

The judge scores the work on:
1. **Goal alignment** — does the diff actually solve the stated problem?
2. **Completeness** — are there TODOs, stubs, or placeholder comments in the output?
3. **Correctness signal** — does the runtime evidence (logs, test output) confirm it works?
4. **Taste** — is the code coherent, appropriately scoped, and consistent with the surrounding codebase style?

A score below threshold should block the task from being marked complete and feed a specific critique back into the agent loop for another attempt.

**Implementation sketch:**
- Add `src/agent/judge.ts` — a `JudgeAgent` class that takes a `JudgeContext` (task, diff, evidence) and returns a structured `Verdict` with score + critique.
- Call it at the end of `SelfReviewRunner.executeWithSelfReview()` as a final gate after all other quality gates pass.
- For UI tasks: capture a screenshot via the existing `visualQA` infrastructure and feed it to the judge.
- For CLI/server tasks: capture `stdout`/`stderr` from a `run` call and include it as evidence.
- For file-generation tasks: read the produced file back and include its content as evidence.

---

## 8. Capture and surface runtime evidence per task

Related to #7 — meow needs to actually run the thing it built. Right now artifacts flow through the system as file paths and diffs, but there's no step that executes the output and captures what happens.

**Fix:**
- After applying edits, always attempt to run the minimal command that exercises the changed code: `npm test` for test changes, `npm run build` for source changes, the binary/script itself for CLI tools.
- Capture stdout, stderr, and exit code as a `RuntimeEvidence` struct and attach it to the `TaskResult`.
- Surface this evidence in the final output so the user (and the judge) can see proof of execution, not just proof of writing.

---

## 9. Use skills for code review and frontend design — not raw `claude -p`

**Files:** `src/agent/agent.ts` `getBasePrompt()` and `fixMeow()`

The base prompt currently lists two skill repositories:

```
https://github.com/stancsz/skills
https://github.com/vercel-labs/skills
```

`https://github.com/anthropics/skills` is missing. Anthropic's skills repo is the most relevant one for meow's use cases — it contains battle-tested skills for code review, frontend design, testing, documentation, and more.

More importantly, the `fixMeow()` method fires `claude -p` directly as the self-repair mechanism. This is the wrong tool for most failures. `claude -p` is a raw LLM call with no domain knowledge. A code review skill or a design skill has curated prompts, structured output formats, and known-good patterns for those domains. Using `claude -p` for everything is like calling a generalist when a specialist exists.

**Fix — two parts:**

**Part A: Add `anthropics/skills` to the skills ecosystem section of `getBasePrompt()`**

Update the skills lookup order to:
1. `https://github.com/anthropics/skills` — check first, highest quality
2. `https://github.com/vercel-labs/skills/blob/main/skills/find-skills/SKILL.md` — use `find-skills` skill to search both repos
3. `https://github.com/stancsz/skills` — project-local skills

Specific skills to check before doing work manually:
- **Code review:** look for a `code-review` skill before writing review logic by hand or calling `claude -p`
- **Frontend / UI design:** look for a `frontend-design`, `ui-review`, or `design-system` skill before generating UI code cold
- **Testing:** look for a `test-coverage`, `test-generator`, or `e2e-testing` skill before writing test scaffolding
- **Documentation:** look for a `docs-writer` or `readme-generator` skill

**Part B: Replace the raw `claude -p` in `fixMeow()` with a skill-first lookup**

Current flow in `fixMeow()`:
```
meow fails 3× → claude -p "fix meow" (raw LLM call)
```

Better flow:
```
meow fails 3× 
  → TOOL: use_skill | list  (check what's available)
  → TOOL: search | npx skills find <failure-domain>  (find a relevant skill)
  → if skill found: TOOL: use_skill | <skill-name>
  → if no skill: TOOL: summon | claude | <targeted fix prompt>
  → claude -p only as final fallback when summon also fails
```

The same principle applies to all `summon` calls — skills should always be checked before escalating to a specialist agent. The current prompt says this but `fixMeow()` hardcodes `claude -p` and skips the lookup entirely.

---

## 10. Enforce the skills-first rule in the agent prompt more strictly

**File:** `src/agent/agent.ts` `getBasePrompt()`

The current skills section says "ALWAYS check if a skill exists" but the enforcement is soft — the model can ignore it. The `fixMeow()` code path ignores it unconditionally.

**Fix:** Add a mandatory pre-flight step to the agent loop for any task classified as `code-review`, `frontend`, `design`, `test`, or `documentation`:

1. Run `npx skills find <domain>` against the three skill repos listed above.
2. If a skill is found with >80% name/description relevance, install and invoke it.
3. Log which skill was used (or why none was chosen) in the task audit trail.
4. Only proceed to raw LLM generation if the skill search returns no match.

This ensures meow inherits maintained, community-validated approaches for common task types rather than re-deriving them from scratch on every run.

---

## Priority order

| # | Item | Blocking? |
|---|------|-----------|
| 1 | Wire `meow -p` through Orchestrator | Yes — all other fixes are moot without this |
| 2 | DoD before execution | Yes — can't verify done without knowing what done is |
| 3 | Fix quality gate wiring | Yes — gates are no-ops without real data |
| 7 | LLM-as-judge with evidence | High — this is the correctness signal meow is missing |
| 8 | Capture runtime evidence | High — required for #7 to work |
| 9 | Skills-first: add `anthropics/skills`, replace raw `claude -p` in `fixMeow()` | High — directly improves output quality for review/design/test tasks |
| 10 | Enforce skills-first rule in agent prompt | Medium |
| 4 | Mandatory test execution | Medium — partially addressed by #3 fix |
| 5 | TDD enforcement | Medium |
| 6 | Live vs mock test preference | Low — polish after the above are solid |
