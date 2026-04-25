/**
 * streaming.ts - Minimal stub for streaming functionality
 * The real streaming module provides TokenBuffer for code fence aware buffering.
 */
export class TokenBuffer {
  constructor(options?: { onChunk?: (chunk: string) => void }) {}
  push(token: string): void {}
  flush(): string { return ""; }
  getCodeFence(): string | null { return null; }
}