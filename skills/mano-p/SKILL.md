---
origin: local
name: mano-p
description: Desktop GUI automation via natural language. Captures screenshots, sends to vision model, executes click/type/scroll/drag/hotkey actions locally. Pass to subagents for desktop tasks. Cloud mode (default) or local MLX mode on Apple Silicon.
homepage: https://github.com/Mininglamp-AI/mano-skill
---

# Mano-P Skill

Desktop GUI automation driven by natural language. Captures screenshots, sends them to a cloud-based hybrid vision model, and executes returned actions on the local machine.

## When to Use This Skill

Use when:
- User asks to perform desktop/GUI tasks ("open Safari and search...", "click the button...")
- A subagent needs to control the desktop interface
- Automating multi-step desktop workflows (forms, navigation, file operations)

## Installation

```bash
brew tap Mininglamp-AI/tap && brew install mano-cua
# OR
openclaw skills install mano-cua
```

### Permissions Required

Grant in **System Preferences → Privacy & Security**:
1. **Screen Recording** — for screenshot capture
2. **Accessibility** — for keyboard/mouse control

Without these, actions will silently fail or produce no-ops.

## How It Works

```
Local client → Screenshot → Cloud Server → Model routing
                                       ↓
                    ┌───────────────────┴───────────────────┐
                    ↓                                       ↓
              Mano Model                            Claude CUA
          (fast, repetitive)                   (complex reasoning)
```

**Cloud mode** (default): screenshots → `mano.mininglamp.com`. Works on any device.
**Local mode** (`--local`): on-device MLX. Requires Apple Silicon M4+ with 32GB RAM.

## Passing to Subagents

When a subagent needs to perform desktop tasks, include this skill in its context:

### Via coding-agent spawn

```json
{
  "skill": "mano-p",
  "task": "Open Finder, create a folder named Projects, and navigate into it"
}
```

### Via session spawn with runtime

```json
{
  "runtime": "mano-p",
  "prompt": "Use mano-cua to open Safari and navigate to github.com"
}
```

### Direct use in meow

```
Summon mano-p to handle: Open WeChat and send a message to FTY
```

## Usage Examples

```bash
# Basic cloud mode
mano-cua run "Open Safari and search for Python"

# With URL scoping
mano-cua run "Search for AI news" --url "https://x.com"

# Local mode (Apple Silicon)
mano-cua run "Open Finder" --local --max-steps 20

# Stop active session
mano-cua stop

# Check installation/permissions
mano-cua check
```

## Supported Actions

`click` · `type` · `hotkey` · `scroll` · `drag` · `mouse move` · `screenshot` · `wait` · `app launch` · `url navigation`

## Delegation Constraints

1. **Grant permissions first** — Screen Recording + Accessibility must be approved before delegation
2. **User must not interact** — mouse/keyboard input during task causes conflicts
3. **Primary display only** — multi-monitor uses main display only
4. **User consent** — prompt user before sensitive actions (file deletions, messaging)
5. **Sensitive apps** — warn user to close apps with sensitive data before running
6. **macOS primary** — Windows/Linux in Beta; expect minor issues

## Status Panel

A small overlay in the top-right shows session status. Visible to user so they know mano-cua is active.

## Error Handling

- Permission denied → `mano-cua check` and follow System Preferences instructions
- No active session → `mano-cua stop` then re-run
- Local mode fails → ensure Apple Silicon + 32GB RAM, or omit `--local` flag
- Session timeout → re-run the task; short tasks (<5min) recommended