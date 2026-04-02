# Meow TODO — Lean Agent Build

**Started:** April 2, 2026
**Goal:** Build a lean, self-contained agent loop

---

## Phases

### Phase 1: Foundation
- [x] Update SPEC.md
- [x] Create docs/TODO.md (this file)

### Phase 2: Lean Agent Core
- [x] Create `meow/src/core/lean-agent.ts`
- [x] Implement MiniMax LLM client in lean-agent
- [x] Implement core tools (read, write, shell, git)
- [ ] Test lean agent with simple prompts

### Phase 3: CLI Integration
- [x] Rewrite `meow/cli/index.ts` as entry point
- [x] Add interactive mode
- [x] Add single-task mode
- [x] Update package.json scripts

### Phase 4: Cleanup
- [x] Old sidecar files removed (docker, packages/core, packages/db)
- [x] Verify all tests pass

---

## Progress

| Date | Task | Status |
|------|------|--------|
| 2026-04-02 | Update SPEC.md | ✅ |
| 2026-04-02 | Create docs/TODO.md | ✅ |
| 2026-04-02 | Create lean-agent.ts | ✅ |
| 2026-04-02 | Rewrite CLI entry | ✅ |
| 2026-04-02 | Update package.json | ✅ |
| 2026-04-02 | Massive cleanup (docker, packages) | ✅ |
| 2026-04-02 | Fix .github/scripts | ✅ |

---

## Lean Agent Architecture

```
┌─────────────────────────────────────┐
│           CLI Entry Point           │
│         meow/cli/index.ts          │
└──────────────┬────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│           Lean Agent Core           │
│     meow/src/core/lean-agent.ts     │
│                                     │
│  - runLeanAgent(prompt, options)    │
│  - Core loop (~50-100 lines)        │
│  - Inline tool execution            │
└──────────────┬────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│         Tool Handlers               │
│                                     │
│  read(path)     → readFileSync()   │
│  write(path, c) → writeFileSync()   │
│  shell(cmd)     → execSync()        │
│  git(args)      → execSync(git)    │
└─────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│         LLM: MiniMax API           │
│   OpenAI-compatible at api.minimax.io/v1  │
│   Model: MiniMax-M2.7              │
└─────────────────────────────────────┘
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MINIMAX_API_KEY` | required | MiniMax API key |
| `MINIMAX_BASE_URL` | `https://api.minimax.io/v1` | API base URL |
| `MINIMAX_MODEL` | `MiniMax-M2.7` | Model name |

---

## CLI Usage

```bash
# Interactive mode (prompts for input)
bun run start

# Single task mode
bun run start "Read package.json and tell me the dependencies"

# With custom model
MINIMAX_API_KEY=xxx bun run start "Hello world"
```

---

## Files Created

| File | Purpose |
|------|---------|
| `meow/src/core/lean-agent.ts` | Core agent loop (~250 lines) |
| `meow/cli/index.ts` | CLI entry point (~140 lines) |
| `docs/SPEC.md` | Updated specification |
| `docs/TODO.md` | This file |

---

## Files Removed

- `docker/` - Docker files
- `packages/core/` - Old orchestrator
- `packages/db/` - Old database client
- `packages/agents/.agents/` - Old agents workspace
- `SPECS.md` - Old specification
