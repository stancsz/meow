/**
 * rewind.ts - Harvested skill for conversation rewind capability
 *
 * Lets users go back to a previous conversation state and optionally revert file changes.
 */

import { type Skill } from "./loader.ts";

const DESCRIPTION = `---
name: rewind
repo: https://github.com/google-gemini/gemini-cli
docPath: competitors/gemini-cli/docs/cli/rewind.md
why: Lets users go back to a previous conversation state and optionally revert file changes. Essential for recovering from mistakes and exploring alternatives.
minimalSlice: "A minimal /rewind command that (1) lists last N conversation turns with timestamps, (2) lets user select one to restore, (3) truncates session store to that point, (4) optionally reverts files changed since that turn via git."
fit: technique
status: pending
complexity: 3
---

# Harvest: rewind from gemini-cli

**Source:** docs/research/competitors/gemini-cli/docs/cli/rewind.md

## Core Trick

Gemini CLI's /rewind command lets you:
1. Navigate to any previous conversation turn via arrow keys
2. Preview what changed (files modified, tool calls made)
3. Choose: rewind conversation only, revert files only, or both
4. Works across chat compression boundaries

## Minimal Slice for Meow

Implement as src/techniques/rewind.ts:
1. Store ~/.agent-kernel/sessions/<id>/checkpoints/ with git commits + conversation snapshots
2. /rewind command shows numbered list of recent turns
3. Selecting a turn: truncates session JSONL, optionally runs git checkout on files
4. Use a shadow git repo in ~/.agent-kernel/history/<project_hash>/ (separate from user's repo)

## Why Worth It

- High user impact: mistakes are common, recovery is essential
- ~100-150 lines of session-store integration + slash command`;

export const rewind: Skill = {
  name: "rewind",
  description: DESCRIPTION,
  async execute(context) {
    // TODO: Implement rewind capability
    return { success: true, message: "rewind capability" };
  },
};

