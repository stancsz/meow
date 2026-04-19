/**
 * workspace-trust.ts
 * # Workspace Trust Capability

Security feature that prompts when running in untrusted directories.

## Core Features

1. **Trust config** - ~/.agent-kernel/trusted.json list of trusted dirs
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
 *
 * Harvested from: https://github.com/anthropics/claude-code
 * Why: Workspace trust dialogs prompt user when running in new directories for security
 * Minimal slice: Implement workspace trust: check .claude/trusted.json, prompt if untrusted
 */

import { type Skill } from "./loader.ts";

export const workspace_trust: Skill = {
  name: "workspace-trust",
  description: "# Workspace Trust Capability

Security feature that prompts when running in untrusted directories.

## Core Features

1. **Trust config** - ~/.agent-kernel/trusted.json list of trusted dirs
2. **Trust prompt** - "Allow in this directory?" when untrusted
3. **Auto-trust** - Can mark dirs as trusted permanently

## Minimal Slice

```typescript
interface WorkspaceTrust {
  trustedPaths: string[];
  check(path: string): boolean;
  trust(path: string): void;
}
```",
  async execute(context) {
    // TODO: Implement workspace-trust capability from https://github.com/anthropics/claude-code
    // Implement workspace trust: check .claude/trusted.json, prompt if untrusted
    return { success: true, message: "workspace-trust capability" };
  },
};

