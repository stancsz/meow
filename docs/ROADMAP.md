# SimpleClaw - Development Roadmap

**Based on:** CLI Competitors Analysis + Claude Code v2.1.88 Source Analysis
**Date:** April 1, 2026
**Goal:** Make SimpleClaw the premier sovereign CLI agent with best-in-class UX

---

## 🎯 CORE VALUE PROPS (PRESERVE & ENHANCE)

| Feature | Status | Notes |
|---------|--------|-------|
| **BYOK** (Bring Your Own Keys) | ✅ Complete | User's own API keys |
| **BYOI** (Bring Your Own Infrastructure) | ✅ Complete | Sovereign Motherboard (Supabase/SQLite) |
| **BYOS** (Bring Your Own Skills) | ✅ Complete | Markdown skill vault |
| **Gas Tank Billing** | ✅ Complete | Stripe + gas_ledger |
| **Worker Delegation** | ✅ Complete | OpenCode integration |
| **Stateless Design** | ✅ Complete | Checkpoint-based |
| **Multi-runtime Modes** | ✅ Complete | CLI/Server/Hybrid |
| **Heartbeat/Continuous Mode** | ✅ Complete | pg_cron + 30min intervals |

---

## 🔴 CRITICAL GAPS (High Priority - Week 1-2)

These are the **must-have** features that competitors have refined over years.

### G1: Interactive CLI UX [CRITICAL]
**Why:** All competitors have rich TUI. Users expect spinners, progress bars, color-coded output.
**Benchmark:** Gemini CLI, Cline

**Implementation Plan:**
```typescript
// src/cli/renderer.ts
interface CliRenderer {
  spin(message: string): void;
  stop(message: string, status: "success" | "error" | "warn"): void;
  progress(current: number, total: number, label: string): void;
  print(content: string, style?: OutputStyle): void;
  confirm(message: string): Promise<boolean>;
  select<T>(options: T[], label: string): Promise<T>;
}
```

**Tasks:**
- [ ] Create `src/cli/` directory with renderer module
- [ ] Implement terminal detection (supports dumb terminals)
- [ ] Add spinner with context messages
- [ ] Add progress bar for long operations
- [ ] Color-coded output (errors=red, warnings=yellow, success=green)
- [ ] Interactive confirm/select prompts
- [ ] Keyboard shortcuts (Ctrl+C, Ctrl+L, etc.)
- [ ] Integrate into orchestrator flow

**Effort:** 3-5 days

---

### G2: Git Integration [HIGH]
**Why:** Aider has excellent git-aware editing. Developers expect auto-commits, branch awareness.
**Benchmark:** Aider

**Tasks:**
- [x] Create `src/core/git.ts` module
- [x] Implement `git status` parsing
- [x] Implement `git diff` for Plan-Diff-Approve
- [x] Implement auto-commit with conventional messages
- [ ] Integrate into orchestrator workflow
- [ ] Add git-aware file editing (only modified files)

**Effort:** 3-4 days

**Status:** ✅ Module implemented - `src/core/git.ts`

---

### G3: Multi-LLM Provider Support [HIGH]
**Why:** Current implementation only supports OpenAI. Cline supports 20+ providers.
**Benchmark:** Cline, Aider (via LiteLLM)

**Tasks:**
- [x] Create `src/core/providers/` directory
- [x] Implement base provider interface
- [x] Add Anthropic provider (Claude)
- [x] Add Gemini provider (via API)
- [x] Add DeepSeek provider
- [x] Add Ollama provider (local models)
- [x] Add LM Studio provider (local models)
- [ ] Update orchestrator to select provider
- [ ] Update `.env.example` with new keys

**Effort:** 4-5 days

**Status:** ✅ Module implemented - `src/core/providers/base.ts`

---

## 🟡 CORE PARITY (Week 2-3)

### P1: MCP Protocol Support
**Why:** Cline and Gemini CLI have full MCP support. SimpleClaw's custom plugin system is good but MCP provides standard extensibility.
**Benchmark:** Cline, Gemini CLI

**Tasks:**
- [ ] Create `src/core/mcp/` module
- [ ] Implement MCP client with stdio transport
- [ ] Implement tool discovery
- [ ] Implement tool execution
- [ ] Add MCP server registry
- [ ] Update capability system to expose MCP tools

**Effort:** 4-5 days

---

### P2: Context Compaction
**Why:** Claude Code has 3-layer compaction. Prevents context overflow in long sessions.
**Benchmark:** Claude Code

**Tasks:**
- [ ] Create `src/core/compact/` module
- [ ] Implement token counting
- [ ] Implement microcompact (dedup, truncate)
- [ ] Implement autocompact (summarization)
- [ ] Add threshold configuration
- [ ] Integrate into QueryEngine

**Effort:** 4-5 days

---

### P3: Session Persistence & Resume
**Why:** Gemini CLI and Claude Code have excellent session persistence.
**Benchmark:** Claude Code (JSONL-based)

**Tasks:**
- [ ] Create `src/core/session/` module
- [ ] Implement JSONL storage
- [ ] Implement session listing
- [ ] Implement session resume
- [ ] Add session sharing capability
- [ ] Update CLI for session management

**Effort:** 3-4 days

---

### P4: Repository Mapping
**Why:** Aider builds AST-based maps. Helps LLM understand large codebases.
**Benchmark:** Aider

**Tasks:**
- [ ] Create `src/core/repo-map/` module
- [ ] Implement file discovery
- [ ] Implement import graph parsing
- [ ] Implement token estimation
- [ ] Add context injection for large codebases
- [ ] Integrate with intent parsing

**Effort:** 5-7 days

---

## 🟢 UX ENHANCEMENTS (Week 3-4)

### U1: Slash Commands System
**Why:** Claude Code has 80+ commands. Essential for power users.
**Benchmark:** Claude Code

**Tasks:**
- [x] Create `src/cli/commands.ts` module
- [x] Implement command registry (20+ commands)
- [x] Implement `/help` command
- [x] Implement `/clear` command
- [x] Implement `/model` command
- [x] Implement `/commit` command
- [x] Implement `/skills` command
- [x] Add git subcommands (`/git status`, `/git diff`, etc.)
- [ ] Add command autocompletion

**Effort:** 3-4 days

**Status:** ✅ Module implemented - `src/cli/commands.ts` with 20+ commands

---

### U2: Configuration System
**Why:** Aider has YAML configs. Better than scattered .env variables.
**Benchmark:** Aider

**Tasks:**
- [ ] Create `src/config/` module
- [ ] Implement YAML config loading
- [ ] Implement config validation
- [ ] Add environment variable fallback
- [ ] Add config migration
- [ ] Update CLI to read config

**Effort:** 2-3 days

---

### U3: Loop Detection & Recovery
**Why:** Gemini CLI has robust loop handling. Prevents infinite execution.
**Benchmark:** Gemini CLI

**Tasks:**
- [ ] Implement turn counter with abort signal
- [ ] Implement pattern detection for repeated operations
- [ ] Add recovery strategies (feedback, retry, abort)
- [ ] Add user notification for loops
- [ ] Integrate with QueryEngine

**Effort:** 2-3 days

---

### U4: Token Optimization
**Why:** Gemini CLI has caching and compression. Reduces API costs.
**Tasks:**
- [ ] Implement token counting utility
- [ ] Implement cost estimation
- [ ] Add tool output masking for sensitive data
- [ ] Add selective context injection
- [ ] Display token usage in CLI

**Effort:** 2-3 days

---

## 🔵 DIFFERENTIATORS (Week 4+)

### D1: Trusted Folders / Sandbox
**Why:** Gemini CLI has sandbox security. Important for safety.
**Tasks:**
- [ ] Implement path allowlist
- [ ] Implement command blocklist
- [ ] Add file size limits
- [ ] Add execution timeout
- [ ] Integrate with permission system

**Effort:** 3-4 days

---

### D2: CLI-Anything Integration
**Why:** CLI-Anything can auto-generate CLI harnesses. Extends capabilities dramatically.
**Reference:** [CLI-Anything](https://github.com/HKUDS/CLI-Anything)

**Tasks:**
- [ ] Study CLI-Anything architecture
- [ ] Implement CLI discovery module
- [ ] Add harness generation
- [ ] Integrate with skill system

**Effort:** 5-7 days

---

### D3: Enhanced Skills System
**Why:** Make BYOS truly powerful with marketplace features.
**Tasks:**
- [ ] Add skill versioning
- [ ] Add skill dependencies
- [ ] Implement skill marketplace
- [ ] Add skill recommendations
- [ ] Enhance hook system (PreToolUse, PostToolUse)

**Effort:** 4-5 days

---

## 📋 IMPLEMENTATION ORDER

### Week 1: Foundation
```
Day 1-2: CLI UX (renderer, spinner, colors)
Day 3-4: Multi-LLM Provider Support
Day 5: Git Integration (basic)
```

### Week 2: Core Features
```
Day 6-7: Git Integration (complete)
Day 8-9: MCP Protocol
Day 10: Slash Commands (basic)
```

### Week 3: Advanced
```
Day 11-12: Context Compaction
Day 13-14: Session Persistence
```

### Week 4: Polish
```
Day 15-16: Repo Mapping
Day 17-18: Configuration System
Day 19-20: Loop Detection & Token Optimization
```

---

## 📊 FEATURE COMPARISON MATRIX

| Feature | SimpleClaw | Claude Code | Aider | Cline | Gemini CLI |
|---------|------------|-------------|-------|-------|------------|
| **Core Architecture** |
| BYOK | ✅ | ❌ | ✅ | ✅ | ✅ |
| BYOI | ✅ | ❌ | ❌ | ❌ | ❌ |
| BYOS | ✅ | ✅ | ❌ | ❌ | ✅ |
| Stateless | ✅ | ❌ | ❌ | ❌ | ❌ |
| Gas Tank | ✅ | ❌ | ❌ | ❌ | ❌ |
| Worker Delegation | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Tool System** |
| BashTool | ✅ | ✅ | ✅ | ✅ | ✅ |
| File Tools | ✅ | ✅ | ✅ | ✅ | ✅ |
| Glob/Grep | ✅ | ✅ | ✅ | ✅ | ✅ |
| WebFetch | ✅ | ✅ | ✅ | ✅ | ✅ |
| Git Integration | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Extensibility** |
| MCP Protocol | ❌ | ✅ | ❌ | ✅ | ✅ |
| Plugin System | ✅ | ✅ | ❌ | ✅ | ❌ |
| Skills System | ✅ | ✅ | ❌ | ✅ | ✅ |
| Slash Commands | ✅ 20+ | ✅ 80+ | ~15 | 20+ | 10+ |
| **UX** |
| CLI TUI | ✅ | ✅ | ✅ | ✅ | ✅ |
| Spinners/Progress | ✅ | ✅ | ✅ | ✅ | ✅ |
| Color Output | ✅ | ✅ | ✅ | ✅ | ✅ |
| Interactive Prompts | ✅ | ✅ | ✅ | ✅ | ✅ |
| Session Resume | ❌ | ✅ | ❌ | ✅ | ✅ |
| **Intelligence** |
| Context Compaction | ❌ | ✅ 3-layer | ❌ | ❌ | ❌ |
| Repo Mapping | ❌ | ✅ | ✅ | ✅ | ✅ |
| Loop Detection | ❌ | ✅ | ❌ | ✅ | ✅ |
| Token Optimization | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Providers** |
| OpenAI | ✅ | ✅ | ✅ | ✅ | ✅ |
| Anthropic | ✅ | ✅ | ✅ | ✅ | ✅ |
| Gemini | ✅ | ❌ | ✅ | ✅ | ✅ |
| Local (Ollama) | ✅ | ❌ | ✅ | ✅ | ❌ |
| LiteLLM | ❌ | ❌ | ✅ | ❌ | ❌ |

---

## ✅ COMPLETED FEATURES

From CLAUDE.md cycle history:

- [x] **Phase 0 — Worker Dispatch + Execution Loop**
- [x] **Phase 0 — End-to-End Integration Test**
- [x] **Phase 0 — Plan-Diff-Approve Execution Bridge**
- [x] **Phase 1 — Gas Tank (Stripe + gas_ledger)**
- [x] **Phase 1 — Custom Skill Uploader (Backend)**
- [x] **Phase 1.5 — Orchestrator TDD & API Enhancement**
- [x] **Phase 1.5 — Integration Test Suite**
- [x] **Phase 2 — Heartbeat (pg_cron + 30min intervals)**
- [x] **Move 1 — Real LLM Intent Parsing**
- [x] **Move 2 — Sovereign Motherboard SQL Schema**
- [x] **Move 3 — KMS Credential Encryption/Decryption**
- [x] **Plugin System (GitHub, Google Drive, Linear, Browser, Screencap)**
- [x] **Sub-Agent Delegation Engine**
- [x] **BYOK/BYOI/BYOS Architecture**

---

## 🎯 SUCCESS METRICS

| Metric | Target | Current |
|--------|--------|---------||
| CLI TUI | ✅ | ❌ |
| Git Integration | ✅ | ❌ |
| MCP Protocol | ✅ | ❌ |
| Multi-LLM Providers | ✅ | ❌ |
| Slash Commands | 50+ | 0 |
| Session Resume | ✅ | ❌ |
| Context Compaction | ✅ | ❌ |
| Repo Mapping | ✅ | ❌ |
| Test Coverage | 80%+ | ~60% |
| Claude Code Parity | 80%+ | ~40% |

---

*This TODO serves as the roadmap for making SimpleClaw the premier sovereign CLI agent.*
