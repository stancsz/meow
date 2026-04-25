/**
 * session-store.ts
 *
 * JSONL-based session persistence with LLM-powered compaction.
 * Sessions stored in ~/.meow/sessions/<timestamp>.jsonl
 */
import { readFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// Global override for testing - persists across module imports
const GLOBAL_SESSION_DIR_KEY = "__MEOW_SESSION_DIR__";
function getGlobalSessionDir(): string | null {
  return (globalThis as any)[GLOBAL_SESSION_DIR_KEY] || null;
}
function setGlobalSessionDir(dir: string): void {
  (globalThis as any)[GLOBAL_SESSION_DIR_KEY] = dir;
}

export const COMPACT_THRESHOLD = 20; // When to trigger auto-compaction (messages count)

// Override session directory for testing (set SESSION_DIR before importing)
let SESSION_DIR_OVERRIDE: string | null = null;
export function setSessionDir(dir: string): void {
  SESSION_DIR_OVERRIDE = dir;
  setGlobalSessionDir(dir); // Also set global for cross-module sharing
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

export function getSessionDir(): string {
  // Check global override first (for cross-module test sharing)
  const globalDir = getGlobalSessionDir();
  if (globalDir) return globalDir;
  // Then check module-level override
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

export function saveSession(sessionId: string, messages: SessionMessage[]): void {
  ensureDir();
  const file = join(getSessionDir(), `${sessionId}.jsonl`);
  const lines = messages.map((m) => JSON.stringify(m)).join("\n") + "\n";
  writeFileSync(file, lines, "utf-8");
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export function sessionNeedsCompaction(sessionId: string): boolean {
  try {
    const messages = loadSession(sessionId);
    return messages.length >= COMPACT_THRESHOLD;
  } catch {
    return false;
  }
}

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

export async function compactSession(
  sessionId: string,
  options: {
    maxTokens?: number;
    summarizeFn: (messages: SessionMessage[]) => Promise<string>;
    force?: boolean;
  }
): Promise<CompactedSession> {
  const messages = loadSession(sessionId);
  if (messages.length < COMPACT_THRESHOLD && !options.force) {
    return { messages, summary: "", originalCount: messages.length, compactedCount: messages.length };
  }

  const systemMessages = messages.filter((m) => m.role === "system" && m.metadata?.type !== "summary_marker" && m.metadata?.type !== "summary_content");
  const conversationMessages = messages.filter((m) => m.metadata?.type !== "summary_marker" && m.metadata?.type !== "summary_content");

  const keepRecent = options.force ? 6 : 12;
  const recentMessages = conversationMessages.slice(-keepRecent);
  const oldMessages = conversationMessages.slice(0, -keepRecent);

  if (oldMessages.length === 0 && !options.force) {
    return { messages, summary: "", originalCount: messages.length, compactedCount: messages.length };
  }

  const summary = await options.summarizeFn(oldMessages.length > 0 ? oldMessages : conversationMessages.slice(0, -2));

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
    ...(oldMessages.length > 0 ? recentMessages : conversationMessages.slice(-2)),
  ];

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
  return { messageCount: messages.length, estimatedTokens: totalTokens };
}

export function forkSession(sourceSessionId: string): { id: string; messages: SessionMessage[] } | null {
  const sourceMessages = loadSession(sourceSessionId);
  if (sourceMessages.length === 0) return null;

  const newId = createSession(sourceSessionId);
  const file = join(getSessionDir(), `${newId}.jsonl`);
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
      .filter((f) => /^\d+\.jsonl$/.test(f) || /^session_\d+\.jsonl$/.test(f))
      .sort()
      .reverse();

    return files.map((f) => {
      const id = f.replace(".jsonl", "");
      const messages = loadSession(id);
      const firstUser = messages.find((m) => m.role === "user");
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const forkMarker = messages.find((m) => m.content?.startsWith("[Forked from session:"));
      const forkedFrom = forkMarker?.content?.match(/\[Forked from session: (.+)\]/)?.[1];
      const numericPart = id.replace(/^[^\d]*(\d+).*$/, "$1");
      const timestamp = numericPart || id;
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
