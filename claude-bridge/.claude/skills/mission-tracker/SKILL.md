# Mission Tracker Skill 🏹

A persistent background agent that tracks missions, evaluates progress, and pushes for perfection.

## How It Works

1. User creates a mission with goals
2. Mission agent runs in background, checking every N minutes
3. Each check: evaluates current state vs mission goals
4. If incomplete: identifies what's missing, suggests/implements fixes
5. If complete: pushes for perfection beyond the original scope
6. Posts status updates to a designated Discord channel

## Commands

### Create a Mission
```
"track my website redesign project"
```

The bot will ask for details and create a mission entry.

### Check Mission Status
```
"mission status"
"how's my project going"
```

### List Active Missions
```
"list missions"
"show my missions"
```

### Complete a Mission
```
"complete mission 1"
"finish the website project"
```

### Delete/Cancel a Mission
```
"delete mission 1"
"cancel the design project"
```

## Mission Data

Stored in `data/missions.json`:
```json
{
  "missions": [
    {
      "id": "uuid",
      "title": "Website Redesign",
      "description": "Full redesign of personal website",
      "goals": ["hero section", "portfolio grid", "contact form"],
      "status": "in_progress",
      "createdAt": "2026-04-15T...",
      "updatedAt": "2026-04-15T...",
      "checkInterval": 600,
      "channelId": "discord-channel-id",
      "iteration": 0,
      "evalHistory": []
    }
  ]
}
```

## How Evaluation Works

Each check cycle:
1. **Read current state** - examine files/codebase relevant to mission
2. **Compare against goals** - what's done, what's incomplete
3. **Score completion** - percentage of goals achieved
4. **Push for perfection** - if 100%, find ways to exceed expectations
5. **Update Discord** - post progress, findings, next steps

## The Agent Loop

```
Wake up (every 10 min)
  ↓
Read active missions
  ↓
For each mission:
  → Evaluate current state
  → Compare vs goals
  → If <100%: identify gaps, suggest/implement fixes
  → If 100%: look for ways to exceed
  → Post update to Discord channel
  ↓
Sleep until next check
```

## Background Execution

The mission agent runs **parallel to normal chat**:
- Relay handles real-time messages (unchanged)
- Mission agent runs in background process
- ScheduleWakeup powers the check loop
- Status updates posted to designated Discord channel
- No interference with normal conversation

## Smart Evaluation

The agent doesn't just mark tasks "done" - it:
1. **Verifies work** - actually examines the code/output
2. **Tests functionality** - runs checks, checks for errors
3. **Compares against intent** - does it actually solve the problem?
4. **Looks for improvements** - even complete tasks can be better
5. **Suggests next steps** - beyond the original scope

## Example

```
Mission: "Build a CLI tool"
Goals: [arg parsing, help text, error handling, tests]

Check 1 (0%): No code exists. Creates initial structure.
Check 2 (40%): Has arg parsing, help text. Missing tests.
Check 3 (70%): Tests added. Error handling incomplete.
Check 4 (100%): All goals met!
Check 5 (100%+): Suggests: add shell completion, man page, CI/CD
```
