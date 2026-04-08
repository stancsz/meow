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
 */
import { readFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface SessionMessage {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: string;
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

const SESSION_DIR = join(homedir(), ".meow", "sessions");
const LAST_SESSION_FILE = join(homedir(), ".meow", "last_session");

function ensureDir(): void {
  if (!existsSync(SESSION_DIR)) {
    mkdirSync(SESSION_DIR, { recursive: true });
  }
}

export function getLastSessionId(): string | null {
  try {
    if (existsSync(LAST_SESSION_FILE)) {
      return readFileSync(LAST_SESSION_FILE, "utf-8").trim() || null;
    }
  } catch {
    // Ignore
  }
  return null;
}

function setLastSessionId(id: string): void {
  try {
    ensureDir();
    writeFileSync(LAST_SESSION_FILE, id, "utf-8");
  } catch {
    // Ignore write errors
  }
}

export function nameSession(sessionId: string, name: string): boolean {
  ensureDir();
  const metaFile = join(SESSION_DIR, `${sessionId}.meta.json`);
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
    const metaFile = join(SESSION_DIR, `${sessionId}.meta.json`);
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
  const file = join(SESSION_DIR, `${id}.jsonl`);
  // Mark the session with fork info in first line
  const forkInfo = forkedFrom ? JSON.stringify({ role: "system", content: `[Forked from session: ${forkedFrom}]`, timestamp: new Date().toISOString() }) + "\n" : "";
  appendFileSync(file, forkInfo, "utf-8");
  // Track last session
  setLastSessionId(id);
  return id;
}

export function appendToSession(sessionId: string, messages: SessionMessage[]): void {
  ensureDir();
  const file = join(SESSION_DIR, `${sessionId}.jsonl`);
  const lines = messages.map((m) => JSON.stringify(m)).join("\n") + "\n";
  appendFileSync(file, lines, "utf-8");
}

export function loadSession(sessionId: string): SessionMessage[] {
  const file = join(SESSION_DIR, `${sessionId}.jsonl`);
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
  const file = join(SESSION_DIR, `${sessionId}.jsonl`);
  const lines = messages.map((m) => JSON.stringify(m)).join("\n") + "\n";
  writeFileSync(file, lines, "utf-8");
}

/**
 * Estimate token count (rough approximation)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Compact a session by summarizing old messages.
 * Returns the compacted messages and summary info.
 */
export async function compactSession(
  sessionId: string,
  options: {
    maxTokens?: number;
    summarizeFn: (messages: SessionMessage[]) => Promise<string>;
  }
): Promise<CompactedSession> {
  const messages = loadSession(sessionId);
  const maxTokens = options.maxTokens || 80000;

  // Calculate total tokens
  let totalTokens = 0;
  for (const msg of messages) {
    totalTokens += estimateTokens(msg.content) + 10; // overhead per message
  }

  // If under limit, no need to compact
  if (totalTokens <= maxTokens * 0.8) {
    return {
      messages,
      summary: "",
      originalCount: messages.length,
      compactedCount: messages.length,
    };
  }

  // Keep system message(s) and recent messages
  const systemMessages = messages.filter((m) => m.role === "system" && !m.content.includes("[Previous conversation summarized]"));
  const conversationMessages = messages.filter((m) => m.role !== "system" || !m.content.includes("[Previous conversation summarized]"));

  // Keep last 4-6 exchanges (8-12 messages)
  const keepRecent = 12;
  const recentMessages = conversationMessages.slice(-keepRecent);
  const oldMessages = conversationMessages.slice(0, -keepRecent);

  if (oldMessages.length === 0) {
    return {
      messages,
      summary: "",
      originalCount: messages.length,
      compactedCount: messages.length,
    };
  }

  // Generate summary using LLM
  const summary = await options.summarizeFn(oldMessages);

  // Build compacted session
  const compactedMessages: SessionMessage[] = [
    ...systemMessages,
    {
      role: "system",
      content: `[Previous conversation summarized - ${oldMessages.length} messages condensed into ${estimateTokens(summary)} tokens]`,
      timestamp: new Date().toISOString(),
    },
    {
      role: "system",
      content: `## Conversation Summary\n${summary}`,
      timestamp: new Date().toISOString(),
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
  const file = join(SESSION_DIR, `${newId}.jsonl`);

  // Write all messages except the fork marker (first line if it's a fork marker)
  const messagesToSave = sourceMessages[0]?.content?.startsWith("[Forked from") ? sourceMessages.slice(1) : sourceMessages;
  const lines = messagesToSave.map((m) => JSON.stringify(m)).join("\n") + "\n";
  appendFileSync(file, lines, "utf-8");

  return { id: newId, messages: messagesToSave };
}

export function listSessions(): SessionInfo[] {
  ensureDir();
  try {
    const files = readdirSync(SESSION_DIR)
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
