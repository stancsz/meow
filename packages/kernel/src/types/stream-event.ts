/**
 * Stream Event Types
 * 
 * Event types for agent streaming responses.
 * Supports token delivery, state changes, and tool execution events.
 */

import { AgentState } from "./agent-state";

/**
 * Stream event types
 */
export type StreamEventType = 
  | "token"
  | "state_change"
  | "tool_start"
  | "tool_end"
  | "error"
  | "complete";

/**
 * Stream event with type discrimination
 */
export interface StreamEvent {
  type: StreamEventType;
  
  /** Token content (for token events) */
  content?: string;
  
  /** State information (for state_change events) */
  state?: AgentState;
  stateMessage?: string;
  
  /** Tool information (for tool_start/tool_end events) */
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  
  /** Error information (for error events) */
  error?: string;
  
  /** Timestamp */
  timestamp: number;
}

/**
 * Stream event handler callback
 */
export type StreamEventHandler = (event: StreamEvent) => void;

/**
 * Create a token event
 */
export function tokenEvent(content: string): StreamEvent {
  return {
    type: "token",
    content,
    timestamp: Date.now(),
  };
}

/**
 * Create a state change event
 */
export function stateChangeEvent(state: AgentState, message?: string): StreamEvent {
  return {
    type: "state_change",
    state,
    stateMessage: message,
    timestamp: Date.now(),
  };
}

/**
 * Create a tool start event
 */
export function toolStartEvent(toolName: string, toolInput?: unknown): StreamEvent {
  return {
    type: "tool_start",
    toolName,
    toolInput,
    timestamp: Date.now(),
  };
}

/**
 * Create a tool end event
 */
export function toolEndEvent(toolName: string, toolOutput?: unknown): StreamEvent {
  return {
    type: "tool_end",
    toolName,
    toolOutput,
    timestamp: Date.now(),
  };
}

/**
 * Create an error event
 */
export function errorEvent(error: string): StreamEvent {
  return {
    type: "error",
    error,
    timestamp: Date.now(),
  };
}

/**
 * Create a complete event
 */
export function completeEvent(): StreamEvent {
  return {
    type: "complete",
    timestamp: Date.now(),
  };
}