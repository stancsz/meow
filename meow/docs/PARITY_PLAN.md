# Meow Parity Plan — Path to Claude Code Equivalence

> **Honest Assessment (2026-04-02): ~35-40% of Claude Code's capabilities**
> Architecture: 70% | Core Functionality: 40% | UX: 20% | Security: 15%

## Implementation Score (Updated: 2026-04-02)

| Category | Score | Status |
|----------|-------|--------|
| Core Loop | 50% | ✅ Streaming implemented, ✅ Message accumulation |
| File Tools | 80% | read, write, edit, git, glob, grep |
| Shell Tool | 50% | Works but only --dangerous guard |
| Task System | 20% | Store works, no kill/monitor/named |
| Session System | 50% | ✅ Store + fork + message accumulation |
| Skills System | 40% | 3 skills built, static loading |
| MCP Client | 30% | Client exists, not auto-loaded |
| Abort Handling | 50% | ✅ Streaming abort, SIGINT handler |
| Slash Commands | 80% | ✅ /help, /exit, /clear, /plan, /dangerous, /stream, /tasks, /sessions, /resume |
| Permissions | 30% | ✅ Basic permissions.ts exists, pattern rules pending |
| Rich TUI | 10% | Basic ANSI, /stream toggle, spinner |
| Budget/Cost | 0% | Not implemented |
| Sub-agents | 0% | Not implemented |

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

#### P1.2: Permission Pattern Rules
**Files to modify:** `meow/src/sidecars/tool-registry.ts`

Implement pattern-based permissions instead of all-or-nothing:
```typescript
interface PermissionRule {
  tool: string;        // "shell", "git", etc.
  pattern: RegExp;     // /^git (status|log|diff)$/
  allow: boolean;
}
```

Reference: Claude Code `src/utils/permissions/` directory

#### P1.3: Streaming Responses
**Files to modify:** `meow/src/core/lean-agent.ts`

Implement async generator streaming:
```typescript
async function* streamResponse(prompt: string, options: LeanAgentOptions): AsyncGenerator<string>
```

Reference: Claude Code `src/query.ts` streaming implementation

#### P1.4: Message Accumulation (Multi-turn)
**Files to modify:** `meow/cli/index.ts`, `meow/src/core/lean-agent.ts`

- Agent should accumulate messages across turns
- Load previous session context on resume
- Track conversation history

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

**Note:** CLI slash commands (`/help`, `/exit`, `/clear`, `/plan`, `/dangerous`, `/tasks`, `/sessions`, `/resume`) are **already implemented** in `meow/cli/index.ts`.

1. **Add streaming** (4-6 hours) - HIGHEST IMPACT
2. **Add message accumulation** (3-4 hours) - enables multi-turn
3. **Add budget tracking** (2-3 hours) - cost control
4. **Add permission patterns** (3-4 hours)
5. **Auto-resume session** (2-3 hours)

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Test Coverage | 182 pass | 400+ pass |
| Capability Score | 25-30% | 80%+ |
| CLI Commands | 6 | 50+ |
| Tool Types | 7 | 40+ |

---

*Last updated: 2026-04-02*
