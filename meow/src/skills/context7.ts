/**
 * context7.ts
 * # Context7 Capability

RAG-style context retrieval for accurate answers from documentation.

## Core Features

1. **Doc fetching** - Retrieve relevant docs based on query
2. **Context injection** - Add fetched docs to prompt
3. **Source attribution** - Track which docs were used

## Minimal Slice

```typescript
export const context7: Skill = {
  name: "context7",
  description: "Fetch relevant docs and inject as context",
  async execute(context) {
    // Query context7 API
    // Return relevant docs
  }
}
```
 *
 * Harvested from: https://github.com/context7/context7
 * Why: Context7 provides RAG-style context retrieval from docs - accurate, up-to-date answers
 * Minimal slice: Implement context7.ts - fetch relevant docs, inject as context for accurate answers
 */

import { type Skill } from "./loader.ts";

export const context7: Skill = {
  name: "context7",
  description: "# Context7 Capability

RAG-style context retrieval for accurate answers from documentation.

## Core Features

1. **Doc fetching** - Retrieve relevant docs based on query
2. **Context injection** - Add fetched docs to prompt
3. **Source attribution** - Track which docs were used

## Minimal Slice

```typescript
export const context7: Skill = {
  name: "context7",
  description: "Fetch relevant docs and inject as context",
  async execute(context) {
    // Query context7 API
    // Return relevant docs
  }
}
```",
  async execute(context) {
    // TODO: Implement context7 capability from https://github.com/context7/context7
    // Implement context7.ts - fetch relevant docs, inject as context for accurate answers
    return { success: true, message: "context7 capability" };
  },
};
