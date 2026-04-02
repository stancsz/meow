# Claude Code Parity Analysis

> Research date: 2026-04-02
> Based on Claude Code v2.1.88 source code analysis

## Executive Summary

Claude Code's architecture is built around a **lean core engine** with sophisticated peripheral systems for bridge/transports, permissions, and extensibility. Meow should replicate the core execution model while simplifying the bridge layer (which is Anthropic-specific cloud infrastructure).

---

## Architecture Overview

### Core Components

```
QueryEngine (core query loop)
├── Task System (task dispatch/kill lifecycle)
├── Tool System (buildTool factory, Tool interface)
├── Message System (mutableMessages, streaming)
├── State Management (AppState bootstrap)
└── Hooks System (pre/post tool hooks)
```

### The Lean Core: QueryEngine

**File:** `src/QueryEngine.ts` (~1200 lines)

The QueryEngine is the heart of Claude Code. It uses an **async generator pattern** for streaming responses:

```typescript
async *submitMessage(prompt: string | ContentBlockParam[]): AsyncGenerator<SDKMessage>
```

**Key responsibilities:**
1. System prompt assembly (CLAUDE.md, tools, skills, agents)
2. Turn management and message accumulation
3. Tool use lifecycle (canUseTool → execute → render result)
4. Budget tracking (maxTurns, maxBudgetUsd)
5. Result extraction and session recording

**Why it's lean:**
- No UI concerns (QueryEngine is headless)
- Single responsibility: orchestrate the API call loop
- Async generator enables streaming without buffering
- Feature-gated modules (HISTORY_SNIP, COORDINATOR_MODE) via `feature()` DCE

### LLM Provider Support

Meow is **provider-agnostic** — supporting any OpenAI-compatible or Anthropic-compatible API:

```typescript
// Environment variables
LLM_API_KEY=sk-...           // API key (required)
LLM_BASE_URL=https://api.openai.com/v1  // or https://api.anthropic.com
LLM_MODEL=gpt-4o              // or claude-sonnet-4-20250514

// Provider auto-detection
type LLMProvider = 'openai' | 'anthropic' | '兼容模式'

function detectProvider(baseUrl: string): LLMProvider {
  if (baseUrl.includes('anthropic')) return 'anthropic'
  if (baseUrl.includes('openai')) return 'openai'
  return 'openai' // default to OpenAI-compatible
}
```

**Key differences by provider:**
| Provider | Base URL | Model Prefix | Notes |
|----------|----------|--------------|-------|
| OpenAI | `api.openai.com/v1` | gpt-4o, gpt-4-turbo | Standard OpenAI API |
| Anthropic | `api.anthropic.com` | claude- | Needs `anthropic-version: 2023-06-01` header |
| MiniMax | `api.minimax.io/v1` | MiniMax-Text-01 | OpenAI-compatible |
| Groq | `api.groq.com/openai/v1` | llama, mixtral | Fast inference |
| Fireworks | `api.fireworks.ai/v1` | fireworks-llama | High throughput |
| Ollama | `localhost:11434/v1` | llama3, mistral | Local models |
| LM Studio | `localhost:1234/v1` | any | Local models |

**Implementation:** Single `llm.ts` adapter that:
1. Normalizes request/response format per provider
2. Handles provider-specific headers
3. Maps model names if needed
4. Falls back gracefully on errors

### Task System

**File:** `src/Task.ts` (~125 lines)

Clean task abstraction with typed task IDs and lifecycle:

```typescript
type TaskType = 'local_bash' | 'local_agent' | 'remote_agent' | 'in_process_teammate' | 'local_workflow' | 'monitor_mcp' | 'dream'

type Task = {
  name: string
  type: TaskType
  kill(taskId: string, setAppState: SetAppState): Promise<void>
}
```

**Task ID format:** `{prefix}{8 random chars}` (e.g., `b1a2b3c4d`)
- Prefixes: `b`=bash, `a`=agent, `r`=remote, `t`=teammate, `w`=workflow, `m`=monitor, `d`=dream

**Key insight:** Tasks are **fire-and-forget** with explicit kill support. The orchestrator doesn't track task output directly—output goes to files.

---

## Tool System Architecture

**File:** `src/Tool.ts` (~800 lines)

### The Tool Interface

Claude Code's tool system is comprehensive but well-structured:

```typescript
type Tool<Input, Output, P extends ToolProgressData> = {
  // Core
  name: string
  inputSchema: z.ZodType
  call(args, context, canUseTool, parentMessage, onProgress): Promise<ToolResult<Output>>

  // Metadata
  description(input, options): Promise<string>
  aliases?: string[]
  searchHint?: string  // keyword matching for ToolSearch

  // Behavior
  isConcurrencySafe(input): boolean
  isReadOnly(input): boolean
  isDestructive?(input): boolean
  interruptBehavior?(): 'cancel' | 'block'
  isSearchOrReadCommand?(input): { isSearch, isRead, isList }

  // Rendering
  renderToolResultMessage(content, progressMessages, options): React.ReactNode
  renderToolUseMessage(input, options): React.ReactNode
  renderToolUseProgressMessage(progressMessages, options): React.ReactNode

  // Permissions
  validateInput?(input, context): Promise<ValidationResult>
  checkPermissions(input, context): Promise<PermissionResult>
  preparePermissionMatcher?(input): Promise<(pattern) => boolean>

  // Limits
  maxResultSizeChars: number  // persist to disk if exceeded
  shouldDefer?: boolean  // ToolSearch required before call
  alwaysLoad?: boolean  // always show in initial prompt
}
```

### buildTool Factory

```typescript
const TOOL_DEFAULTS = {
  isEnabled: () => true,
  isConcurrencySafe: (_) => false,
  isReadOnly: (_) => false,
  isDestructive: (_) => false,
  checkPermissions: (_, __) => ({ behavior: 'allow', updatedInput: _ }),
  toAutoClassifierInput: (_) => '',
  userFacingName: (_) => '',
}

function buildTool<D extends ToolDef>(def: D): BuiltTool<D>
```

### Meow Implementation Priorities

**Must have (parity核心):**
1. `Read` - file reading with limits
2. `Write` / `Edit` - file modification
3. `Bash` - shell execution
4. `Glob` - file discovery
5. `Grep` - content search

**Should have (agent capability):**
6. `NotebookEdit` - Jupyter notebook support
7. `WebSearch` - internet access
8. `TodoWrite` / `TodoRead` - task tracking
9. `AgentTool` - spawn sub-agents
10. `SkillTool` - invoke skills

**Nice to have (full parity):**
11. `MCP` - Model Context Protocol tools
12. `REPL` - interactive shell wrapper
13. `MemDir` - memory/CLAUDE.md loading

---

## State Management

**File:** `src/bootstrap/state.ts` (~1750 lines)

### AppState Structure

```typescript
type State = {
  // Identity
  sessionId: SessionId
  parentSessionId?: SessionId  // for plan→implement tracking
  originalCwd: string
  projectRoot: string  // stable, never mid-session EnterWorktreeTool

  // Usage tracking
  totalCostUSD: number
  totalAPIDuration: number
  totalToolDuration: number
  turnToolCount: number
  modelUsage: { [model: string]: ModelUsage }
  totalLinesAdded/Removed: number

  // Session state
  isInteractive: boolean
  kairosActive: boolean
  sessionPersistenceDisabled: boolean

  // Tool permission context
  toolPermissionContext: ToolPermissionContext

  // Feature flags
  flagSettingsPath?: string
  flagSettingsInline?: Record<string, unknown>

  // Hooks
  registeredHooks: Partial<Record<HookEvent, RegisteredHookMatcher[]>>

  // Skills/Agents
  invokedSkills: Map<string, InvokedSkillInfo>

  // Cron/tasks
  sessionCronTasks: SessionCronTask[]
  scheduledTasksEnabled: boolean

  // Teams (agent spawning)
  sessionCreatedTeams: Set<string>
}
```

### Meow State Requirements

**Minimal state for lean CLI:**
```typescript
type MeowState = {
  sessionId: string
  cwd: string
  totalCostUsd: number
  totalApiDuration: number
  totalToolDuration: number
  model: string
  tools: Tool[]
  messages: Message[]
  abortController: AbortController
}
```

**Additions for scalability:**
- `invokedSkills: Map<string, SkillContent>` - skill caching
- `sessionHistory: string[]` - conversation compaction
- `taskHandles: Map<string, TaskHandle>` - active task tracking

---

## Skill System

Skills in Claude Code are **local tools** invoked via `/skill` slash command.

### Skill Loading

```typescript
// From commands.ts
getSlashCommandToolSkills(cwd: string): Promise<Skill[]>
```

### Skill Structure

A skill is a **self-contained tool** with:
- `name` - `/skill-name`
- `description` - explaining capability
- `inputSchema` - parameters (if any)
- `call()` - the actual implementation

### Meow Skill Architecture

```typescript
// skills/ directory structure
skills/
├── {skill-name}/
│   ├── skill.ts        # Main implementation
│   ├── README.md       # Description for model
│   └── test.ts         # Optional tests
```

**Built-in skills to implement:**
- `/simplify` - code simplification/refactor
- `/review` - code review
- `/commit` - git commit with conventional commits
- `/test` - generate tests
- `/docs` - generate documentation

**Dynamic skills:**
- `.skills/` directory in project for custom skills
- Hot-reload on file change

---

## Permission System

**Pattern:** Tool name + optional input pattern matching

```typescript
type ToolPermissionContext = {
  mode: 'default' | 'bypassPermissions' | 'auto'
  additionalWorkingDirectories: Map<string, AdditionalWorkingDirectory>
  alwaysAllowRules: ToolPermissionRulesBySource  // "git *" → allow
  alwaysDenyRules: ToolPermissionRulesBySource
  alwaysAskRules: ToolPermissionRulesBySource
}
```

### Meow Permission Model

For a lean CLI, implement **simplified rules**:

```typescript
type PermissionRule = {
  tool: string  // "Bash", "Read", "Edit"
  pattern?: RegExp  // optional input matcher
  action: 'allow' | 'deny' | 'ask'
}

// Default rules for lean experience
const DEFAULT_RULES: PermissionRule[] = [
  { tool: 'Read', action: 'allow' },
  { tool: 'Glob', action: 'allow' },
  { tool: 'Grep', action: 'allow' },
  { tool: 'Bash', pattern: /^git /, action: 'allow' },
  { tool: 'Bash', pattern: /^npm /, action: 'allow' },
  { tool: 'Bash', pattern: /^bun /, action: 'allow' },
  { tool: 'Edit', action: 'ask' },
  { tool: 'Write', action: 'ask' },
  { tool: 'Bash', action: 'ask' },
]
```

---

## Message System

### Message Types

```typescript
type Message =
  | { type: 'user', message: ContentBlockParam[] }
  | { type: 'assistant', message: { content: ContentBlockParam[], usage, stop_reason } }
  | { type: 'system', subtype: 'local_command' | 'compact_boundary' | 'api_error' }
  | { type: 'progress', data: ToolProgressData }
  | { type: 'attachment', attachment: Attachment }
```

### Conversation Flow

```
User Input → processUserInput() → messages.push(userMsg)
  ↓
query() → API stream → messages.push(assistantMsg)
  ↓
Tool Use → progress → messages.push(progress)
  ↓
Tool Result → messages.push(tool_result)
  ↓
Compact (if enabled) → truncate history + insert summary
```

### Meow Message Model

```typescript
type MeowMessage = {
  id: string  // UUID
  role: 'user' | 'assistant' | 'system'
  content: string | ToolResult[]
  timestamp: number
  toolUseId?: string  // for assistant messages with tool calls
}
```

---

## Transport Layer (Bridge)

**Note:** Claude Code's bridge is complex because it connects to Anthropic's cloud infrastructure (claude.ai). Meow should implement a **simplified transport** or skip this entirely for local-only operation.

### Claude Code Bridge Components

1. **Poll Loop** - HTTP long-poll for work items
2. **Ingress WebSocket** - bidirectional message streaming
3. **HybridTransport** - WebSocket reads + HTTP POST writes
4. **SSETransport** - Server-Sent Events for server→client
5. **CCR v2** - Cloud Code Runners protocol

### Meow Recommendation

**Option A: Local-only (simplest)**
- No bridge layer
- Direct stdin/stdout for CLI mode
- File-based session persistence

**Option B: Minimal IPC (for TUI/desktop)**
- Unix domain sockets or named pipes
- Simple JSON-RPC protocol
- No cloud infrastructure

---

## Feature Flags

Claude Code uses `bun:bundle` feature flags for DCE:

```typescript
// Dead code elimination
import { feature } from 'bun:bundle'

const proactive = feature('PROACTIVE')
  ? require('./commands/proactive.js').default
  : null
```

### Meow Feature Flags

```typescript
// Feature enum
const FEATURES = {
  SKILLS: 'meow_skills',
  AGENTS: 'meow_agents',
  MCP: 'meow_mcp',
  COMPACT: 'meow_compact',
  HOOKS: 'meow_hooks',
} as const

function isEnabled(feature: string): boolean {
  return process.env[FEATURES[feature]] === 'true'
}
```

---

## Hooks System

**Pattern:** Event-driven callbacks for extensibility

```typescript
type HookEvent =
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'pre_compact'
  | 'post_compact'
  | 'session_start'
  | 'pre_process_user_input'
```

### Meow Hooks Implementation

```typescript
type Hook = {
  name: string
  trigger: HookEvent | HookEvent[]
  handler: (context: HookContext) => Promise<void | HookResult>
}

type HookContext = {
  sessionId: string
  messages: Message[]
  toolName?: string
  toolInput?: unknown
  toolResult?: unknown
}
```

---

## Recommended Implementation Order

### Phase 1: Core Engine (Lean Parity)
1. [x] ~~Message system~~ (already exists in meow)
2. [x] ~~QueryEngine~~ (adapt existing orchestrator)
3. [ ] Tool registry with `buildTool` pattern
4. [ ] Core tools: Read, Write, Edit, Bash, Glob, Grep
5. [ ] Permission system with rule matching
6. [ ] AbortController for interrupt

### Phase 2: Agent Capability
7. [ ] Skill system (local skills + dynamic loading)
8. [ ] Sub-agent spawning (AgentTool)
9. [ ] Task tracking with file-based output
10. [ ] Session persistence (JSONL files)

### Phase 3: Extensibility
11. [ ] Hooks system
12. [ ] MCP client integration
13. [ ] Feature flags with DCE
14. [ ] Compact/history truncation

### Phase 4: polish/grow
15. [ ] Analytics/telemetry (opt-in)
16. [ ] Remote bridge (optional)
17. [ ] Desktop TUI integration

---

## Key Differences: Claude Code vs Meow

| Aspect | Claude Code | Meow (Current) | Gap |
|--------|-------------|-----------------|-----|
| **Core Lines** | ~1200 | ~80 | 15x smaller |
| **Tool Interface** | 20+ method factory | 4 simple handlers | Major |
| **Permission System** | Pattern-matching rules engine | `--dangerous` flag | Major |
| **Task System** | 7 task types, kill support, file output | None | Major |
| **Session Persistence** | JSONL + compaction + resume | JSONL only | Moderate |
| **Message Types** | 5+ types (user, assistant, system, progress, attachment) | 2 (user, assistant) | Moderate |
| **Streaming** | Full async generator with progress | Basic | Moderate |
| **MCP Support** | Full client integration | None | Major |
| **Agent Spawning** | Nested + teams | None | Major |
| **Skills System** | `/skill` commands, dynamic loading | Sidecar structure only | Major |
| **Hooks** | Pre/post tool, pre/post compact | None | Major |
| **Compact/Truncation** | Full history compaction | None | Major |
| **Analytics** | Full usage, cost, token tracking | None | Major |
| **TUI** | Full React/Ink with animations | Console.log only | Major |
| **AbortController** | Per-turn, per-tool cancellation | None | Major |
| **LLM Provider** | Anthropic-only | OpenAI-compatible + Anthropic | Meow wins |

---

## Honesty Meter: Where Meow Actually Is

### ✅ What Works (Production Ready)
- **Core loop** — Lean, functional, ~80 lines
- **Basic tools** — read, write, shell (with dangerous guard), git
- **Sidecar structure** — search tools (glob, grep) modular
- **Multi-provider** — Any OpenAI-compatible API
- **Session logs** — JSONL persistence

### ⚠️ What Exists But Is Immature
- **task-store.ts** — File-based tasks, but no kill support
- **session-store.ts** — JSONL logs, but no compaction/resume
- **CLI entry** — Basic, no slash commands, no REPL

### ❌ What's Missing (Major Gaps)
1. **Tool interface depth** — No `validateInput`, `checkPermissions`, `render*`, `maxResultSizeChars`
2. **Permission rules** — No pattern matching, only global dangerous flag
3. **AbortController** — Can't interrupt mid-turn
4. **MCP** — No Model Context Protocol support
5. **Agent spawning** — Can't spawn sub-agents
6. **Skills system** — Just a directory structure, no loader
7. **Hooks** — No pre/post tool callbacks
8. **Compact** — No history truncation
9. **TUI** — No real interface, just console.log
10. **Streaming UI** — No real-time progress display

### 📊 Maturity Score: 2/10

```
Meow:    [█░░░░░░░░░] 2/10  — Prototype
Claude:  [██████████] 10/10 — Production
```

### 🎯 Realistic Path to Parity (Effort Estimate)

| Feature | Effort | Priority |
|---------|--------|----------|
| AbortController | 1 day | P0 - Critical |
| Tool interface (`buildTool`) | 1 week | P0 - Critical |
| Permission rules | 2-3 days | P1 - High |
| Session resume | 2 days | P1 - High |
| Slash commands | 1 week | P1 - High |
| MCP client | 2 weeks | P2 - Medium |
| Skills loader | 1 week | P2 - Medium |
| Hooks system | 1 week | P3 - Low |
| Compact | 2 weeks | P3 - Low |
| TUI | 3+ weeks | P4 - Nice to have |

**Bottom line:** Meow is a ~15% implementation of Claude Code's core ideas, with the "lean" philosophy as both its strength and its limitation. To reach 80% parity would take 2-3 months of focused work. To reach 95% parity would require rebuilding most of what's missing.

---

## Files Analyzed

- `src/QueryEngine.ts` - Core query engine
- `src/Task.ts` - Task system
- `src/Tool.ts` - Tool interface and factory
- `src/bootstrap/state.ts` - AppState
- `src/commands.ts` - Command registry
- `src/bridge/bridgeApi.ts` - Bridge API client
- `src/bridge/replBridge.ts` - REPL bridge
- `docs/en/02-hidden-features-and-codenames.md` - Hidden features

---

## Conclusion

Meow can achieve **lean Claude Code parity** by:

1. **Adopting the QueryEngine pattern** - async generator for streaming
2. **Implementing buildTool** - consistent tool interface
3. **Multi-provider LLM support** - OpenAI-compatible + Anthropic-compatible
4. **Simplifying state** - minimal AppState (~20 fields)
5. **Dropping the bridge** - local-only operation
6. **Adding skills** - as local tool extensions
7. **Simplifying permissions** - 3-action rules (allow/ask/deny)

The result should be a **~200 line core engine** that is:
- Easy to understand
- Easy to extend with skills
- Easy to test
- Portable to any platform
- Works with any LLM provider (local or cloud)
