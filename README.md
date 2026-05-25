# meow-swarm

> One prompt. Meow plans it, builds it, verifies it, and repairs itself if anything breaks.

```bash
meow -p "add OAuth2 login to the API with tests"
# → dispatched. check back with meow --tui
```

Most coding agents execute your prompt once and hand you back a diff. Meow-swarm is different: it runs a full plan → build → quality-verify → self-repair loop autonomously, and doesn't mark a task done until it can show evidence the work is correct.

---

## What makes meow-swarm different

### 1. Definition of Done before the first line of code

When a task arrives, meow derives explicit acceptance criteria from your request before touching anything. It knows what "done" looks like — specific, verifiable outcomes — before it starts. This is what separates a task that completes from one that finishes.

### 2. Quality gates, not just a diff

After every execution, meow runs a structured self-review loop against a set of quality gates:

| Gate | What it checks |
|------|---------------|
| **Placeholder Detection** | No TODOs, FIXMEs, or stub bodies in produced code |
| **Lint / Type Check** | Zero errors from the project's linter and type checker |
| **Test Coverage** | Tests pass, coverage meets the project threshold |
| **Coherence** | The diff actually addresses the stated goal (LLM review pass) |
| **Human Sign-Off** | Production tasks require explicit approval before shipping |

If gates fail, meow feeds the specific issues back into the agent loop and retries — up to a configurable iteration limit. A `QualityConvergenceChecker` tracks whether quality is genuinely improving each iteration and stops early if it detects diminishing returns, so it doesn't burn tokens grinding on something unfixable.

### 3. Evidence-based completion

Meow doesn't consider a task done because the code compiled. It runs the thing it built and captures the evidence:

- **stdout / stderr** from running the produced code or tests
- **Screenshots** for UI changes (visual diff against baseline)
- **File read-back** for generated artifacts — confirms the file has real content, not a stub

This evidence is fed to an LLM judge that scores the work against the original task description. Score below threshold → back into the loop with a specific critique. Score above threshold → task is marked complete with the evidence attached.

### 4. MEOW-3-RULE: self-repair instead of giving up

When meow fails three consecutive attempts on a task, it doesn't ask you for help. It runs a targeted `claude -p` call — not to finish the task, but to diagnose and patch meow's own code, prompts, or tool configuration. After the patch, the task is re-queued for a fresh attempt with the fixed machinery.

```
Task fails × 3
  → claude -p "diagnose why meow failed, fix meow's code"
  → meow is patched
  → task re-queued → succeeds
```

The task and the mechanic are never conflated. Meow fixes itself; it doesn't sneak in a bad completion to avoid admitting failure.

### 5. Skills-first execution

Before writing any code for common task types — code review, frontend design, testing, documentation — meow searches the community skills ecosystem:

- [`https://github.com/anthropics/skills`](https://github.com/anthropics/skills)
- [`https://github.com/vercel-labs/skills`](https://github.com/vercel-labs/skills/blob/main/skills/find-skills/SKILL.md)

A battle-tested code review skill has better prompts and output structure than anything meow would derive from scratch on every run. Skills are installed automatically if found (`npx skills add <skill> -g -y`) and invoked before falling back to raw LLM generation or a summon call.

### 6. Background daemon — fire and forget

Meow is not a chat partner. It runs in the background like a worker process:

- Dispatch a task → returns immediately, work runs async
- Checkpoints every state change to SQLite — crashes are recoverable
- `meow --continue` resumes stranded tasks on reboot
- `meow --tui` gives a live dashboard of agent status, task queue, and token costs

You can dispatch a task, close your laptop, and come back to a completed result with a full audit trail of every decision and tool call.

### 7. Multi-layer architecture with specialist routing

```
meow -p "task"
       ↓
  [L1 Liaison]          Intent extraction, MissionBrief with acceptance criteria
       ↓
  [L2 Architect]        Task decomposition, dependency resolution, specialist assignment
       ↓
  [L3 SwarmManager]     Parallel or sequential execution across specialist agents
       ↓
  [Self-Review Loop]    Quality gates, convergence check, evidence capture
       ↓
  [LLM Judge]           Scores output against original task — passes or feeds critique back
       ↓
  [L4 Auditor]          Final checkpoint to SQLite, cost tracking, audit ledger
```

Each layer uses the right model for its job. The Liaison uses a fast model for sub-500ms intent parsing. Deep execution uses your configured model (Claude Sonnet by default). The judge uses a separate call with the full context to avoid self-grading bias.

---

## Quick start

```bash
# Node.js 18+ required (Bun not supported — native SQLite addons require Node)
npm install -g meow-swarm

# Configure your API key
export ANTHROPIC_API_KEY="sk-ant-..."

# Dispatch a task
meow -p "refactor the auth module to use JWT and add tests"

# Watch it work
meow --tui
```

## Commands

| Command | Description |
|---------|-------------|
| `meow -p "task"` | Dispatch task headlessly (primary interface) |
| `meow` | Interactive REPL |
| `meow --tui` | Live terminal dashboard |
| `meow --continue` | Resume stranded tasks after a crash |
| `meow --monitor` | Run the monitoring agent (cluster analysis, patch suggestions) |

## Configuration

Copy `.env.example` to `.env` and set:

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | required | API key |
| `ANTHROPIC_MODEL` | `claude-sonnet-4` | Model for execution |
| `MEOW_MODE` | `SHIP` | `SHIP`, `SEQUENTIAL`, `PARALLEL`, `ECOMODE`, `RALPH` |
| `MEOW_BUDGET_CENTS` | unset | Hard spend cap per session |
| `MEOW_DB` | `meow.db` | SQLite state database path |

**Execution modes:**

- `SHIP` — Full quality pipeline. Self-review loop, all gates, LLM judge. Use for production tasks.
- `SEQUENTIAL` — Gates enabled, no judge pass. Good for development iteration.
- `PARALLEL` — Maximum throughput, no quality gates. Use for bulk refactors you'll review yourself.
- `ECOMODE` — Cheap model, 1 retry, 30s timeout. Fast exploration.
- `RALPH` — Unlimited retries, relentless quality convergence. For hard problems where cost is secondary.

---

## MEOW-3-RULE (never violate this)

```
Task arrives → meow -p (3 retry attempts)
  ↓ fails × 3
claude -p (fixes meow's code/prompts — NOT the task)
  ↓
User re-runs same task → meow → succeeds
```

`claude -p` is a meow-swarm mechanic. It repairs broken machinery. It never completes the original task on meow's behalf.

---

See `docs/STATUS.md` for current known issues and `docs/TODO.md` for the prioritized improvement backlog.
