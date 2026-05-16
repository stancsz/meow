# MEOW TUI Specification

## Current Problems

- Single flat log pane + input — no structure visibility
- No task progress tracking
- No streaming feedback during L1/L2 processing
- Awkward command parsing with `/` slash commands only
- No keyboard shortcuts (except ESC/q/C-c)
- Status header is static, updated only at start/end
- Scrollback is a raw `blessed.log` — can't search or filter
- No way to see what the orchestrator is doing mid-flight
- No readline history, no tab completion
- Aborting a running task is not possible
- REPL and TUI have overlapping but different command sets

---

## Design Principles

1. **Always show what's happening** — user should never wonder "is it still working?"
2. **Streaming with structure** — stream tokens to output pane, but show hierarchy via indentation and color
3. **Abort must be first-class** — long-running L2 tasks must be cancelable without killing the terminal
4. **Commands are discoverable** — type `/` or `?` to see available slash commands
5. **Progressive disclosure** — show detail on demand, summary by default

---

## Layout (6-row grid, 12 columns)

```
┌──────────────────────────────────────────────────────────────┐
│ HEADER (row 0, 1 row)                                       │
│ MEOW | Sovereign Orchestrator | L1: Liaison | L2: Architect │
├──────────────┬───────────────────────────────────────────────┤
│ TASK TREE    │ OUTPUT PANE (10 rows)                         │
│ (cols 0-3)   │                                               │
│              │ [Streaming agent output, scrollable]         │
│ [Task list]  │                                               │
│              │                                               │
├──────────────┴───────────────────────────────────────────────┤
│ INPUT (row 11, 1 row)  — command input with prompt           │
├──────────────────────────────────────────────────────────────┤
│ STATUS BAR (row 11, 1 row) — mode, tokens, time, shortcuts   │
└──────────────────────────────────────────────────────────────┘
```

Actually: use 3 zones:
- **Top bar**: Header (1 row)
- **Middle**: Task Tree (3 cols, 10 rows) + Output Pane (9 cols, 10 rows)
- **Bottom**: Input line + Status bar (2 rows total)

---

## Header Bar

Content: `MEOW | {mode} | {status} | {task count} tasks | {elapsed}`

- Mode colors: `SHIP={green}`, `SEQUENTIAL={yellow}`, `PARALLEL={cyan}`, `LIAISON_ONLY={dim}`
- Status: `READY | PARSING | ORCHESTRATING | REVIEWING | DONE | ERROR`

---

## Task Tree Panel (left sidebar)

Use `blessed-contrib.tree` to show task hierarchy:

```
▼ Orchestration: "implement auth"
  ├── [running] Parse intent
  ├── [pending] Plan subtasks
  ├── [pending] Execute subtasks
  ├── [pending] Self-review
  └── [pending] Deliver result
```

States: `pending` (dim), `running` (cyan pulse), `done` (green ✓), `failed` (red ✗)

When task completes, auto-collapse children and show summary line.
Expandable via Enter key.

Task decomposition updates this live as L2 decomposes the task.

---

## Output Pane (main area)

- `blessed.log` with ANSI color support
- Streaming text appended as it arrives (never overwrites)
- Auto-scroll to bottom unless user has scrolled up
- Distinct styling for different message types:
  - `>> user input`: bold white
  - `{{ L1: Liaison }}`: cyan
  - `{{ L2: Architect }}`: yellow
  - `{{ L3: Swarm }}`: magenta
  - `{{ L4: Auditor }}`: dim
  - `[STEP]`: bold
  - `[DONE]`: green
  - `[ERROR]`: red
  - `[WARN]`: yellow
- Search: `Ctrl+F` opens search bar at bottom, highlights matches
- Scroll: Up/Down arrows or mouse wheel
- Copy: `Ctrl+Shift+C` copies selected text

---

## Input Line

- Single-line `blessed.textbox`, `inputOnFocus: true`
- Prompt: `>> ` in cyan
- Command history: Up/Down arrows (readline-style, persisted to `~/.meow/history`)
- Tab completion: complete `/` commands and file paths
- On submit:
  1. Echo user input to output pane as `>> {text}`
  2. Clear input
  3. Process command
  4. Return focus to input

---

## Slash Commands

All accessed via `/command` syntax from input line.

| Command | Description |
|---------|-------------|
| `/help` or `/?` | Show command palette overlay |
| `/clear` | Clear output pane |
| `/abort` | Abort current task |
| `/status` | Show orchestrator + queue status |
| `/files` | Show files in context |
| `/mode <mode>` | Set execution mode: ship/sequential/parallel/liaison |
| `/parallel` | Toggle parallel execution mode |
| `/trace` | Toggle detailed trace mode |
| `/history` | Show command history |
| `/exit` | Exit TUI |
| `/model <name>` | Switch model mid-session |
| `/reset` | Reset context, clear history |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+C` | Abort current task (with confirmation if running) |
| `Ctrl+L` | Clear output |
| `Ctrl+F` | Search output pane |
| `Ctrl+H` | Toggle task tree sidebar |
| `Ctrl+U` | Clear input line |
| `Esc` | Close overlay/cancel current operation |
| `Tab` | Focus output pane (read-only scroll) |
| `Enter` | When task tree focused: expand/collapse node |

---

## Status Bar (bottom)

`[SHIP] [tokens: 12,341] [elapsed: 0:42] [tasks: 5/8] | Ctrl+C: abort | ?: help | /: commands`

- Updates every second during task execution
- Token count from Orchestrator metrics
- Task count from TaskQueue state

---

## Streaming Architecture

The TUI subscribes to a `TUIEventEmitter` that the Orchestrator and Liaison emit:

```typescript
interface TUIEvent {
  type: 'task_start' | 'task_update' | 'task_done' | 'stream_token' |
        'status_change' | 'error' | 'info' | 'decomposition' | 'abort_signal';
  payload: any;
  timestamp: number;
}
```

The TUI does NOT call `process.stdout.write` directly during streaming —
all output goes through the output pane with proper ANSI tagging.

---

## Abort Flow

1. User presses `Ctrl+C`
2. TUI sends `abort` signal via `Orchestrator.abort()` or `Agent.abort()`
3. Orchestrator cancels in-flight sub-tasks (sets a `AbortController` flag)
4. Output pane shows `[ABORTED]` in red
5. Status resets to `READY`

---

## Testing Strategy

- Unit tests use `createHeadlessTUI()` with mock Agent
- Streaming simulated via direct `tui.emit()` calls
- Command parsing tested via `tui.handleCommand()`
- Abort flow tested via mock orchestrator that respects abort signal

---

## Files to Change

- `src/cli/tui.ts` — complete rewrite
- `src/cli/tui-events.ts` — new event emitter type
- `src/orchestrator/Orchestrator.ts` — wire TUIEventEmitter into `onStatus`
- `src/agent/agent.ts` — expose `abort()` method
- `tests/unit/tui.test.ts` — update for new API
- `tests/utils/tui-harness.ts` — update for new API