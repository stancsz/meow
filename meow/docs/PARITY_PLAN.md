# Meow Parity Plan — Path to Claude Code Equivalence

> **Honest Assessment (2026-04-02, post-dogfood): ~45-50% of Claude Code's capabilities**
> Architecture: 75% | Core Functionality: 50% | UX: 25% | Security: 60%

## Implementation Score (Updated: 2026-04-02 - Post Permissions Sidecar)

| Category | Score | Status |
|----------|-------|--------|
| Core Loop | 75% | ✅ Streaming, ✅ Message accumulation, ✅ Context compaction |
| File Tools | 80% | read, write, edit, git, glob, grep |
| Shell Tool | 70% | ✅ Pattern permissions, ✅ --dangerous guard, ✅ SIGINT abort |
| Task System | 30% | ✅ Store + CLI commands, no kill/monitor/named tasks |
| Session System | 60% | ✅ Store + fork + auto-resume + --resume flag |
| Skills System | 50% | ✅ 3 skills (simplify, review, commit), dynamic loading from .meow/skills |
| MCP Client | 30% | Client exists, not auto-loaded |
| Abort Handling | 75% | ✅ Streaming abort, ✅ SIGINT handler, ✅ AbortController propagation |
| Slash Commands | 90% | ✅ /help, /exit, /clear, /plan, /dangerous, /stream, /tasks, /sessions, /resume, /skills, /add, /done |
| Permissions | 75% | ✅ Pattern-matching rules, ✅ Default allow/deny/ask, ✅ ~/.meow/permissions.json |
| Rich TUI | 15% | ✅ ANSI colors, ✅ /stream toggle, ✅ Spinner, no scrollback |
| Budget/Cost | 0% | Not implemented |
| Sub-agents | 0% | Not implemented |
| Hooks System | 0% | Not implemented | |

---

## Parity Roadmap

### Phase 1: Core CLI Parity (Target: 50%) ✅ DONE

#### P1.1: Slash Commands in CLI ✅ DONE
**Files modified:** `meow/cli/index.ts`

Implemented commands:
- [x] `/help` - show all commands
- [x] `/exit` - save session and quit
- [x] `/clear` - clear screen and conversation
- [x] `/plan <task>` - plan mode with confirmation
- [x] `/dangerous` - toggle dangerous mode
- [x] `/stream` - toggle streaming mode
- [x] `/tasks` - list/add/complete tasks
- [x] `/sessions` - list sessions
- [x] `/resume` - resume specific session
- [x] `/skills` - list available skills

**Reference:** Claude Code `src/commands.ts` has ~80 slash commands

#### P1.2: Permission Pattern Rules ✅ DONE
**Files modified:** `meow/src/sidecars/permissions.ts`, `meow/src/sidecars/tool-registry.ts`

Implemented:
```typescript
interface PermissionRule {
  tool: string;        // "shell", "git", etc.
  pattern?: string;    // regex pattern like "^git "
  action: "allow" | "deny" | "ask";
}
```

✅ Default rules allow safe commands (git, npm, ls, cat), deny dangerous (rm, sudo), ask for others
✅ Load from `~/.meow/permissions.json`
✅ Pattern matching with regex

#### P1.3: Streaming Responses ✅ DONE
**Files modified:** `meow/src/core/lean-agent.ts`

Implemented:
- `runLeanAgentStream()` - async generator streaming
- `runLeanAgentSimpleStream()` - simplified streaming with onToken callback
- `/stream` CLI toggle for real-time token display

Reference: Claude Code `src/query.ts` streaming implementation

#### P1.4: Message Accumulation (Multi-turn) ✅ DONE
**Files modified:** `meow/cli/index.ts`, `meow/src/core/session-store.ts`

- ✅ Agent accumulates messages across turns in conversation array
- ✅ Session store with JSONL persistence at `~/.meow/sessions/`
- ✅ Fork session support
- ✅ `--resume` flag and `/resume` command

Reference: Claude Code session management

---

### Phase 2: Production Readiness (Target: 65%)

#### P2.1: Budget Tracking & Cost Display
**Files to modify:** `meow/src/core/lean-agent.ts`

Track:
- Input/output tokens per request
- Running cost estimate
- Display in CLI

Reference: Claude Code `src/core/cost-tracker.ts`

#### P2.2: Tool Result Validation
**Files to modify:** `meow/src/sidecars/tool-registry.ts`

- Validate tool input against JSON schema
- Zod integration for runtime validation
- Error handling for malformed results

#### P2.3: Session Auto-Resume
**Files to modify:** `meow/cli/index.ts`

- On startup, check for last session
- Offer to resume with preview
- `--continue` flag for CLI

Reference: Claude Code session resume logic

#### P2.4: Task Enhancements
**Files to modify:** `meow/src/core/task-store.ts`

- [ ] Task kill capability
- [ ] Named tasks (`/add "name: my-task"`)
- [ ] Task types (pending, in_progress, waiting, blocked)
- [ ] Task dependencies

Reference: Claude Code `src/tasks/` directory

---

### Phase 3: Feature Parity (Target: 80%)

#### P3.1: Sub-agent Spawning
**Files to add:** `meow/src/core/subagent.ts`

Implement AgentTool equivalent:
```typescript
interface SubAgent {
  id: string;
  prompt: string;
  spawn(): Promise<SubAgentResult>;
}
```

Reference: Claude Code `src/agents/` directory

#### P3.2: MCP Integration
**Files to modify:** `meow/src/sidecars/mcp-client.ts`

- [ ] Auto-load `~/.meow/mcp.json` on startup
- [ ] MCP resource support
- [ ] OAuth 2.0 authentication

Reference: Claude Code `src/mcp/` directory

#### P3.3: Dynamic Skill Loading
**Files to modify:** `meow/src/skills/loader.ts`

- [ ] Hot-reload skills from `.meow/skills/`
- [ ] Skill schema validation
- [ ] Usage tracking

#### P3.4: Hooks System
**Files to add:** `meow/src/core/hooks.ts`

Implement pre/post-tool hooks:
```typescript
interface ToolHook {
  beforeTool?: (tool: string, args: unknown) => unknown;
  afterTool?: (tool: string, result: ToolResult) => ToolResult;
  onCompact?: () => void;
}
```

Reference: Claude Code hooks configuration

---

### Phase 4: UX Excellence (Target: 90%)

#### P4.1: Rich TUI
**Files to modify:** `meow/cli/index.ts`

- [ ] History scrollback (up/down arrows)
- [ ] Tab completion for commands
- [ ] Progress indicators with percentages
- [ ] Status bar with session info
- [ ] Syntax highlighting

Reference: Claude Code readline/emacs bindings

#### P4.2: Interactive Confirmations
**Files to modify:** `meow/cli/index.ts`

- [ ] Destructive action confirmations
- [ ] Multi-line input support
- [ ] Yes/No prompts

#### P4.3: Context Compaction
**Files to modify:** `meow/src/core/lean-agent.ts`

- [ ] Auto-summarize when approaching limits
- [ ] `snipCompact` (trim history)
- [ ] `contextCollapse` (restructure)

Reference: Claude Code `HISTORY_SNIP` and compact logic

---

## File Reference Map

```
claude-code-source-code/
├── src/
│   ├── query.ts              # Main agent loop (785KB)
│   ├── Tool.ts               # Tool base class
│   ├── tools.ts              # Tool registry
│   ├── commands.ts            # All slash commands (~80)
│   ├── tasks/                 # Task system
│   │   ├── task-store.ts
│   │   └── task-list.ts
│   ├── agents/                # Sub-agents
│   ├── mcp/                   # MCP client
│   ├── utils/permissions/     # Permission rules
│   └── core/
│       ├── cost-tracker.ts
│       └── compact.ts
│
meow/
├── cli/index.ts              # CLI + REPL (needs slash commands)
├── src/
│   ├── core/
│   │   ├── lean-agent.ts     # Core loop (needs streaming)
│   │   ├── task-store.ts     # Task store (needs enhancements)
│   │   └── session-store.ts  # Session store (good base)
│   ├── sidecars/
│   │   ├── tool-registry.ts  # Needs permission rules
│   │   └── mcp-client.ts     # MCP client (needs auto-load)
│   └── skills/
│       ├── loader.ts         # Needs dynamic loading
│       ├── simplify.ts
│       ├── review.ts
│       └── commit.ts
```

---

## Quick Wins Order

**COMPLETED:**
- ✅ Streaming mode (`runLeanAgentSimpleStream`)
- ✅ Message accumulation (session context)
- ✅ Permission patterns (permissions.ts sidecar)
- ✅ Auto-resume session (`--resume` flag)
- ✅ Context compaction (auto-summarize at token limit)
- ✅ Slash commands (12 commands)

**Remaining:**
1. **Budget tracking** (2-3 hours) - cost control, token usage display
2. **Task enhancements** (3-4 hours) - named tasks, kill, dependencies
3. **MCP auto-load** (3-4 hours) - load from `~/.meow/mcp.json`
4. **Rich TUI** (6-8 hours) - scrollback, tab completion, syntax highlighting
5. **Sub-agents** (8+ hours) - AgentTool equivalent
6. **Hooks system** (4-5 hours) - pre/post tool hooks

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Test Coverage | 182 pass | 400+ pass |
| Capability Score | 25-30% | 80%+ |
| CLI Commands | 6 | 50+ |
| Tool Types | 7 | 40+ |

---

*Last updated: 2026-04-02 (post permissions sidecar)*
