/**
 * Agent State Types
 * 
 * Rich state indicators for agent execution phases.
 * Inspired by Vox agent patterns.
 */

export enum AgentState {
  /** Initial state, waiting for response */
  THINKING = "thinking",
  /** Indexing or searching through files/context */
  INDEXING = "indexing",
  /** Reading files from disk */
  READING = "reading",
  /** Writing files to disk */
  WRITING = "writing",
  /** Executing shell commands */
  EXECUTING = "executing",
  /** Waiting for user permission/approval */
  WAITING_PERMISSION = "waiting_permission",
  /** Summarizing context or results */
  SUMMARIZING = "summarizing",
  /** Agent has completed successfully */
  COMPLETE = "complete",
  /** Agent encountered an error */
  ERROR = "error",
}

/**
 * State change event for streaming
 */
export interface StateChangeEvent {
  type: "state_change";
  state: AgentState;
  message?: string;
}

/**
 * State emojis for display
 */
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

/**
 * State descriptions for display
 */
export const AGENT_STATE_DESCRIPTION: Record<AgentState, string> = {
  [AgentState.THINKING]: "Thinking...",
  [AgentState.INDEXING]: "Indexing codebase...",
  [AgentState.READING]: "Reading files...",
  [AgentState.WRITING]: "Writing files...",
  [AgentState.EXECUTING]: "Executing commands...",
  [AgentState.WAITING_PERMISSION]: "Waiting for permission...",
  [AgentState.SUMMARIZING]: "Summarizing...",
  [AgentState.COMPLETE]: "Complete",
  [AgentState.ERROR]: "Error",
};
