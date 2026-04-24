# Test Files Summary — `/app/agent-harness/computer`

Two test files exist in this directory.

---

## 1. `test-desktop-nav.sh`

**Type:** Bash shell script (entry point / orchestrator)

**Purpose:** Launches the TypeScript test runner with simulation mode enabled, logs results, and reports pass/fail counts.

**Usage:**
```bash
./test-desktop-nav.sh [task-id]
# task-id: 1=basic nav, 2=multi-app, 3=hitl gate
```

**Behavior:**
- Detects `bun` or `node` runtime
- Verifies all module files exist (`computer_controller.ts`, `screen_recognition.ts`, `human_in_the_loop.ts`, `computer_agent.ts`, `index.ts`)
- Writes an inline TypeScript test runner (`.test-runner.ts`) via heredoc
- Runs the test runner with `SIMULATE_DESKTOP=1`
- Logs output to `/tmp/desktop-nav-test-<timestamp>.log`
- Tallies `PASS:` / `FAIL:` lines and exits with code 1 if any failures

---

## 2. `.test-runner.ts`

**Type:** Inline TypeScript test runner (written by `test-desktop-nav.sh` via heredoc)

**Purpose:** Executes simulation-mode tests for the desktop agent system. Tests modules, controller init, tool execution, screen recognition, HITL risk assessment, multi-step agent execution, multi-app tasks, and error recovery.

**Test sections:**

| Section | What it tests |
|---|---|
| Module Loading | Imports `computer_controller`, `screen_recognition`, `human_in_the_loop`; verifies exported functions |
| Controller Init | Calls `init()`, asserts `isReady() === true` |
| Tool Execution (Simulated) | `click`, `type`, `screenshot`, `openApp`, `pressKey`, `scroll` — all via `setSimulated(true)` |
| Screen Recognition | `capture()` returns state with `elements` array and `summary` string; `findElement("Finder")` runs without error |
| HITL Risk Assessment | `riskAssessment()` scores click=LOW, delete=HIGH, exec>=MEDIUM; `requiresApproval()` gate checks |
| Agent Execute | `DesktopAgent.execute()` returns `TaskResult` with `steps` array; task is selected by `taskId` arg |
| Multi-App Task | `executeMultiApp("Open Browser, copy text, paste into Notepad")` returns steps array |
| Error Recovery | `click({ x: -99999, y: -99999 })` handles bad coords gracefully |

**Result:** Prints `PASS:` / `FAIL:` lines, then `Results: N passed, M failed`. Exit code 1 if any failures.

---

## Source modules tested

| Module | File |
|---|---|
| ComputerController | `computer_controller.ts` |
| ScreenRecognition | `screen_recognition.ts` |
| HumanInTheLoop | `human_in_the_loop.ts` |
| DesktopAgent | `computer_agent.ts` |
| Index (entry) | `index.ts` |