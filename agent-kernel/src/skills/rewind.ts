/**
 * rewind.ts
 * ---
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

**Source:** `docs/research/competitors/gemini-cli/docs/cli/rewind.md`

## Core Trick

Gemini CLI's `/rewind` command lets you:
1. Navigate to any previous conversation turn via arrow keys
2. Preview what changed (files modified, tool calls made)
3. Choose: rewind conversation only, revert files only, or both
4. Works across chat compression boundaries

## Minimal Slice for Meow

Implement as `src/techniques/rewind.ts`:

1. Store `~/.agent-kernel/sessions/<id>/checkpoints/` with git commits + conversation snapshots before each tool call
2. `/rewind` command (via slash-commands) shows numbered list of recent turns
3. Selecting a turn: truncates session JSONL to that point, optionally runs `git checkout` on files
4. Key insight: use a shadow git repo in `~/.agent-kernel/history/<project_hash>/` (separate from user's repo)

## Why Worth It

- High user impact: mistakes are common, recovery is essential
- Not a sidecar or skill — it's a session interaction pattern, fits "technique"
- ~100-150 lines of session-store integration + slash command

## Complexity Note

3/5 — requires session-store changes to support checkpoint snapshots, and git integration for file reversion. Do after basic slash commands are solid.
 *
 * Harvested from: 
 * Why: 
 * Minimal slice: 
 */

import { type Skill } from "./loader.ts";

export const rewind: Skill = {
  name: "rewind",
  description: "---
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

**Source:** `docs/research/competitors/gemini-cli/docs/cli/rewind.md`

## Core Trick

Gemini CLI's `/rewind` command lets you:
1. Navigate to any previous conversation turn via arrow keys
2. Preview what changed (files modified, tool calls made)
3. Choose: rewind conversation only, revert files only, or both
4. Works across chat compression boundaries

## Minimal Slice for Meow

Implement as `src/techniques/rewind.ts`:

1. Store `~/.agent-kernel/sessions/<id>/checkpoints/` with git commits + conversation snapshots before each tool call
2. `/rewind` command (via slash-commands) shows numbered list of recent turns
3. Selecting a turn: truncates session JSONL to that point, optionally runs `git checkout` on files
4. Key insight: use a shadow git repo in `~/.agent-kernel/history/<project_hash>/` (separate from user's repo)

## Why Worth It

- High user impact: mistakes are common, recovery is essential
- Not a sidecar or skill — it's a session interaction pattern, fits "technique"
- ~100-150 lines of session-store integration + slash command

## Complexity Note

3/5 — requires session-store changes to support checkpoint snapshots, and git integration for file reversion. Do after basic slash commands are solid.",
  async execute(context) {
    // TODO: Implement rewind capability from 
    // 
    return { success: true, message: "rewind capability" };
  },
};

