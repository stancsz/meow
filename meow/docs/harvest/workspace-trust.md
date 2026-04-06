---
name: workspace-trust
repo: https://github.com/anthropics/claude-code
why: Workspace trust dialogs prompt user when running in new directories for security
minimalSlice: "Implement workspace trust: check .claude/trusted.json, prompt if untrusted"
fit: core
complexity: 2
status: pending
---

# Workspace Trust Capability

Security feature that prompts when running in untrusted directories.

## Core Features

1. **Trust config** - ~/.meow/trusted.json list of trusted dirs
2. **Trust prompt** - "Allow in this directory?" when untrusted
3. **Auto-trust** - Can mark dirs as trusted permanently

## Minimal Slice

```typescript
interface WorkspaceTrust {
  trustedPaths: string[];
  check(path: string): boolean;
  trust(path: string): void;
}
```
