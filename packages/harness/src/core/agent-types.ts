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
export class TokenBuffer {
  private buffer: string[] = [];
  private currentCodeFence: string | null = null;

  push(token: string) {
    this.buffer.push(token);
  }

  flush(): string {
    const result = this.buffer.join("");
    this.buffer = [];
    return result;
  }

  getBuffer(): string[] {
    return [...this.buffer];
  }
}
