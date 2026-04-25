/**
 * chat-context.ts
 *
 * Wrapper around session-store.ts that provides auto-trigger compaction.
 * 
 * This module orchestrates the auto-compaction workflow:
 * - appendWithAutoCompact() → appends messages and triggers compaction if needed
 * - triggerCompaction() → manual compaction trigger
 * - getContext() → retrieves current context for LLM
 * - needsCompaction() → checks if session threshold is reached
 * 
 * EPOCH 23: GAP-1 resolution - wiring auto-trigger between session-store.ts and callers.
 */
import { 
  compactSession, 
  sessionNeedsCompaction, 
  appendToSession, 
  loadSession, 
  COMPACT_THRESHOLD,
  type SessionMessage,
  type CompactedSession
} from './session-store';

/**
 * Configuration options for ChatContext operations.
 */
export interface ChatContextOptions {
  sessionId: string;
  maxTokens?: number;
  summarizeFn: (messages: SessionMessage[]) => Promise<string>;
}

/**
 * Result from appendWithAutoCompact operation.
 */
export interface AppendResult {
  /** Whether message(s) were successfully appended */
  appended: boolean;
  /** Compaction result if auto-compaction was triggered */
  compactionResult?: CompactedSession;
}

/**
 * Result from getContext operation.
 */
export interface ContextResult {
  /** Recent messages from session */
  messages: SessionMessage[];
  /** Formatted content string for LLM */
  formattedContent: string;
  /** Whether session has been compacted with a summary */
  hasSummary: boolean;
  /** Original message count before any compaction */
  originalCount: number;
}

/**
 * ChatContext API - auto-trigger wrapper for session-store.ts
 */
export const chatContext = {
  /**
   * Add messages to chat context and auto-compact if threshold reached.
   * 
   * @param sessionId - The session to append to
   * @param messages - Messages to append
   * @param options - Include summarizeFn for compaction
   * @returns Result with appended status and optional compaction result
   */
  async appendWithAutoCompact(
    sessionId: string,
    messages: SessionMessage | SessionMessage[],
    options: ChatContextOptions
  ): Promise<AppendResult> {
    try {
      // Normalize to array
      const messageArray = Array.isArray(messages) ? messages : [messages];
      
      // Append messages to session
      appendToSession(sessionId, messageArray);
      
      // Check if compaction is needed after appending
      if (sessionNeedsCompaction(sessionId)) {
        const compactionResult = await compactSession(sessionId, {
          summarizeFn: options.summarizeFn,
          maxTokens: options.maxTokens,
        });
        
        return {
          appended: true,
          compactionResult,
        };
      }
      
      return { appended: true };
    } catch (error) {
      console.error("[chatContext.appendWithAutoCompact] Error:", error);
      return { appended: false };
    }
  },

  /**
   * Manually trigger compaction regardless of threshold.
   * Use this for explicit /compact commands.
   * 
   * @param sessionId - The session to compact
   * @param options - Include summarizeFn for compaction
   * @returns Compaction result, or null if session doesn't exist or is empty
   */
  async triggerCompaction(
    sessionId: string,
    options: ChatContextOptions
  ): Promise<CompactedSession | null> {
    try {
      const messages = loadSession(sessionId);
      
      // If no messages, return null gracefully
      if (messages.length === 0) {
        return null;
      }
      
      // Force compaction regardless of threshold
      const result = await compactSession(sessionId, {
        summarizeFn: options.summarizeFn,
        maxTokens: options.maxTokens,
        force: true,
      });
      
      return result;
    } catch (error) {
      console.error("[chatContext.triggerCompaction] Error:", error);
      return null;
    }
  },

  /**
   * Get current context for LLM consumption.
   * Returns formatted context including summary markers after compaction.
   * 
   * @param sessionId - The session to retrieve context from
   * @param maxRecent - Optional limit on recent messages to return
   * @returns Context result with messages, formatted content, and summary status
   */
  getContext(sessionId: string, maxRecent?: number): ContextResult {
    try {
      let messages = loadSession(sessionId);
      
      // Apply maxRecent limit if specified
      if (maxRecent !== undefined && maxRecent > 0) {
        messages = messages.slice(-maxRecent);
      }
      
      // Check for summary markers - metadata.type should be set by compactSession
      let hasSummary = false;
      for (const m of messages) {
        const metaType = (m.metadata && typeof m.metadata === 'object') ? (m.metadata as any).type : undefined;
        if (metaType === "summary_marker" || metaType === "summary_content") {
          hasSummary = true;
          break;
        }
      }
      
      // Format messages for LLM
      const formattedContent = messages
        .map((m) => {
          const role = m.role === "system" ? "System" : m.role === "user" ? "User" : "Assistant";
          return `[${role}] ${m.content}`;
        })
        .join("\n\n");
      
      const result: ContextResult = {
        messages,
        formattedContent,
        hasSummary: hasSummary,
        originalCount: messages.length,
      };
      return result;
    } catch (error) {
      console.error("[chatContext.getContext] Error:", error);
      return {
        messages: [],
        formattedContent: "",
        hasSummary: false,
        originalCount: 0,
      };
    }
  },

  /**
   * Check if a session needs compaction based on message count threshold.
   * Delegates to sessionNeedsCompaction() from session-store.ts.
   * 
   * @param sessionId - The session to check
   * @returns true if session has reached COMPACT_THRESHOLD (20 messages)
   */
  needsCompaction(sessionId: string): boolean {
    try {
      return sessionNeedsCompaction(sessionId);
    } catch {
      return false;
    }
  },
};