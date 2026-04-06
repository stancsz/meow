/**
 * memory.ts
 * # Memory Capability

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
 *
 * Harvested from: https://github.com/msitarzewski/agency-agents
 * Why: Persistent memory system for Meow - remember context across sessions
 * Minimal slice: memory.ts - load/save memory to ~/.meow/memory/*.json
 */

import { type Skill } from "./loader.ts";

export const memory: Skill = {
  name: "memory",
  description: "# Memory Capability

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
- Essential for companion identity",
  async execute(context) {
    // TODO: Implement memory capability from https://github.com/msitarzewski/agency-agents
    // memory.ts - load/save memory to ~/.meow/memory/*.json
    return { success: true, message: "memory capability" };
  },
};
