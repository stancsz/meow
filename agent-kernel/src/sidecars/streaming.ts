/**
 * streaming.ts
 *
 * Streaming sidecar with token buffering and partial render support.
 * Improves streaming UX by buffering tokens before rendering.
 *
 * FLASH/FREEZE BUG FIX (Iteration 7):
 * Code fences (```) arriving mid-token can cause Discord markdown
 * confusion and UI flash/freeze. This module now detects fence
 * boundaries and flushes the buffer appropriately.
 *
 * See: cursor.com/changelog Apr 15, 2026
 * "Fixed bug where agent conversations with diffs or code blocks would flash and freeze"
 *
 * EPOCH 16 - STREAMING CONTINUATION SIGNALS:
 * - needsContinuation: boolean field for truncated/incomplete responses
 * - content_block_stop: emitted at end of content block
 * - message_stop: emitted at end of complete message
 * - Backpressure handling for slow consumers
 *
 * EPOCH 17 - RICH AGENT STATE INDICATORS:
 * - state_change: emitted when agent changes execution state
 * - AgentState enum with 9 distinct states
 * - State tracking during tool execution
 */

// ============================================================================
// Stream Event Types (Claude Code SSE pattern)
// ============================================================================

export type StreamEventType =
  | "content_block_start"
  | "content_block_delta"
  | "content_block_stop"
  | "message_stop"
  | "needsContinuation"
  | "error"
  | "tool_start"
  | "tool_end"
  | "state_change"; // EPOCH 17: Rich agent state indicators

export interface StreamEvent {
  type: StreamEventType;
  /** Set when response is truncated/incomplete (e.g., max tokens reached) */
  needsContinuation?: boolean;
  /** Text content for delta events */
  content?: string;
  /** Error message for error events */
  error?: string;
  /** Tool name for tool_start/tool_end events */
  toolName?: string;
  /** Tool result for tool_end events */
  toolResult?: string;
  /** Block index for content_block_start */
  index?: number;
  /** Agent state for state_change events (EPOCH 17) */
  state?: string;
  /** Optional message for state_change events */
  stateMessage?: string;
}

export interface StreamBufferOptions {
  bufferSize?: number;    // Flush after this many chars (default: 20)
  flushIntervalMs?: number; // Force flush after ms (default: 50)
  /** Treat code fences as flush boundaries (default: true) */
  codeFenceAware?: boolean;
  /** High water mark for backpressure (default: 100) */
  highWaterMark?: number;
}

// Buffer for accumulating tokens
export class TokenBuffer {
  private buffer: string = "";
  private lastFlush: number = Date.now();
  private options: Required<StreamBufferOptions>;
  private flushCallback: (text: string) => void;
  // Backpressure: queue for slow consumers
  private writeQueue: string[] = [];
  private drainPromise: Promise<void> | null = null;
  private resolveDrain: (() => void) | null = null;

  constructor(
    flushCallback: (text: string) => void,
    options: StreamBufferOptions = {}
  ) {
    this.flushCallback = flushCallback;
    this.options = {
      bufferSize: options.bufferSize ?? 20,
      flushIntervalMs: options.flushIntervalMs ?? 50,
      codeFenceAware: options.codeFenceAware ?? true,
      highWaterMark: options.highWaterMark ?? 100,
    };
  }

  /**
   * Add a token to the buffer, checking for code fence boundaries.
   * If code fence aware, flush when we see ``` to prevent partial fences.
   * 
   * EPOCH 16: Now includes backpressure handling.
   * If write queue exceeds highWaterMark, waits for consumer to drain.
   */
  async add(token: string): Promise<void> {
    // Backpressure: wait if queue is full
    if (this.writeQueue.length >= this.options.highWaterMark) {
      await this.drain();
    }

    if (this.options.codeFenceAware) {
      // Check for code fence boundaries - flush buffer BEFORE the fence
      // This prevents partial fences like "```co" from being rendered
      const fenceIdx = token.indexOf("```");
      if (fenceIdx >= 0) {
        // Flush any existing buffer first
        if (this.buffer.length > 0) {
          this.flushCallback(this.buffer);
          this.buffer = "";
        }
        // Add the token with fence - don't buffer across fence boundaries
        this.buffer += token;
        // Flush immediately at fence boundaries
        this.flush();
        return;
      }

      // Track partial backticks - if we have "``" at end, wait for third
      // This handles the case where ``` arrives as separate tokens
      if (token.startsWith("``") || token.endsWith("``")) {
        if (this.buffer.endsWith("`") || this.buffer.endsWith("``")) {
          // Could be a partial fence forming - buffer it
          this.buffer += token;
          return;
        }
      }
    }

    this.buffer += token;
    const now = Date.now();

    // Flush if buffer is large enough or enough time has passed
    if (
      this.buffer.length >= this.options.bufferSize ||
      now - this.lastFlush >= this.options.flushIntervalMs
    ) {
      this.flush();
    }
  }

  /**
   * Drain the write queue - called by consumer when ready for more tokens.
   * EPOCH 16: Enables backpressure handling for slow consumers.
   */
  async drain(): Promise<void> {
    // Process queued items
    while (this.writeQueue.length > 0 && this.writeQueue.length < this.options.highWaterMark) {
      const item = this.writeQueue.shift();
      if (item !== undefined) {
        this.flushCallback(item);
      }
    }

    // If queue is still full, wait for resolution
    if (this.writeQueue.length >= this.options.highWaterMark) {
      return new Promise<void>((resolve) => {
        this.resolveDrain = resolve;
      });
    }

    // Resolve any pending drain
    if (this.resolveDrain) {
      this.resolveDrain();
      this.resolveDrain = null;
    }
  }

  /**
   * Get current queue depth for monitoring.
   * EPOCH 16: Enables backpressure monitoring.
   */
  getQueueDepth(): number {
    return this.writeQueue.length;
  }

  /**
   * Check if backpressure is being applied (queue above high water mark).
   */
  isBackpressure(): boolean {
    return this.writeQueue.length >= this.options.highWaterMark;
  }

  flush(): void {
    if (this.buffer.length > 0) {
      this.flushCallback(this.buffer);
      this.buffer = "";
      this.lastFlush = Date.now();
    }
  }

  getBuffer(): string {
    return this.buffer;
  }
}

// ANSI escape sequence patterns
const ANSI_PATTERNS = {
  // Complete escapes
  complete: /\x1b\[[0-9;]*[a-zA-Z]/g,
  // Partial escapes (might be mid-sequence)
  prefix: /\x1b\[[0-9;]*[K]?$/,
  // Cursor save/restore
  save: /\x1b\[s/,
  restore: /\x1b\[u/,
};

// Track partial ANSI sequences during streaming
export class AnsiTracker {
  private partial: string = "";

  // Process a chunk and return the clean part, saving partial for next chunk
  process(chunk: string): string {
    // Check for partial ANSI at end
    const lastBracket = chunk.lastIndexOf("\x1b[");
    const lastLetter = chunk.search(/[a-zA-Z]$/);

    if (lastBracket > lastLetter && lastLetter === -1) {
      // We have a partial ANSI sequence - save it for later
      this.partial += chunk;
      return "";
    }

    // Look for incomplete sequence at end
    const endPortion = chunk.slice(lastBracket);
    if (lastBracket >= 0 && !endPortion.match(/^[0-9;]*[a-zA-Z]$/)) {
      // Partial at end - save it
      this.partial += endPortion;
      return chunk.slice(0, lastBracket);
    }

    return chunk;
  }

  // Get any accumulated partial sequence
  getPartial(): string {
    return this.partial;
  }

  // Reset partial sequences
  reset(): void {
    this.partial = "";
  }
}

// Create a buffered streaming wrapper
export function createBufferedStream(
  onFlush: (text: string) => void,
  options: StreamBufferOptions = {}
): {
  write: (token: string) => void;
  flush: () => void;
  close: () => void;
} {
  const buffer = new TokenBuffer(onFlush, options);
  const ansiTracker = new AnsiTracker();

  return {
    write(token: string): void {
      const clean = ansiTracker.process(token);
      if (clean) {
        buffer.add(clean);
      }
    },
    flush(): void {
      // Flush any remaining partial ANSI + buffer
      const partial = ansiTracker.getPartial();
      if (partial) {
        onFlush(partial);
        ansiTracker.reset();
      }
      buffer.flush();
    },
    close(): void {
      buffer.flush();
    },
  };
}

// Detect if terminal supports ANSI
export function supportsAnsi(): boolean {
  if (typeof process !== "undefined" && process.stdout) {
    return process.stdout.isTTY === true;
  }
  return false;
}

// Clear current line (for partial renders)
export function clearLine(): void {
  process.stdout.write("\r\x1b[K");
}

// Move cursor back to start of line
export function backToLineStart(): void {
  process.stdout.write("\r");
}