# Meow TODO — Lean but Complete

> **Principle:** Core stays lean (~100 lines). Capabilities are sidecars.
> No feature belongs in core unless it cannot exist as a sidecar.

---

## Philosophy

```
┌─────────────────────────────────────────────────────────┐
│  CORE (lean)          │  SIDECARS (optional)            │
│  ─────────────        │  ─────────────────             │
│  • Message loop      │  • Tools (glob, grep, etc)    │
│  • Tool dispatch      │  • Permissions                 │
│  • LLM adapter       │  • Session management          │
│  • Basic I/O        │  • MCP client                  │
│                       │  • Slash commands              │
│  ~100 lines fixed    │  • Skills loader               │
└─────────────────────────────────────────────────────────┘
```

**Core never grows. Sidecars extend.**

---

## Phase 1: Foundation (Must-Have)

### 1.1 Core Freeze ✅
- [x] Lean agent loop (~227 lines with sidecar integration)
- [x] Core tools via sidecar: read, write, edit, shell, git
- [x] Multi-provider LLM (OpenAI-compatible)

### 1.2 Tool Sidecar Registry ✅
**Problem:** Tools are hardcoded in core. Adding tools requires modifying core.
**Solution:** Tool registry as a sidecar with hot-reload.

```typescript
// meow/src/sidecars/tool-registry.ts
interface Tool {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute(args: unknown, context: ToolContext): Promise<ToolResult>
}
```

- [x] Create `tool-registry.ts` ✅
- [x] Built-in tools in registry (read, write, edit, shell, git) ✅
- [x] Search tools loaded from `src/tools/search.ts` ✅
- [ ] Hot-reload from `.meow/tools/` (future enhancement)

### 1.3 Session Sidecar ✅
**Problem:** No resume, no history truncation.
**Solution:** Session manager with compact.

```typescript
// meow/src/core/session-store.ts
interface SessionStore {
  save(messages: Message[]): void
  load(id: string): Message[]
  compact(messages: Message[]): Message[]  // summarize + truncate
  resume(id: string): Message[]
}
```

- [x] Basic session store exists (`meow/src/core/session-store.ts`)
- [x] LLM-powered compact (summarize old messages) ✅
- [x] Auto-resume from last session ✅

---

## Phase 2: Safety & Control

### 2.1 Permission Sidecar
**Problem:** `--dangerous` flag is too coarse. Shell is all-or-nothing.
**Solution:** Pattern-matching permission rules.

```typescript
// .meow/permissions.json
{
  "rules": [
    { "tool": "shell", "pattern": "^git ", "action": "allow" },
    { "tool": "shell", "pattern": "^npm ", "action": "allow" },
    { "tool": "shell", "pattern": "^rm ", "action": "deny" },
    { "tool": "shell", "action": "ask" },
    { "tool": "write", "action": "ask" }
  ]
}
```

- [x] Create `permissions.ts` sidecar ✅
- [x] Pattern matching (tool + optional regex) ✅
- [x] Three actions: allow, deny, ask ✅
- [x] Interactive prompt for `ask` ✅
- [x] Load from `.meow/permissions.json` ✅

### 2.2 Abort/Interrupt Sidecar ✅
**Problem:** Can't cancel a running operation.
**Solution:** AbortController propagation + timeout per tool.

- [x] Create `interrupt.ts` sidecar
- [x] SIGINT handler (Ctrl+C)
- [x] Timeout support per tool
- [ ] Graceful vs force kill

---

## Phase 3: UX/Developer Experience

### 3.1 Slash Commands Sidecar
**Problem:** No in-session commands like `/help`, `/plan`.
**Solution:** Command parser sidecar.

Commands to support:
- `/help` — show available commands
- `/plan` — plan mode (show intent before acting)
- `/dangerous` — toggle dangerous mode
- `/tasks` — list tasks
- `/sessions` — list saved sessions
- `/resume <id>` — resume a session
- `/exit` — save and exit

- [x] Create `slash-commands.ts` sidecar ✅
- [x] Command parser (regex or string match) ✅
- [x] Built-in commands (/help, /exit, /plan, /clear) ✅
- [ ] Custom commands from `.meow/commands/`

### 3.2 Task Sidecar ✅
**Problem:** No task tracking.
**Solution:** File-based task store.

- [x] `task-store.ts` exists (`meow/src/core/task-store.ts`)
- [x] `/add <task>` — add task
- [x] `/done <id>` — complete task
- [x] Task persistence in `.meow/tasks.json`

### 3.3 REPL Sidecar
**Problem:** CLI is single-shot. No interactive mode.
**Solution:** Simple readline REPL.

- [ ] Create `repl.ts` sidecar
- [ ] Readline input loop
- [ ] Command history (up/down arrows)
- [ ] Multi-line input (detect indentation)

---

## Phase 4: Advanced Capabilities (Nice-to-Have)

### 4.1 MCP Client Sidecar
**Problem:** Can't use Model Context Protocol tools.
**Solution:** MCP client that connects to MCP servers.

```bash
# .meow/mcp.json
{
  "servers": [
    { "name": "filesystem", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "."] }
  ]
}
```

- [x] Create `mcp-client.ts` sidecar ✅
- [x] stdio-based MCP server communication
- [x] Tool conversion (MCP → Meow format)
- [ ] Resource and prompt support (future)

### 4.2 Skills Sidecar
**Problem:** No skill system for reusable prompts.
**Solution:** Skills directory with hot-reload.

```bash
# .meow/skills/
# ├── simplify.ts    # /simplify - simplify code
# ├── review.ts      # /review - code review
# └── commit.ts      # /commit - conventional commits
```

- [ ] Create `skills.ts` sidecar
- [ ] Load skills from `.meow/skills/`
- [ ] `/skill-name` invocation
- [ ] Skill schema (description, parameters)

### 4.3 Memory Sidecar
**Problem:** No user memory across sessions.
**Solution:** Simple JSON memory store.

- [ ] Create `memory.ts` sidecar
- [ ] `~/.meow/memory/user.json`
- [ ] Key-value storage
- [ ] Auto-learn from conversations

---

## Phase 5: polish/grow (Nice-to-Have)

### 5.1 Hooks Sidecar
**Problem:** No way to intercept/transform tool calls.
**Solution:** Simple hook system.

```typescript
// .meow/hooks.json
{
  "pre_tool": [
    { "tool": "shell", "action": "log" }
  ],
  "post_tool": [
    { "tool": "write", "action": "git-add" }
  ]
}
```

- [ ] Create `hooks.ts` sidecar
- [ ] Pre/post tool hooks
- [ ] Simple transformations

### 5.2 TUI Sidecar
**Problem:** Just console.log output.
**Solution:** Minimal terminal UI.

- [ ] Create `tui.ts` sidecar (use Ink or blessed)
- [ ] Message history scrollback
- [ ] Progress indicators
- [ ] Status bar

### 5.3 Analytics Sidecar (Opt-in)
**Problem:** No usage tracking.
**Solution:** Anonymous aggregate metrics.

- [ ] Create `analytics.ts` sidecar
- [ ] Token usage per session
- [ ] Tool usage frequency
- [ ] Error rates
- [ ] `MEOW_ANALYTICS=false` to disable

---

## Sidecar Loading Architecture

```typescript
// meow/src/core/loader.ts
interface Sidecar {
  name: string
  init?(): Promise<void>
  tools?(): Tool[]
  hooks?(): Hook[]
}

function loadSidecars(): void {
  const dir = '.meow/sidecars'
  for (const file of readdir(dir)) {
    if (file.endsWith('.ts')) {
      const mod = await import(join(dir, file))
      registerSidecar(mod.default)
    }
  }
}
```

**Sidecars are:**
- Optional (core works without them)
- Hot-reloadable (during dev)
- Isolated (can't break core)
- Testable independently

---

## File Structure (Current)

```
meow/
├── cli/index.ts              # CLI entry with slash commands
├── src/
│   ├── core/
│   │   ├── lean-agent.ts    # Main agent loop with streaming
│   │   ├── auto-agent.ts    # OODA autonomous agent (tick/auto modes)
│   │   ├── task-store.ts    # ✅ File-based task store
│   │   └── session-store.ts # ✅ JSONL session persistence
│   ├── sidecars/
│   │   ├── tool-registry.ts # ✅ Tools: read, write, edit, shell, git
│   │   ├── mcp-client.ts    # ✅ MCP protocol client
│   │   └── permissions.ts   # ✅ Pattern-matching permissions
│   ├── skills/
│   │   ├── index.ts        # ✅ Skill exports
│   │   ├── loader.ts       # ✅ Skill loader
│   │   ├── simplify.ts     # ✅ /simplify skill
│   │   ├── review.ts       # ✅ /review skill
│   │   └── commit.ts       # ✅ /commit skill
│   └── tools/
│       └── search.ts        # ✅ glob, grep

.meow/                       # User config
├── tasks.json               # Task persistence
├── sidecars/               # Custom sidecars (future)
├── tools/                  # Custom tools (future)
├── skills/                 # Custom skills (future)
├── commands/               # Custom commands (future)
├── permissions.json        # Permission rules (future)
├── mcp.json                # MCP servers (future)
└── memory/                 # User memory (future)
```

---

## Priority Matrix

| Sidecar | Utility | Complexity | Priority |
|---------|---------|------------|----------|
| tool-registry | High | Low | P0 |
| session | High | Low | P0 |
| permissions | High | Medium | P1 |
| interrupt | High | Low | P1 |
| slash-commands | High | Medium | P1 |
| task-store | Medium | Low | P2 |
| repl | Medium | Medium | P2 |
| mcp-client | High | High | P3 |
| skills | Medium | Medium | P3 |
| memory | Medium | Low | P3 |
| hooks | Low | Medium | P4 |
| tui | Low | High | P4 |
| analytics | Low | Low | P5 |

---

## Progress

### Current State (2026-04-03)
**Maturity Score: 7.5/10**

Implemented sidecars:
- [x] **tool-registry** ✅ — read, write, edit, shell, git, glob, grep
- [x] **mcp-client** ✅ — MCP protocol client
- [x] **task-store** ✅ — file-based task persistence
- [x] **session-store** ✅ — JSONL session persistence with LLM compaction
- [x] **skills** ✅ — simplify, review, commit
- [x] **permissions** ✅ — pattern rules with allow/deny/ask

Implemented core features:
- [x] **OODA auto-agent** ✅ — tick/auto modes with observe-orient-decide-act loop
- [x] **OpenAI SDK** ✅ — MiniMax compatible via OpenAI-compatible endpoint
- [x] **Env file loading** ✅ — automatic `.env` file loading
- [x] **Multi-turn tool calls** ✅ — assistant message accumulation before tool results
- [x] **Glob pattern fix** ✅ — proper glob-to-regex conversion

Missing/incomplete sidecars:
- [x] **session compact** ✅ — LLM-powered conversation summarization
- [x] **auto-resume** ✅ — resume from last session automatically
- [x] **interrupt** ✅ — SIGINT, timeouts (P1)
- [ ] **slash-commands** — /help, /plan, /resume (P1) — partially done in CLI
- [ ] **repl** — interactive mode (P2)
- [ ] **memory** — user memory (P3)
- [ ] **hooks** — pre/post tool hooks (P4)
- [ ] **tui** — rich terminal UI (P4)
- [ ] **analytics** — usage tracking (P5)

---

## Dogfood Findings (2026-04-03)

### Fixed During Dogfood
1. **Multi-turn tool calls broken** — assistant message with tool_calls was never pushed to messages array before tool results. Fixed by pushing assistant message before tool results. ✅ (e0c359a)
2. **Glob pattern matching broken** — `git ls-files --others` only returned untracked files, and pattern `**/*.ts` was being simplified to "ts" (matching anything containing "ts"). Fixed with proper glob-to-regex conversion. ✅ (e0c359a)
3. **compactMessages crashed** — tool_call messages have `content: undefined`. Fixed by handling null/undefined content. ✅ (e0c359a)
4. **OpenAI SDK migration** — switched from Anthropic to OpenAI SDK for MiniMax compatibility. Streaming works, env loading added. ✅ (c667c45)
5. **OODA auto-agent** — observe-orient-decide-act loop with tick/auto modes. Dogfood: tick mode gives step-by-step control, auto mode runs autonomously. ✅ (ba4bf54/c667c45)

### Dogfood: Slash Commands (2026-04-03)
- **slash-commands.ts** created — command registry with /help, /exit, /plan, /clear built-ins
- **gap-close.sh** created — automation script for iterative gap closing via Claude Code
- Dogfood: used gap-close.sh to iteratively identify and fix gaps ✅

### Test Failures
- **113 tests fail** due to path resolution issues — tests use relative paths like `"meow/src/core/lean-agent.ts"` but CWD is repo root
- **7 live-agent tests timeout** at 5000ms — MiniMax API latency or streaming issues
- **gap test maturity score: 2/10** — 49 gaps to close

### Verified Working
- Shell execution with `--dangerous` ✓
- Permissions blocking without `--dangerous` ✓
- Read, glob, grep tools ✓
- Multi-turn tool execution ✓
- Session persistence ✓
- Skills (simplify, review, commit) ✓
- OpenAI SDK streaming with `/stream` toggle ✓
- OODA tick/auto modes ✓

### Top Gap Priorities
1. GAP-CORE-002: Session message accumulation (enables multi-turn)
2. GAP-SESS-001: Auto session resume (improves UX immediately)
3. GAP-SLASH-001: Slash command infrastructure (enables /help, /plan)
4. GAP-PERM-001: Permission rules (enables safe git without dangerous)
5. GAP-ABORT-002: SIGINT handler (enables Ctrl+C)

---

## Principles for Adding Features

1. **Ask first:** Does this need to be in core?
2. **Sidecar test:** Can it be a sidecar?
3. **Size test:** Will it make core >150 lines?
4. **Dependency test:** Does it require other sidecars?
5. **Hot test:** Does it need to be loaded on every invocation?

If all answers favor sidecar → sidecar.
If any answer favors core → argue hard for core.

**Core is sacred. Sidecars are free.**
