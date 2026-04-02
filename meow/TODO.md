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

### 1.3 Session Sidecar
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
- [ ] Basic compact (keep last N messages + summary)
- [ ] Auto-resume from last session

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

- [ ] Create `permissions.ts` sidecar
- [ ] Pattern matching (tool + optional regex)
- [ ] Three actions: allow, deny, ask
- [ ] Interactive prompt for `ask`
- [ ] Load from `.meow/permissions.json`

### 2.2 Abort/Interrupt Sidecar
**Problem:** Can't cancel a running operation.
**Solution:** AbortController propagation.

- [ ] Create `interrupt.ts` sidecar
- [ ] SIGINT handler (Ctrl+C)
- [ ] Timeout support per tool
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

- [ ] Create `slash-commands.ts` sidecar
- [ ] Command parser (regex or string match)
- [ ] Built-in commands
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
├── cli/index.ts              # CLI entry
└── src/
    ├── core/
    │   ├── lean-agent.ts    # ~227 lines (with sidecar integration)
    │   ├── task-store.ts    # ✅ File-based task store
    │   └── session-store.ts # ✅ JSONL session persistence
    ├── sidecars/
    │   ├── tool-registry.ts # ✅ Tools: read, write, edit, shell, git
    │   └── mcp-client.ts    # ✅ MCP protocol client
    ├── skills/
    │   ├── index.ts        # ✅ Skill exports
    │   ├── loader.ts       # ✅ Skill loader
    │   ├── simplify.ts     # ✅ /simplify skill
    │   ├── review.ts       # ✅ /review skill
    │   └── commit.ts       # ✅ /commit skill
    └── tools/
        └── search.ts        # ✅ glob, grep

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

### Current State (2026-04-02)
**Maturity Score: 4/10**

Implemented sidecars:
- [x] **tool-registry** ✅ — read, write, edit, shell, git, glob, grep
- [x] **mcp-client** ✅ — MCP protocol client
- [x] **task-store** ✅ — file-based task persistence
- [x] **session-store** ✅ — JSONL session persistence
- [x] **skills** ✅ — simplify, review, commit

Missing sidecars:
- [ ] **session** — compact/resume (P0)
- [ ] **permissions** — pattern rules (P1)
- [ ] **interrupt** — SIGINT, timeouts (P1)
- [ ] **slash-commands** — /help, /plan, /resume (P1)
- [ ] **repl** — interactive mode (P2)
- [ ] **memory** — user memory (P3)
- [ ] **hooks** — pre/post tool hooks (P4)
- [ ] **tui** — rich terminal UI (P4)
- [ ] **analytics** — usage tracking (P5)

### Next Action
**P0: Session sidecar** — Compact and auto-resume

```bash
# Immediate todo:
mkdir -p meow/src/sidecars/session.ts
# Add compact() and auto-resume
```

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
