---
name: context7
repo: https://github.com/context7/context7
why: Context7 provides RAG-style context retrieval from docs - accurate, up-to-date answers
minimalSlice: "Implement context7.ts - fetch relevant docs, inject as context for accurate answers"
fit: skill
complexity: 2
status: pending
---

# Context7 Capability

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
