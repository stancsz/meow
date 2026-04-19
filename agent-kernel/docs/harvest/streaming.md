---
name: streaming
repo: https://github.com/anthropics/claude-code
why: Better streaming UX - chunked output, partial renders, smoother animations
minimalSlice: "AsyncGenerator streaming with token buffering and partial render"
fit: skill
complexity: 2
status: pending
---

# Streaming UX Improvements

Improve Meow's streaming output for better UX.

## Core Features

1. **Token buffering** - Buffer tokens before rendering
2. **Partial renders** - Show incomplete output gracefully
3. **Smoother animations** - Reduce spinner flicker
4. **ANSI cleanup** - Properly handle terminal codes

## Minimal Slice

```typescript
// src/sidecars/streaming.ts
export async function* streamWithBuffer(
  stream: AsyncGenerator<string>
): AsyncGenerator<string> {
  let buffer = "";
  for await (const chunk of stream) {
    buffer += chunk;
    if (buffer.length >= 10) { // flush every 10 chars
      yield buffer;
      buffer = "";
    }
  }
  if (buffer) yield buffer;
}
```
