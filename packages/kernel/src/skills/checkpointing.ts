/**
 * checkpointing.ts - Harvested skill for checkpointing capability
 *
 * Automatically snapshots project state before AI file modifications.
 */

import { type Skill } from "./loader.ts";

const DESCRIPTION = `---
name: checkpointing
repo: https://github.com/google-gemini/gemini-cli
docPath: competitors/gemini-cli/docs/cli/checkpointing.md
why: Automatically snapshots project state before AI file modifications. Lets users approve experimental changes knowing they can instantly revert. Essential safety net.
minimalSlice: "A minimal checkpoint sidecar: before each write/edit tool call, git stash a temporary checkpoint. After the tool runs, if user approves the result, checkpoint is dropped. If user runs /restore, revert to checkpoint."
fit: sidecar
status: implemented
complexity: 2
---

# Harvest: checkpointing from gemini-cli

## Core Trick

Gemini CLI automatically snapshots project state before AI-powered file modifications:
1. User approves a tool call (write_file, replace, etc.)
2. CLI creates a git snapshot in ~/.gemini/history/<project_hash>/ (shadow repo)
3. Also saves conversation history up to that point
4. /restore command reverts files + conversation to that snapshot

Key insight: shadow git repo in home directory, separate from user's project git.

## Minimal Slice for Meow

Implement as src/sidecars/checkpoint.ts:
1. Hook into tool-registry: pre-tool-call for write/edit tools
2. Run git stash push -m "checkpoint:<timestamp>" (or use worktree)
3. After tool executes, if user approves result, silently drop checkpoint
4. /restore command: find most recent checkpoint, git stash pop to revert
5. Keep checkpoints in ~/.agent-kernel/checkpoints/<project_hash>/

## Why Worth It

- Essential safety for an agent that modifies files
- Very high user trust impact
- Sidecar fits perfectly: hooks into tool-registry pre/post tool calls
- 2/5 complexity: git stash + slash command = ~80 lines`;

export const checkpointing: Skill = {
  name: "checkpointing",
  description: DESCRIPTION,
  async execute(context) {
    // TODO: Implement checkpointing capability
    return { success: true, message: "checkpointing capability" };
  },
};

