/**
 * session-store.ts
 *
 * Simple JSONL-based session persistence.
 * Sessions stored in ~/.meow/sessions/<timestamp>.jsonl
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
  preview: string;
  timestamp: string;
  forkedFrom?: string;  // Original session ID if this was forked
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
      return {
        id,
        preview: lastUser?.content?.slice(0, 60) || firstUser?.content?.slice(0, 60) || "(empty)",
        timestamp,
        forkedFrom,
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
    output += `  [${s.id}]${forkNote}\n    ${s.preview}...\n    ${date}\n`;
  });
  return output;
}
