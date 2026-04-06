---
name: memory
repo: https://github.com/msitarzewski/agency-agents
why: Persistent memory system for Meow - remember context across sessions
minimalSlice: "memory.ts - load/save memory to ~/.meow/memory/*.json"
fit: skill
complexity: 2
status: pending
---

# Memory Capability

Implement persistent memory for Meow across sessions.

## Core Features

1. Load memory on startup
2. Save memory after significant interactions
3. Memory file format: JSON with timestamps
4. Memory types: user preferences, context, learned facts

## Minimal Slice

Create `src/sidecars/memory.ts`:

1. `loadMemory(userId)` - Load memory from file
2. `saveMemory(userId, data)` - Save memory to file
3. `getMemory(key)` - Get specific memory
4. `setMemory(key, value)` - Set specific memory
5. Auto-save on important events

## Why Worth It

- Continuity across sessions
- Learns user preferences over time
- Essential for companion identity
