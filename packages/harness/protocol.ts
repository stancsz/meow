/**
 * MeowGateway Message Protocol
 * Defines the message types for WebSocket communication
 */

export type MessageType = "PROMPT" | "RESULT" | "STATUS" | "HEARTBEAT" | "SWARM_REPORT" | "ERROR" | "AUTH_REQUEST" | "AUTH_RESPONSE";

export interface GatewayMessage {
  type: MessageType;
  id: string;
  timestamp: number;
  payload: unknown;
  source?: string;
  target?: string;
}

export interface AuthPayload {
  token: string;
}

export interface PromptPayload {
  text: string;
  options?: {
    streaming?: boolean;
    timeout?: number;
    agent?: string;
  };
}

export interface ResultPayload {
  messageId: string;
  content: string;
  success: boolean;
  agentResult?: {
    iterations: number;
    toolCalls: number;
    usage?: {
      inputTokens: number;
      outputTokens: number;
    };
  };
}

export interface StatusPayload {
  agent: string;
  state: "idle" | "thinking" | "executing" | "complete" | "error";
  message?: string;
  progress?: number;
}

export interface HeartbeatPayload {
  sender: string;
  uptime: number;
  load: number;
}

export interface SwarmReportPayload {
  kittenId: string;
  task: string;
  status: "started" | "progress" | "complete" | "error";
  result?: string;
  error?: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
  originalMessageId?: string;
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create a GatewayMessage with common fields
 */
export function createMessage(
  type: MessageType,
  payload: unknown,
  options?: { id?: string; source?: string; target?: string }
): GatewayMessage {
  return {
    type,
    id: options?.id ?? generateMessageId(),
    timestamp: Date.now(),
    payload,
    source: options?.source,
    target: options?.target,
  };
}

/**
 * Serialize a message to JSON string
 */
export function serializeMessage(message: GatewayMessage): string {
  return JSON.stringify(message);
}

/**
 * Parse a message from JSON string
 */
export function parseMessage(data: string): GatewayMessage | null {
  try {
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed.type === "string" && typeof parsed.id === "string") {
      return parsed as GatewayMessage;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Validate a message has required fields
 */
export function isValidMessage(msg: unknown): msg is GatewayMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    "id" in msg &&
    "timestamp" in msg &&
    "payload" in msg
  );
}
