---
name: hooks
repo: https://github.com/anthropics/claude-code
why: Hooks enable pre/post command automation - run scripts before/after commands for CI, notifications, etc.
minimalSlice: "Implement --hooks flag: pre-hook runs before command, post-hook runs after. Config in ~/.agent-kernel/hooks.json"
fit: sidecar
complexity: 2
status: pending
---

# Hooks Capability

Learn from Claude Code's hooks system for automation.

## Core Features

1. **Pre-hooks** - Run before command execution
2. **Post-hooks** - Run after command execution  
3. **Hook config** - JSON file at ~/.agent-kernel/hooks.json
4. **Environment** - Pass command args to hooks via env vars

## Minimal Slice

```typescript
// src/sidecars/hooks.ts
interface Hook {
  command?: string;  // glob pattern
  before?: string[];
  after?: string[];
}

export function runHooks(hookType: 'before' | 'after', context: HookContext) {
  // Load ~/.agent-kernel/hooks.json
  // Match current command against patterns
  // Execute matching hooks
}
```

