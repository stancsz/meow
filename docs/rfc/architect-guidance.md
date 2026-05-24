# Architect Guidance — Wave 5

**Author:** External architectural review, 2026-05-23  
**Audience:** Agent loop running `meow -p`  
**Read when:** Picking the next item after Wave 4 is fully closed

---

## Where the system stands

Wave 4 is done. All seven bugs are fixed. The codebase is structurally sound for the first
time. The `ExecutionModes.ts` scaffold exists and routes correctly — but every advanced handler
(`AUTOPILOT`, `ECOMODE`, `PIPELINE`, `RALPH`) throws on invocation. The only mode that
actually runs today is `SHIP` / `SEQUENTIAL` / `PARALLEL`.

Wave 5's job is to make the other modes real, and to ship the TUI rewrite. Those two tracks
are related. Do not start the TUI before the modes — explained below.

---

## The sequencing question: when to do the TUI rewrite

**Not yet. Do ECOMODE first.**

Here is why. The TUI spec (`docs/rfc/tui-spec.md`) requires a live task tree fed by
`tuiEvents` — `task_start`, `task_update`, `task_done` events flowing through the
orchestration pipeline. Today `tui.ts` already listens for those events. The problem is
that in `PARALLEL` mode (the only fully working mode) tasks fire and complete so fast that
the tree never renders meaningfully. There is nothing to watch.

Once ECOMODE is working — slower, sequential, model-aware — the task tree will have
something real to show: staged execution, model names in the status line, token costs.
The TUI rewrite will be testable. Build it against nothing and you will rewrite it again.

**The right order:**

```
1. ECOMODE handler (2–3 hours of work)
2. AUTOPILOT handler (1 day)
3. TUI rewrite (1–2 days, now has real events to render)
4. RALPH handler (last — it is the "never give up" loop, needs AUTOPILOT as its base)
5. PIPELINE handler (least urgent, AUTOPILOT covers most of its use cases)
```

---

## Wave 5, Item 1 — Implement ECOMODE handler

**Why first:** Smallest surface area. Already partially wired in `Orchestrator.ts` (lines
261–270 cap retries and shrink timeouts). The handler just needs to select a cheap model and
enforce it end-to-end.

**What it needs to do:**

```typescript
// src/orchestrator/ExecutionModes.ts — EcoModeHandler.execute()
async execute(task, config, _handlers) {
  // 1. Override model to Haiku (cheapest). Fall back to Sonnet if Haiku fails.
  const ecoConfig = {
    ...config,
    model: 'claude-haiku-4-5-20251001',
    maxRetries: 1,
    timeoutMs: 30_000,
  };
  // 2. Run through Orchestrator's existing SEQUENTIAL path with ecoConfig
  // 3. If the Haiku run returns success: false, retry once with Sonnet
  // 4. Return OrchestratedResult
}
```

The model strings live in `src/config/env.ts`. Do not hardcode them — read
`ANTHROPIC_MODEL` from env and use Haiku as a known cheaper variant.

**Acceptance test:** `meow -p "write hello world to /tmp/test.txt" --mode ecomode` completes
and the status line shows the model name. Verify the file exists.

---

## Wave 5, Item 2 — Implement AUTOPILOT handler

**Why second:** This is the most valuable mode. It turns meow from a single-shot executor
into a genuine multi-stage pipeline: requirements → plan → code → verify. Everything else
in the roadmap assumes this works.

**What it needs to do:**

```
analyst   → extract requirements, produce structured TaskSpec list
architect → plan subtasks, assign workers, set ValidationContracts
executor  → run each subtask through the existing worker pipeline
qa        → run MissionReviewer (already exists in auditor/Auditor.ts)
```

Each stage hands a structured artifact to the next. Use the `TaskSpec` / `ValidationContract`
types already in `src/orchestrator/Task.ts` — they were built for exactly this.

**Do not build new agents.** The pieces exist: `Liaison` for intent extraction, `Architect`
for planning, `ParallelExecutor` for execution, `Auditor` for review. AUTOPILOT is the
conductor that sequences them with explicit handoff contracts between stages.

**Key constraint:** Each stage must emit a `tuiEvents.emit('task_update', ...)` so the TUI
tree has something to render. Wire these in as you build each stage — not as an afterthought.

**Acceptance test:** `meow -p "add a /health endpoint to src/server.ts" --mode autopilot`
produces a committed file with a passing test. Each stage visible in `/tasks` TUI output.

---

## Wave 5, Item 3 — TUI rewrite

**Do this after AUTOPILOT is working.** By then `tuiEvents` will be emitting real stage
transitions and the task tree will have actual content to render.

The spec in `docs/rfc/tui-spec.md` is solid. Follow it. A few clarifications:

**On the task tree panel:** The current `tui.ts` already has `_taskRoot` and a `/tasks`
command that renders it as text. The rewrite should make this a live-updating left panel
using `blessed-contrib.tree` or equivalent — not a slash command, always visible.

**On mode display:** The status bar already shows `_executionMode`. After ECOMODE and
AUTOPILOT are real, add the model name to the status line so the user sees which model is
running. Format: `[AUTOPILOT | claude-sonnet-4-6 | 2m34s]`.

**On abort:** `tui.ts` has a `/abort` command stub. It needs to actually cancel the current
`Orchestrator.execute()` promise. Use an `AbortController` passed into `Orchestrator` —
wire the `/abort` command to call `controller.abort()`.

**One thing to not rebuild:** The `tuiEvents` event bus in `src/cli/tui-events.ts` is the
right abstraction. Do not replace it. The rewrite should consume the same events.

---

## Wave 5, Item 4 — RALPH handler

Build this last. RALPH is "never give up" — it is AUTOPILOT with `maxRetries: 100` and
an architect verify step after each failure. Once AUTOPILOT works, RALPH is a thin wrapper:

```typescript
// RALPH = AUTOPILOT with retry loop and mandatory architect re-verify after each fail
async execute(task, config, handlers) {
  for (let i = 0; i < 100; i++) {
    const result = await handlers.autopilot.execute(task, config, handlers);
    if (result.success) return result;
    // architect re-verify: read the failure, adjust the plan, retry
  }
}
```

The `SelfReviewRunner` already sets `maxIterations: 100` for RALPH mode in Orchestrator —
align with that.

---

## Wave 5, Item 5 — REPL rewrite

**Do this alongside the TUI rewrite.** They share the same command vocabulary and the same
`tuiEvents` bus — redesign them together so they don't drift apart again.

### What is wrong with the current REPL

`src/cli/repl.ts` (242 lines) has three structural problems:

**1. Mode is a boolean.** `parallelMode: boolean` replaced by a real `ExecutionMode`. The
REPL should support every mode the Orchestrator supports, selected via `/mode <name>`:

```
/mode ship       → ExecutionMode.SHIP (default)
/mode ecomode    → ExecutionMode.ECOMODE
/mode autopilot  → ExecutionMode.AUTOPILOT
/mode ralph      → ExecutionMode.RALPH
/mode parallel   → ExecutionMode.PARALLEL
```

The current `/parallel` toggle is a dead-end. Remove it. Replace with `/mode`.

**2. L1 complexity threshold is hardcoded magic.** The REPL hands off to L2 when
`liaisonResponse.brief.complexity > 60`. This means the REPL silently changes behavior
mid-conversation with no user visibility. Make it explicit: when complexity > 60, print
a one-liner `[Routing to L2 — complexity: 72]` and let the user override with `/mode l1`
if they want to stay in Liaison-only mode.

**3. Abort is impossible.** The `while(true)` loop calls `orchestrator.execute()` and
awaits it synchronously. Ctrl+C kills the whole process. The REPL should pass an
`AbortController.signal` into `execute()` and bind Ctrl+C (or `/abort`) to
`controller.abort()` — same fix needed in TUI.

### What the rewritten REPL should look like

```
src/cli/repl.ts
  createRepl(agent, db)         ← add db so REPL can show history
    state:
      mode: ExecutionMode       ← replaces parallelMode boolean
      orchestrator: Orchestrator
      liaison: Liaison
      abortController: AbortController | null
      history: string[]         ← last 50 inputs, readline history

    commands:
      /mode <name>              ← set ExecutionMode
      /mode                     ← show current mode
      /status                   ← orchestrator queue + mode + last task duration
      /history                  ← last 10 tasks from SQLite task_outcomes
      /add <file>               ← existing, keep
      /drop <file>              ← existing, keep
      /files                    ← existing, keep
      /clear                    ← existing, keep
      /abort                    ← cancel current execute(), print summary
      /help                     ← updated list
      /exit, /quit              ← existing, keep
```

**On readline history:** Replace `@clack/prompts` `p.text()` with Node's built-in
`readline.createInterface()` with `historySize: 50`. This gives up-arrow history for
free. `@clack/prompts` is fine for spinners but its text input has no history support —
the current REPL loses every command on Enter.

**On the response box:** The current box renderer (lines 216–233) is fine. Keep it.
Add one line above the box showing `[mode | elapsed | tokens]` in dim text so the user
always knows what ran and how long it took.

**On shared commands with TUI:** Extract the command dispatch table into
`src/cli/commands.ts` — a shared map of `{ name, description, handler }` — so both
`repl.ts` and `tui.ts` import from the same place. The current situation where `/help`
in REPL and `/help` in TUI list different commands will keep diverging otherwise.

### Build order within this item

```
1. Extract commands.ts (shared command table)
2. Add AbortController to Orchestrator.execute() signature
3. Replace parallelMode boolean with ExecutionMode state + /mode command
4. Replace p.text() with readline (get history for free)
5. Wire /abort
6. Add [mode | elapsed | tokens] status line above response box
7. Update /help from commands.ts
```

Each step is independently committable. Do not do them all in one commit.

---

## What NOT to build in Wave 5

**Do not implement PIPELINE.** It is sequential analyst → architect → executor → qa → writer.
AUTOPILOT already covers the first four stages. PIPELINE's only addition is a "writer" stage
for documentation generation. Not worth the effort until there is a concrete use case.

**Do not implement SWARM_TEAM or ULTRAPILOT.** These are aspirational labels in the enum
with no spec. Leave them throwing until someone writes a spec.

**Do not touch the quantum features** (Grover's search, Bell-state entanglement). With BUG-01
fixed, the memory subsystem is unblocked and these should now execute. But they are
experimental. Do not refactor them — just leave them running and see if they cause errors.
If they do, file a bug. If not, add a note to `docs/rfc/evidence-report.md` confirming
they ran successfully.

**Do not add tier-based cost control** (Haiku/Sonnet/Opus auto-selection) as a separate
system. The right place for it is ECOMODE's handler — build it there, not as a cross-cutting
concern.

---

## Wave 5, Item 6 — Persistent error log at `~/.meow/logs/error.log`

### What exists today

`AuditLogger` (`src/kernel/audit.ts`) writes structured JSONL to `~/.meow/audit/<runId>.jsonl`.
This captures what callers explicitly pass to it — LLM calls, delegation decisions, explicit
`.error()` calls.

What it does NOT capture: every `console.error()` in the kernel, watchdog, drain loop, and
respawn path. These go to stderr and vanish. When `meow -p` runs headless (no TTY), they are
completely lost. This is why debugging failures requires reproducing them interactively.

### What to build

Add a persistent error log at `~/.meow/logs/error.log` that captures all unhandled errors
and all `console.error` output automatically, without requiring callers to opt in.

**Implementation — two parts:**

**Part 1: stderr tee in `src/index.ts`** (process-level, catches everything)

```typescript
// At the top of main(), before anything else runs:
import fs from "fs";
import path from "path";
import os from "os";

const logsDir = path.join(os.homedir(), ".meow", "logs");
fs.mkdirSync(logsDir, { recursive: true });
const errorLog = fs.createWriteStream(
  path.join(logsDir, "error.log"),
  { flags: "a" }  // append, never truncate
);

const origStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk: any, ...args: any[]) => {
  errorLog.write(`[${new Date().toISOString()}] ${chunk}`);
  return origStderrWrite(chunk, ...args);
};

process.on("uncaughtException", (err) => {
  errorLog.write(`[${new Date().toISOString()}] UNCAUGHT: ${err.stack}\n`);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  errorLog.write(`[${new Date().toISOString()}] UNHANDLED_REJECTION: ${reason}\n`);
});
```

This is non-intrusive — zero changes to existing callers. Every `console.error()` already
writes to stderr, so it gets captured automatically.

**Part 2: log rotation** (keep the file manageable)

Rotate when `error.log` exceeds 5MB: rename to `error.log.1`, start fresh. Keep at most
`error.log` and `error.log.1` (10MB total cap). Do the rotation check at startup in `main()`,
before the stderr tee is attached.

```typescript
const errorLogPath = path.join(logsDir, "error.log");
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
if (fs.existsSync(errorLogPath) && fs.statSync(errorLogPath).size > MAX_BYTES) {
  const rotated = errorLogPath + ".1";
  if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
  fs.renameSync(errorLogPath, rotated);
}
```

### File layout after this change

```
~/.meow/
  audit/          ← existing: per-run structured JSONL (LLM calls, delegation)
  logs/
    error.log     ← NEW: all stderr + uncaught exceptions, appended across sessions
    error.log.1   ← NEW: previous rotation
  benchmarks/     ← existing: eval reports
  skills/         ← existing: harvested skills
  history.txt     ← existing: TUI command history
```

### What NOT to do

Do not change `AuditLogger`. It is a structured per-run record and should stay that way.
`error.log` is the raw crash dump — unstructured, append-only, human-readable for debugging.
They serve different purposes.

Do not write to a workspace-local `.meow/` for errors. The workspace may not be writable
(read-only mount, network share). Home dir is always writable.

### Acceptance test

```bash
meow -p "this task will fail because ANTHROPIC_API_KEY is unset"
cat ~/.meow/logs/error.log   # should show the error with timestamp
```

---

## Architecture constraints to maintain

These are decisions that have been made. Do not relitigate them.

**The 4-layer hierarchy is fixed.** Liaison → Architect → Swarm → Auditor. Adding a 5th
layer requires an RFC. AUTOPILOT orchestrates across existing layers — it does not add one.

**Orchestrator never writes source code.** This is the MEOW-3-RULE's architectural analog.
If a mode handler is tempted to write code directly, it is doing something wrong. Delegate
to workers via the existing worker pipeline.

**SQLite is the coordination layer.** No Redis, no in-memory queues for anything that
needs to survive a crash. FileCoordinator is now SQLite-backed — keep it that way.

**No new external dependencies without justification.** The `blessed-contrib` TUI library
is already in the spec and pre-approved. Anything else needs a reason.

---

## One thing to fix before Wave 5 starts

The `handlers` object inside `Orchestrator.execute()` (lines 200–204) duplicates the throw
stubs that already exist in `ExecutionModes.ts`. When you implement each handler, delete the
inline stub from Orchestrator and import the real class from `ExecutionModes.ts`. Right now
both places throw — the routing goes to `ExecutionModes.ts` first, so the inline stubs are
dead code, but they will cause confusion.

Clean this up on the first commit of Wave 5 before touching anything else.

---

*Last updated: 2026-05-23*
