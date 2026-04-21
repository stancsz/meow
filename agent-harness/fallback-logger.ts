/**
 * fallback-logger.ts - Structured failure logging for Meow improvement
 *
 * Logs each relay attempt to logs/YYYY-MM-DD_HH-mm-ss_<channelId>_<attemptPath>.json
 * Logs are structured so they can be analyzed to identify Meow failure patterns.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const LOGS_DIR = join(process.cwd(), "logs");

export interface FallbackLogEntry {
  timestamp: string;
  channelId: string;
  userPrompt: string;
  attemptPath: "meow" | "meow→claude-code";
  meowError?: string;
  fallbackSuccess?: boolean;
  finalBackend: "meow" | "claude-code";
  finalResponseLength: number;
}

function ensureLogsDir(): void {
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }
}

/**
 * Write a fallback log entry to disk.
 * File format: logs/YYYY-MM-DD_HH-mm-ss_<channelId>_<attemptPathSafe>.json
 * attemptPath "meow→claude-code" becomes "meow-claude-code" in the filename.
 */
export function logFallback(entry: FallbackLogEntry): void {
  ensureLogsDir();
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const attemptPathSafe = entry.attemptPath.replace("→", "-");
  const filename = `${ts}_${entry.channelId}_${attemptPathSafe}.json`;
  try {
    writeFileSync(join(LOGS_DIR, filename), JSON.stringify(entry, null, 2));
    console.log(`[fallback-log] Logged: ${filename}`);
  } catch (e: any) {
    console.error(`[fallback-log] Failed to write log: ${e.message}`);
  }
}