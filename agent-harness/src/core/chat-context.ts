/**
 * chat-context.ts - Auto-Trigger Integration for Session Compaction
 */
import { 
  compactSession, 
  sessionNeedsCompaction, 
  appendToSession,
  loadSession,
  SessionMessage,
  getSessionDir,
} from './session-store';
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Check if a session needs compaction.
 * Delegates to sessionNeedsCompaction from session-store.
 */
export function needsCompaction(sessionId: string): boolean {
  return sessionNeedsCompaction(sessionId);
}

/**
 * Options for chat context operations
 */
export interface ChatContextOptions {
  sessionId: string;
  maxTokens?: number;
  summarizeFn: (messages: SessionMessage[]) => Promise<string>;
}

/**
 * Result of getContext operation
 */
export interface ContextResult {
  sessionId: string;
  messages: SessionMessage[];
  hasSummary: boolean;
  formattedContent: string;
}

/**
 * Result of appendWithAutoCompact
 */
export interface AppendResult {
  appended: boolean;
  compactionResult?: any;
}

/**
 * Add a message to chat context and auto-compact if threshold reached.
 */
export async function appendWithAutoCompact(
  sessionId: string,
  messages: SessionMessage | SessionMessage[],
  options: ChatContextOptions
): Promise<AppendResult> {
  const messageArray = Array.isArray(messages) ? messages : [messages];

  // Append messages
  appendToSession(sessionId, messageArray);

  // Check for compaction
  if (sessionNeedsCompaction(sessionId)) {
    const result = await compactSession(sessionId, {
      maxTokens: options.maxTokens,
      summarizeFn: options.summarizeFn,
    });

    return { appended: true, compactionResult: result };
  }

  return { appended: true };
}

/**
 * Manually trigger compaction for a session.
 */
export async function triggerCompaction(
  sessionId: string,
  options: ChatContextOptions
): Promise<any> {
  try {
    const dir = getSessionDir();
    const file = join(dir, `${sessionId}.jsonl`);
    
    // Return null for non-existent session (no file created)
    if (!existsSync(file)) return null;
    
    // Check if session has messages - if not, return null
    const messages = loadSession(sessionId);
    if (messages.length === 0) return null;
    
    // Pass force=true to bypass threshold check
    const result = await compactSession(sessionId, {
      maxTokens: options.maxTokens,
      summarizeFn: options.summarizeFn,
      force: true,
    });
    
    return result;
  } catch (e) {
    console.error(`[chat-context] Failed to trigger compaction for ${sessionId}:`, e);
    return null;
  }
}

/**
 * Get formatted context for LLM consumption.
 * Returns structured result with messages and formatted string.
 */
export function getContext(sessionId: string, maxRecent?: number): ContextResult {
  let messages: SessionMessage[] = [];
  const sessionDir = getSessionDir();
  const file = join(sessionDir, `${sessionId}.jsonl`);
  
  // Check if session file exists - if not, it's a non-existent session
  if (!existsSync(file)) {
    return { sessionId, messages: [], hasSummary: false, formattedContent: "" };
  }
  
  try {
    messages = loadSession(sessionId);
  } catch (e) {
    console.error(`[chat-context] Error loading session ${sessionId}:`, e);
    return { sessionId, messages: [], hasSummary: false, formattedContent: "" };
  }

  if (messages.length === 0) {
    return { sessionId, messages: [], hasSummary: false, formattedContent: "" };
  }

  // Check for structured metadata or fallback to string matching for legacy sessions
  const isSummary = (m: SessionMessage) => 
    m.metadata?.type === "summary_marker" || 
    (m.role === "system" && m.content.includes("[Previous conversation summarized"));

  const hasSummary = messages.some(isSummary);

  let contextMessages: SessionMessage[];
  if (maxRecent !== undefined && maxRecent > 0) {
    const recent = messages.slice(-maxRecent);
    if (hasSummary) {
      // Ensure summary markers are always included in context even if old
      const summaries = messages.filter(m => isSummary(m) || m.metadata?.type === "summary_content");
      contextMessages = [...summaries, ...recent];
    } else {
      contextMessages = recent;
    }
  } else {
    contextMessages = messages;
  }

  return {
    sessionId,
    messages: contextMessages,
    hasSummary,
    formattedContent: renderContext(contextMessages)
  };
}

/**
 * Private helper to render messages to a string.
 * This is now internal - callers should use getContext().formattedContent
 */
function renderContext(messages: SessionMessage[]): string {
  return messages
    .map(m => {
      const header = m.role === "system" ? "[System]" : `[${m.role}]`;
      return `${header}\n${m.content}`;
    })
    .join("\n\n")
    .trim();
}

/**
 * chatContext object exports - convenience wrapper for all chat context operations
 */
export const chatContext = {
  appendWithAutoCompact,
  triggerCompaction,
  getContext,
  needsCompaction,
};