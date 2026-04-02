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
- [x] Lean agent loop (~80 lines)
- [x] Core tools: read, write, shell, git
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
- [x] Built-in tools in registry (read, write, shell, git) ✅
- [x] Search tools loaded from `src/tools/search.ts` ✅
- [ ] Hot-reload from `.meow/tools/` (future enhancement)
- [ ] Move `glob`, `grep` to `.meow/tools/` (future enhancement)

### 1.3 Session Sidecar
**Problem:** No resume, no history truncation.
**Solution:** Session manager sidecar with compact.

```typescript
// meow/src/sidecars/session.ts
interface SessionStore {
  save(messages: Message[]): void
  load(id: string): Message[]
  compact(messages: Message[]): Message[]  // summarize + truncate
  resume(id: string): Message[]
}
```

- [ ] Create `session.ts`
- [ ] JSONL persistence
- [ ] Basic compact (keep last N messages + summary)
- [ ] Resume from last session

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

### 3.2 Task Sidecar
**Problem:** No task tracking.
**Solution:** File-based task store.

- [ ] Create `task-store.ts` sidecar (already exists, wire it up)
- [ ] `/add <task>` — add task
- [ ] `/done <id>` — complete task
- [ ] Task persistence in `.meow/tasks.json`

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

- [ ] Create `mcp-client.ts` sidecar
- [ ] stdio-based MCP server communication
- [ ] Tool conversion (MCP → Meow format)
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

## File Structure (Target)

```
meow/
├── cli/index.ts              # CLI entry
└── src/
    ├── core/
    │   ├── lean-agent.ts    # ~100 lines (FROZEN)
    │   └── loader.ts        # Sidecar loader
    └── sidecars/
        ├── tool-registry.ts
        ├── session.ts
        ├── permissions.ts
        ├── interrupt.ts
        ├── slash-commands.ts
        ├── task-store.ts
        ├── repl.ts
        ├── mcp-client.ts
        ├── skills.ts
        ├── memory.ts
        ├── hooks.ts
        └── tui.ts

.meow/                       # User config (gitignored)
├── tools/                   # Custom tools
├── skills/                  # Custom skills
├── commands/                # Custom commands
├── sidecars/                # Custom sidecars
├── permissions.json
├── mcp.json
└── memory/
    └── user.json
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
- [x] Core loop (~60 lines, frozen)
- [x] Basic tools (read, write, shell, git) in tool-registry
- [x] Search tools (glob, grep) loaded from sidecar
- [x] Tool-registry sidecar (meow/src/sidecars/tool-registry.ts)
- [x] Skills system (simplify, review, commit)
- [x] Slash commands in CLI
- [x] AbortController for Ctrl+C interruption
- [x] Multi-provider LLM (MiniMax-M2.7 default)
- [x] Session store with JSONL persistence
- [x] Task store
- [x] Tests (capability-matrix, integration-parity, gaps, sidecar-architecture)

### Next Action
**P1: Permissions sidecar** — Pattern matching for tools

```bash
# Immediate todo:
mkdir -p meow/src/sidecars/permissions.ts
# Pattern matching rules (allow/deny/ask)
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
