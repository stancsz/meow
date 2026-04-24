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
 */

export interface StreamBufferOptions {
  bufferSize?: number;    // Flush after this many chars (default: 20)
  flushIntervalMs?: number; // Force flush after ms (default: 50)
  /** Treat code fences as flush boundaries (default: true) */
  codeFenceAware?: boolean;
}

// Buffer for accumulating tokens
export class TokenBuffer {
  private buffer: string = "";
  private lastFlush: number = Date.now();
  private options: Required<StreamBufferOptions>;
  private flushCallback: (text: string) => void;

  constructor(
    flushCallback: (text: string) => void,
    options: StreamBufferOptions = {}
  ) {
    this.flushCallback = flushCallback;
    this.options = {
      bufferSize: options.bufferSize ?? 20,
      flushIntervalMs: options.flushIntervalMs ?? 50,
      codeFenceAware: options.codeFenceAware ?? true,
    };
  }

  /**
   * Add a token to the buffer, checking for code fence boundaries.
   * If code fence aware, flush when we see ``` to prevent partial fences.
   */
  add(token: string): void {
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