/**
 * session-store.ts
 *
 * JSONL-based session persistence with LLM-powered compaction.
 * Sessions stored in ~/.meow/sessions/<timestamp>.jsonl
 *
 * Features:
 * - Save/load sessions
 * - Auto-resume from last session
 * - Fork sessions
 * - Compact (summarize old messages when context gets long)
 * 
 * EPOCH 22: Token estimation fixed to use /3 (chars/3) for accuracy.
 * COMPACT_THRESHOLD exported for auto-trigger integration.
 */
import { readFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const COMPACT_THRESHOLD = 20; // When to trigger auto-compaction (messages count)

// Override session directory for testing (set SESSION_DIR before importing)
export let SESSION_DIR_OVERRIDE: string | null = null;
export function setSessionDir(dir: string): void {
  SESSION_DIR_OVERRIDE = dir;
}

export interface SessionMessage {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface SessionInfo {
  id: string;
  name?: string;
  preview: string;
  timestamp: string;
  forkedFrom?: string;  // Original session ID if this was forked
  messageCount: number;
}

export interface CompactedSession {
  messages: SessionMessage[];
  summary: string;
  originalCount: number;
  compactedCount: number;
}

const DEFAULT_SESSION_DIR = join(homedir(), ".meow", "sessions");
const DEFAULT_LAST_SESSION_FILE = join(homedir(), ".meow", "last_session");

export function getSessionDir(sessionId?: string): string {
  return SESSION_DIR_OVERRIDE || DEFAULT_SESSION_DIR;
}

function getLastSessionFile(): string {
  // Use same directory structure as session dir
  if (SESSION_DIR_OVERRIDE) {
    return join(SESSION_DIR_OVERRIDE.replace("sessions", ""), "last_session");
  }
  return DEFAULT_LAST_SESSION_FILE;
}

function ensureDir(): void {
  const dir = getSessionDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function getLastSessionId(): string | null {
  try {
    if (existsSync(getLastSessionFile())) {
      return readFileSync(getLastSessionFile(), "utf-8").trim() || null;
    }
  } catch {
    // Ignore
  }
  return null;
}

function setLastSessionId(id: string): void {
  try {
    ensureDir();
    writeFileSync(getLastSessionFile(), id, "utf-8");
  } catch {
    // Ignore write errors
  }
}

export function nameSession(sessionId: string, name: string): boolean {
  ensureDir();
  const metaFile = join(getSessionDir(), `${sessionId}.meta.json`);
  try {
    const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf-8")) : {};
    meta.name = name;
    writeFileSync(metaFile, JSON.stringify(meta, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

export function getSessionName(sessionId: string): string | null {
  try {
    const metaFile = join(getSessionDir(), `${sessionId}.meta.json`);
    if (existsSync(metaFile)) {
      const meta = JSON.parse(readFileSync(metaFile, "utf-8"));
      return meta.name || null;
    }
  } catch {
    // Ignore
  }
  return null;
}

export function createSession(forkedFrom?: string): string {
  ensureDir();
  const id = `session_${Date.now()}`;
  const file = join(getSessionDir(), `${id}.jsonl`);
  // Mark the session with fork info in first line
  const forkInfo = forkedFrom ? JSON.stringify({ 
    role: "system", 
    content: `[Forked from session: ${forkedFrom}]`, 
    timestamp: new Date().toISOString(),
    metadata: { type: "fork_marker", forkedFrom }
  }) + "\n" : "";
  appendFileSync(file, forkInfo, "utf-8");
  // Track last session
  setLastSessionId(id);
  return id;
}

export function appendToSession(sessionId: string, messages: SessionMessage | SessionMessage[]): void {
  ensureDir();
  const file = join(getSessionDir(), `${sessionId}.jsonl`);
  // Normalize single message to array
  const messageArray = Array.isArray(messages) ? messages : [messages];
  const lines = messageArray.map((m) => JSON.stringify(m)).join("\n") + "\n";
  appendFileSync(file, lines, "utf-8");
}

export function loadSession(sessionId: string): SessionMessage[] {
  const file = join(getSessionDir(), `${sessionId}.jsonl`);
  try {
    const content = readFileSync(file, "utf-8");
    if (!content.trim()) return [];
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

/**
 * Overwrite a session file with new messages (used after compaction)
 */
export function saveSession(sessionId: string, messages: SessionMessage[]): void {
  ensureDir();
  const file = join(getSessionDir(), `${sessionId}.jsonl`);
  const lines = messages.map((m) => JSON.stringify(m)).join("\n") + "\n";
  writeFileSync(file, lines, "utf-8");
}

/**
 * Estimate token count (rough approximation)
 * EPOCH 22: Changed from /4 to /3 for more accurate token estimation
 * (Most LLMs use ~3 chars per token for typical English text)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/**
 * Check if a session needs compaction based on message count threshold.
 * This is the auto-trigger check that can be used by callers.
 */
export function sessionNeedsCompaction(sessionId: string): boolean {
  try {
    const messages = loadSession(sessionId);
    return messages.length >= COMPACT_THRESHOLD;
  } catch {
    return false;
  }
}

/**
 * Auto-triggered session compaction.
 * Call this after adding messages to check if compaction is needed and perform it.
 * Returns compacted result if compaction occurred, or null if not needed.
 */
export async function autoCompactSession(
  sessionId: string,
  options: {
    maxTokens?: number;
    summarizeFn: (messages: SessionMessage[]) => Promise<string>;
  }
): Promise<CompactedSession | null> {
  if (!sessionNeedsCompaction(sessionId)) {
    return null;
  }
  return compactSession(sessionId, options);
}

/**
 * Compact a session by summarizing old messages.
 * Returns the compacted messages and summary info.
 * 
 * Uses message count as primary trigger (COMPACT_THRESHOLD) rather than
 * token-based calculation to ensure reliable compaction.
 * 
 * @param force - If true, compact even if under threshold (for manual triggers)
 */
export async function compactSession(
  sessionId: string,
  options: {
    maxTokens?: number;
    summarizeFn: (messages: SessionMessage[]) => Promise<string>;
    force?: boolean;  // Force compaction regardless of threshold
  }
): Promise<CompactedSession> {
  const messages = loadSession(sessionId);
  
  console.log("[compactSession] called with force=", options.force);
  console.log("[compactSession] loaded", messages.length, "messages");
  console.log("[compactSession] COMPACT_THRESHOLD=", COMPACT_THRESHOLD);

  // Use message count as primary trigger - if under threshold, return early
  // UNLESS force is true (for manual compaction triggers)
  if (messages.length < COMPACT_THRESHOLD && !options.force) {
    return {
      messages,
      summary: "",
      originalCount: messages.length,
      compactedCount: messages.length,
    };
  }

  // Keep system message(s) and recent messages
  const systemMessages = messages.filter((m) => m.role === "system" && m.metadata?.type !== "summary_marker" && m.metadata?.type !== "summary_content");
  const conversationMessages = messages.filter((m) => m.metadata?.type !== "summary_marker" && m.metadata?.type !== "summary_content");

  // For manual compaction (force=true), keep fewer recent messages to ensure some compaction
  // For auto compaction, keep more to reduce frequency
  const keepRecent = options.force ? 6 : 12;
  const recentMessages = conversationMessages.slice(-keepRecent);
  const oldMessages = conversationMessages.slice(0, -keepRecent);

  // If no old messages to compact, return early
  // UNLESS force is true (for manual compaction triggers)
  if (oldMessages.length === 0 && !options.force) {
    return {
      messages,
      summary: "",
      originalCount: messages.length,
      compactedCount: messages.length,
    };
  }

  // For forced compaction with no old messages, we need to still perform some compaction
  // Merge all conversation messages into the recent pool (keep fewer)
  if (oldMessages.length === 0 && options.force) {
    // For manual trigger with all messages in recent, just compact them all
    // Reduce the recent pool to create old messages
    const allConversation = conversationMessages;
    if (allConversation.length > keepRecent) {
      // Already handled above
    } else {
      // Need to compact - take only the last 2 messages
      const remainingMessages = allConversation.slice(-2);
      const toCompact = allConversation.slice(0, -2);
      
      if (toCompact.length === 0) {
        // Nothing to compact, return unchanged
        return {
          messages,
          summary: "",
          originalCount: messages.length,
          compactedCount: messages.length,
        };
      }
      
      // Generate summary using LLM
      const summary = await options.summarizeFn(toCompact);

      // Build compacted session - use SHORT format marker
      // T3.2 requirement: "[Previous conversation summarized]" not extended format
      const compactedMessages: SessionMessage[] = [
        ...systemMessages,
        {
          role: "system",
          content: `[Previous conversation summarized]`,
          timestamp: new Date().toISOString(),
          metadata: { type: "summary_marker" }
        },
        {
          role: "system",
          content: `## Conversation Summary\n${summary}`,
          timestamp: new Date().toISOString(),
          metadata: { type: "summary_content" }
        },
        ...remainingMessages,
      ];

      // Save compacted session
      saveSession(sessionId, compactedMessages);

      return {
        messages: compactedMessages,
        summary,
        originalCount: messages.length,
        compactedCount: compactedMessages.length,
      };
    }
  }

  // Generate summary using LLM
  const summary = await options.summarizeFn(oldMessages);

  // Build compacted session - use SHORT format marker (without extended details)
  // T3.2 requirement: "[Previous conversation summarized]" not extended format
  const compactedMessages: SessionMessage[] = [
    ...systemMessages,
    {
      role: "system",
      content: `[Previous conversation summarized]`,
      timestamp: new Date().toISOString(),
      metadata: { type: "summary_marker" }
    },
    {
      role: "system",
      content: `## Conversation Summary\n${summary}`,
      timestamp: new Date().toISOString(),
      metadata: { type: "summary_content" }
    },
    ...recentMessages,
  ];

  // Save compacted session
  saveSession(sessionId, compactedMessages);

  return {
    messages: compactedMessages,
    summary,
    originalCount: messages.length,
    compactedCount: compactedMessages.length,
  };
}

export function getSessionStats(sessionId: string): { messageCount: number; estimatedTokens: number } {
  const messages = loadSession(sessionId);
  let totalTokens = 0;
  for (const msg of messages) {
    totalTokens += estimateTokens(msg.content) + 10;
  }
  return {
    messageCount: messages.length,
    estimatedTokens: totalTokens,
  };
}

/**
 * Fork an existing session, creating a new session with the same messages.
 * The forked session can diverge from the original.
 */
export function forkSession(sourceSessionId: string): { id: string; messages: SessionMessage[] } | null {
  const sourceMessages = loadSession(sourceSessionId);
  if (sourceMessages.length === 0) return null;

  const newId = createSession(sourceSessionId);
  const file = join(getSessionDir(), `${newId}.jsonl`);

  // Write all messages except the fork marker (first line if it's a fork marker)
  const messagesToSave = sourceMessages[0]?.content?.startsWith("[Forked from") ? sourceMessages.slice(1) : sourceMessages;
  const lines = messagesToSave.map((m) => JSON.stringify(m)).join("\n") + "\n";
  appendFileSync(file, lines, "utf-8");

  return { id: newId, messages: messagesToSave };
}

export function listSessions(): SessionInfo[] {
  ensureDir();
  try {
    const files = readdirSync(getSessionDir())
      .filter((f) => f.endsWith(".jsonl"))
      // Only include sessions with numeric IDs (skip test_session_* etc)
      .filter((f) => /^\d+\.jsonl$/.test(f) || /^session_\d+\.jsonl$/.test(f))
      .sort()
      .reverse();

    return files.map((f) => {
      const id = f.replace(".jsonl", "");
      const messages = loadSession(id);
      const firstUser = messages.find((m) => m.role === "user");
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      // Check if this session was forked
      const forkMarker = messages.find((m) => m.content?.startsWith("[Forked from session:"));
      const forkedFrom = forkMarker?.content?.match(/\[Forked from session: (.+)\]/)?.[1];
      // Extract numeric timestamp from ID
      const numericPart = id.replace(/^[^\d]*(\d+).*$/, "$1");
      const timestamp = numericPart || id;
      // Load session name from meta file
      const name = getSessionName(id);
      return {
        id,
        name: name || undefined,
        preview: lastUser?.content?.slice(0, 60) || firstUser?.content?.slice(0, 60) || "(empty)",
        timestamp,
        forkedFrom,
        messageCount: messages.length,
      };
    });
  } catch {
    return [];
  }
}

export function formatSessions(sessions: SessionInfo[]): string {
  if (sessions.length === 0) return "No sessions.";

  let output = "## Sessions\n";
  sessions.forEach((s) => {
    const ts = parseInt(s.timestamp);
    const date = isNaN(ts) ? "Unknown date" : new Date(ts).toLocaleString();
    const forkNote = s.forkedFrom ? ` (forked from ${s.forkedFrom})` : "";
    const nameNote = s.name ? ` "${s.name}"` : "";
    output += `  [${s.id}]${nameNote}${forkNote}\n    ${s.preview}...\n    ${date} · ${s.messageCount} msgs\n`;
  });
  return output;
}

