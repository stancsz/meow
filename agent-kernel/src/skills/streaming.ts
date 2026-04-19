/**
 * streaming.ts
 * # Streaming UX Improvements

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
 *
 * Harvested from: https://github.com/anthropics/claude-code
 * Why: Better streaming UX - chunked output, partial renders, smoother animations
 * Minimal slice: AsyncGenerator streaming with token buffering and partial render
 */

import { type Skill } from "./loader.ts";

const DESCRIPTION = `# Streaming UX Improvements

Improve Meow's streaming output for better UX.

## Core Features

1. **Token buffering** - Buffer tokens before rendering
2. **Partial renders** - Show incomplete output gracefully
3. **Smoother animations** - Reduce spinner flicker
4. **ANSI cleanup** - Properly handle terminal codes

## Minimal Slice

\`\`\`typescript
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
\`\`\``;

export const streaming: Skill = {
  name: "streaming",
  description: DESCRIPTION,
  async execute(context) {
    // TODO: Implement streaming capability from https://github.com/anthropics/claude-code
    // AsyncGenerator streaming with token buffering and partial render
    return { success: true, message: "streaming capability" };
  },
};
