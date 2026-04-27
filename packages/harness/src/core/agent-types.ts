/**
 * agent-types.ts - Local re-definitions of @meow/kernel types for Docker compatibility
 * These types are duplicated here because @meow/kernel is not published to npm
 * and cannot be resolved via workspace:// during Docker build.
 */

export enum AgentState {
  THINKING = "thinking",
  INDEXING = "indexing",
  READING = "reading",
  WRITING = "writing",
  EXECUTING = "executing",
  WAITING_PERMISSION = "waiting_permission",
  SUMMARIZING = "summarizing",
  COMPLETE = "complete",
  ERROR = "error",
}

export const AGENT_STATE_EMOJI: Record<AgentState, string> = {
  [AgentState.THINKING]: "🤔",
  [AgentState.INDEXING]: "📚",
  [AgentState.READING]: "📖",
  [AgentState.WRITING]: "✏️",
  [AgentState.EXECUTING]: "⚡",
  [AgentState.WAITING_PERMISSION]: "⏳",
  [AgentState.SUMMARIZING]: "📝",
  [AgentState.COMPLETE]: "✅",
  [AgentState.ERROR]: "❌",
};

export const AGENT_STATE_DESCRIPTION: Record<AgentState, string> = {
  [AgentState.THINKING]: "Thinking...",
  [AgentState.INDEXING]: "Indexing codebase...",
  [AgentState.READING]: "Reading files...",
  [AgentState.WRITING]: "Writing files...",
  [AgentState.EXECUTING]: "Executing commands...",
  [AgentState.WAITING_PERMISSION]: "Waiting for permission...",
  [AgentState.SUMMARIZING]: "Summarizing results...",
  [AgentState.COMPLETE]: "Done!",
  [AgentState.ERROR]: "Error occurred",
};

/**
 * Token buffer for streaming response handling
 */
/**
 * Token buffer for streaming response handling
 */
export class TokenBuffer {
  private buffer: string[] = [];
  private currentCodeFence: string | null = null;
  private flushCallback: (text: string) => void;
  private options: {
    bufferSize: number;
    flushIntervalMs: number;
    codeFenceAware: boolean;
  };
  private timer: Timer | null = null;

  constructor(
    flushCallback: (text: string) => void,
    options: { bufferSize?: number; flushIntervalMs?: number; codeFenceAware?: boolean } = {}
  ) {
    this.flushCallback = flushCallback;
    this.options = {
      bufferSize: options.bufferSize || 10,
      flushIntervalMs: options.flushIntervalMs || 50,
      codeFenceAware: options.codeFenceAware || false,
    };
  }

  add(token: string) {
    this.buffer.push(token);

    if (this.options.codeFenceAware) {
      if (token.includes("```")) {
        this.flush();
      }
    }

    if (this.buffer.length >= this.options.bufferSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.flush();
      }, this.options.flushIntervalMs);
    }
  }

  push(token: string) {
    this.add(token);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.buffer.length === 0) return;

    const text = this.buffer.join("");
    this.buffer = [];
    this.flushCallback(text);
  }

  getBufferText(): string {
    return this.buffer.join("");
  }
}
