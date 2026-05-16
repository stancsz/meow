---
name: meow
description: "Use when delegating coding tasks to MEOW. Primary interface: meow -p 'task'. MEOW-3-RULE: meow -p first (3 retries) → claude -p fixes MEOW (NOT the task). Background daemon + headless. Requires Node.js."
version: 1.0.0
author: stancsz
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Coding-Agent, Autonomous, Background-Daemon, MEOW-3-RULE, Headless]
    related_skills: [claude-code, codex, opencode]
---

# MEOW — Autonomous Coding Agent

**MEOW** is a lightweight, autonomous coding agent CLI. Give it a task → it works in background → you check back later. It is not a chat partner. It is not synchronous.

**One-line summary:** `meow -p "task"` runs in background, `claude -p` fixes MEOW when it breaks (never completes the task).

---

## The Core Mental Model

```
You → Hermes → meow -p "task" → background → progress → notify
                          ↰ check status via Hermes
```

MEOW is **fire-and-forget**. You do NOT wait in the chat for it to finish.

---

## MEOW-3-RULE (the fundamental operator loop)

**Never violate this:**

```
Task arrives → meow -p (MEOW gets 3 retry attempts)
  ↓ fails × 3
claude -p "fix MEOW" (fixes MEOW's own code, NOT the task)
  ↓
User re-invokes same task → meow -p → succeeds
```

**claude -p is a MEOW mechanic.** It only runs when MEOW's own code/prompts/tools are broken. It diagnoses the root cause, patches MEOW, then MEOW retries and completes the task.

**Never use `claude -p` to complete the original task.** That bypasses MEOW entirely.

### The escalation ladder

| Attempt | Action | Who |
|---------|--------|-----|
| 1 | `meow -p` — MEOW tries with its own reasoning | MEOW |
| 2 | `meow -p` — MEOW tries different strategy | MEOW |
| 3 | `meow -p` — MEOW tries with explicit decomposition | MEOW |
| ❌ fail | `claude -p` — fix MEOW's capability gap | CLAUDE |
| ✅ | MEOW retries and completes | MEOW |

### When to escalate

- MEOW tries same strategy with no adaptation after 3 attempts
- MEOW doesn't know a tool or format (e.g., ruff, pyproject.toml sections)
- MEOW's system prompt causes it to skip a critical step
- MEOW writes code that fails lint/type check and can't self-fix

---

## Installation

```bash
git clone https://github.com/stancsz/meow.git /tmp/meow
cd /tmp/meow
npm install -g .

# Verify
meow --version
```

**Requirements:** Node.js + npm. Bun is NOT supported (better-sqlite3 native addons require Node).

---

## Usage

### Primary: `meow -p` (headless, no TTY required)

```bash
meow -p "add pytest configuration to pyproject.toml"
```

- No TTY required — stdout output, background-friendly
- MEOW gets 3 retry attempts via its own LLM loop
- On 3rd failure → calls `fixMeow()` → runs `claude -p` to patch MEOW
- After fix: user re-invokes same task → MEOW retries and succeeds

### Interactive modes (TTY required)

```bash
meow           # REPL mode — interactive
meow --tui     # TUI mode — 4-panel blessed layout
```

### One-shot with piped input

```bash
echo "fix the auth bug" | meow
```

---

## How to Drive MEOW from Hermes

**Step 1: MEOW tries up to 3 times**
```bash
meow -p "add CI/CD workflow to the repo"
```

**Step 2: If it fails 3 times — CLAUDE fixes MEOW (NOT the task)**
```
MEOW has tried 3 times and is stuck on 'add pytest config'.
Root cause: MEOW doesn't know the pyproject.toml [tool.pytest] section format.
Fix MEOW's skill or prompt so it knows this. Then MEOW retries and completes.
```

**What `claude -p` does when called:**
- Analyzes MEOW's failure pattern
- Fixes the root cause (missing skill, bad prompt, broken tool)
- Does NOT write the files for the original task
- MEOW then retries and succeeds

---

## Execution Modes

| Mode | Description |
|------|-------------|
| `SHIP` | Fully autonomous — L1 plans + L2 executes, no interruptions |
| `SEQUENTIAL` | L1 → L2 step-by-step, waits for confirmation between steps |
| `PARALLEL` | L1 decomposes, L2 executes subtasks concurrently |
| `AUDIT_ONLY` | L1 analyzes without executing — dry run |

---

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | API key for LLM calls | required |
| `ANTHROPIC_BASE_URL` | Custom API endpoint | MiniMax gateway |
| `ANTHROPIC_MODEL` | Model name | claude-sonnet-4 |
| `MEOW_DB` | SQLite database path | `~/.meow/meow.db` |

---

## Key Source Files

| File | Purpose |
|------|---------|
| `src/index.ts` | CLI entry + `-p`/`--plan` headless mode detection |
| `src/agent/agent.ts` | MEOW-3-RULE: 3-retry loop + `fixMeow()` + `suggestUpstreamContribution()` |
| `src/cli/tui.ts` | TUI — 4-panel blessed layout |
| `src/orchestrator/Orchestrator.ts` | L1 orchestrator — task execution, phase tracking |
| `src/db/database.ts` | SQLite task persistence, WAL mode |

---

## TUI Slash Commands

| Command | Action |
|---------|--------|
| `/help` | Show command list |
| `/clear` | Clear output pane |
| `/abort` | Abort current task |
| `/mode <ship\|seq\|par\|audit>` | Switch execution mode |
| `/trace` | Toggle trace mode |
| `/tasks` | Show current task tree |
| `/exit` | Exit MEOW |

---

## Phase Tags

| Tag | Meaning |
|-----|---------|
| `[L1]` | Orchestrator reasoning/parsing |
| `[L2]` | Liaison/agent execution |
| `[BUILD]` | Writing files to disk |
| `[TEST]` | Running test suite |
| `[DONE]` | Task completed |
| `[ERROR]` | Task failed |
| `[ABORT]` | Task aborted |

---

## Decision Tree

| Situation | Approach |
|-----------|----------|
| Any coding task | **`meow -p` first** |
| `meow -p` fails × 3 | **`claude -p` to fix MEOW** (not the task) |
| Quick single-line fix | `terminal` with shell commands |
| Running a test, installing deps | `terminal` directly |
| MEOW dogfooding on a new repo | Series of `meow -p` + terminal verification |

---

## Limitations & Quirks

1. **No TTY = no REPL/TUI.** Use `meow -p` for headless environments.
2. **Git push via `git push` fails in headless.** Use GitHub REST API (blob → tree → commit → ref).
3. **delegate_task is broken** on MiniMax-M2-7 (HTTP 404). Use `meow -p` or `claude -p` directly.
4. **PR workflow**: Push to fork via API → create PR via API. Both need correct PAT scope.
5. **WSL path**: MEOW repo typically at `/tmp/meow`. Use absolute paths in scripts.
6. **delegate_task broken on MiniMax-M2-7**: HTTP 404 on all subagent calls. Use `meow -p` or `claude -p` directly instead.

---

## Bugs & Known Issues

### `npm run meow` fails — no such script

| | |
|---|---|
| **Symptom** | `npm run meow` → missing script |
| **Root cause** | Package.json has `start`, `dev`, `tui` — no `meow` script |
| **Workaround** | Use `meow -p` (headless) or `npm run tui` (interactive) |

### `npx ts-node` fails — command not found

| | |
|---|---|
| **Symptom** | `npx ts-node` → command not found |
| **Root cause** | Project uses `tsx`, not `ts-node` |
| **Workaround** | Use `npx tsx src/index.ts` |

### swarm260219 org blocks fine-grained PATs with lifetime >366 days

| | |
|---|---|
| **Symptom** | `curl` to `api.github.com/repos/swarm260219/...` → `403 Resource not accessible` |
| **Root cause** | swarm260219 org policy rejects fine-grained PATs with validity >366 days. Classic PATs have no such restriction |
| **Workaround** | Use the classic PAT for swarm260219 org repos; use fine-grained PAT only for User repos that require it |
| **Status** | Known |

### TSC type errors pre-exist in tsconfig.json

| | |
|---|---|
| **Symptom** | `npx tsc --noEmit` shows errors (`esModuleInterop`, `module` target, etc.) before any changes |
| **Root cause** | `tsconfig.json` is missing `esModuleInterop: true` and has wrong `module` target |
| **Workaround** | Do NOT let pre-existing TSConfig errors block new PRs. All new code introduces zero new errors |
| **Status** | Known — tsconfig.json needs updating at the repo level |

### TUI renders as ASCII in non-interactive mode

| | |
|---|---|
| **Symptom** | `npm run tui` shows ASCII escape codes instead of rendered UI when run headless |
| **Root cause** | Blessed requires a real terminal (PTY). Running under `tsx` without a pseudo-terminal prevents terminal type detection |
| **Workaround** | Use `meow -p` for headless mode (no TTY required). The `-p` flag in `src/index.ts` bypasses the TUI entirely |
| **Status** | Known — `-p` headless mode is the correct interface for non-interactive use |

### After a self-repair: contribute to stancsz/meow

When `fixMeow()` succeeds and produces patches that modify `src/` files, MEOW prints a contribution banner suggesting the user share their evolution upstream.

The GitHub App (ID: 3737759) installed on stancsz/meow can create real PRs. Use it instead of PAT-based approaches.

---

## MEOW README Assessment

The MEOW README (`/tmp/meow/README.md`) has significant clarity and completeness issues:

### Problems

1. **Quantum realism**: Claims "real quantum circuit simulation via `quantum-circuit` library" — this is misleading. The quantum features (Grover's algorithm, Bell-state entanglement) are theatrical framing, not functional requirements for a coding agent. Most users don't need quantum memory to use MEOW.

2. **Bun mention**: "Built on Bun" in the README but the package.json scripts don't mention Bun and the skill explicitly warns "Bun is NOT supported." The README is out of sync with reality.

3. **No `meow -p` documented**: The README documents `npx tsx src/index.ts` and piped input, but not the `-p`/`--plan` flag that is now the primary headless interface.

4. **Quantum-inspired orchestration is the "secret sauce"**: If the user wants MEOW to actually USE quantum features, that's a very specific claim that needs real benchmarks, not marketing language.

5. **Quantum + sovereignty framing**: Overloaded with philosophical claims ("Sovereign AI Coding Agent", "2028 Frontier") that make it harder to understand what MEOW actually does.

### Verdict

The README is **not simple or clear** for someone who just wants to know "how do I use MEOW to write code?" It reads more like a manifesto than a tool guide.

**Recommendation for stancsz**: Rewrite the README to lead with `meow -p` and MEOW-3-RULE. Move the quantum features to an "Advanced" or "Internals" section, not the front-page marketing. The core value prop is: `meow -p "task"` = autonomous background coding agent. Lead with that.

---

## CLAUDE Skill Installability

Claude Code (v2.1.142) does **NOT** have a `claude skills install` or similar skill marketplace mechanism. The `--bare` flag mentions "Skills still resolve via /skill-name" but this refers to Claude's built-in skill resolution, not a user-facing skill marketplace.

To make MEOW a proper Claude-installable skill:

1. **CLAUDE.md pattern** (does work): Place a `CLAUDE.md` in the project root that describes MEOW. When Claude Code starts in that directory, it reads CLAUDE.md automatically. The README already contains a reference to this: "Before working in this project, run `claude 'Read .meow/skills/meow-setup/SKILL.md...'`.

2. **The `.meow/skills/meow-setup/SKILL.md` path**: This suggests stancsz intended a skill at `.meow/skills/meow-setup/SKILL.md` relative to the project root, but this path doesn't exist in the repo. It would be `.meow/skills/meow-setup/SKILL.md` (absolute: `/tmp/meow/.meow/skills/meow-setup/SKILL.md`).

3. **What actually works**: Create `CLAUDE.md` in the repo root that loads the Hermes MEOW skill via `/skill meow` or describes the MEOW-3-RULE directly.

**Recommendation**: If stancsz wants MEOW to be a proper Claude-installable skill, create `CLAUDE.md` in `/tmp/meow/` that says:

```markdown
# MEOW — Autonomous Coding Agent

Before working in this project, read the MEOW skill: /opt/data/skills/autonomous-ai-agents/meow/SKILL.md

## MEOW-3-RULE (never violate)

Task → meow -p "task" (3 retries) → if fails × 3 → claude -p "fix MEOW" (NOT the task)

## Quick start
meow -p "your task here"
```

This makes MEOW self-documenting when Claude Code opens the project.