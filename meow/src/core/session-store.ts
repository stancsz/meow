/**
 * session-store.ts
 *
 * Simple JSONL-based session persistence.
 * Sessions stored in ~/.meow/sessions/<timestamp>.jsonl
 */
import { readFileSync, appendFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, homedir } from "node:path";

export interface SessionMessage {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: string;
}

const SESSION_DIR = join(homedir(), ".meow", "sessions");

function ensureDir(): void {
  if (!existsSync(SESSION_DIR)) {
    mkdirSync(SESSION_DIR, { recursive: true });
  }
}

export function createSession(): string {
  ensureDir();
  const id = `session_${Date.now()}`;
  const file = join(SESSION_DIR, `${id}.jsonl`);
  appendFileSync(file, "", "utf-8"); // create empty file
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

export function listSessions(): { id: string; preview: string; timestamp: string }[] {
  ensureDir();
  try {
    const files = readdirSync(SESSION_DIR)
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .reverse();

    return files.map((f) => {
      const id = f.replace(".jsonl", "");
      const messages = loadSession(id);
      const firstUser = messages.find((m) => m.role === "user");
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      return {
        id,
        preview: lastUser?.content?.slice(0, 60) || firstUser?.content?.slice(0, 60) || "(empty)",
        timestamp: id.replace("session_", ""),
      };
    });
  } catch {
    return [];
  }
}

export function formatSessions(sessions: { id: string; preview: string; timestamp: string }[]): string {
  if (sessions.length === 0) return "No sessions.";

  let output = "## Sessions\n";
  sessions.forEach((s) => {
    const date = new Date(parseInt(s.timestamp)).toLocaleString();
    output += `  [${s.id}]\n    ${s.preview}...\n    ${date}\n`;
  });
  return output;
}
