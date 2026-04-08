/**
 * memory-fts.ts — FTS5-Based Cross-Session Memory
 *
 * Provides full-text search across sessions using SQLite FTS5.
 * Enables cross-session recall for agent-curated memory.
 *
 * Features:
 * - FTS5 virtual table for full-text search
 * - Semantic memory tagging
 * - LLM-powered memory summarization
 * - Cross-session recall via natural language queries
 *
 * Usage:
 *   import { memorySearch, memoryStore, memorySummarize } from "./memory-fts";
 *   await memorySearch("What did I learn about Go?");
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ============================================================================
// Paths
// ============================================================================

const MEOW_DIR = join(homedir(), ".meow");
const MEMORY_DIR = join(MEOW_DIR, "memory-fts");
const FTS_DB_PATH = join(MEMORY_DIR, "memory.db");

// ============================================================================
// Types
// ============================================================================

export interface MemoryEntry {
  id?: number;
  key: string;
  value: string;
  timestamp: string;
  tags: string[];
  source: "user" | "agent" | "session" | "import" | "evolve";
  sessionId?: string;
  importance: number; // 1-5 scale for retention
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  rank: number;
  snippet: string;
}

// ============================================================================
// Database Setup
// ============================================================================

let db: Database.Database | null = null;

function ensureMemoryDir(): void {
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function getDb(): Database.Database {
  if (db) return db;

  ensureMemoryDir();
  db = new Database(FTS_DB_PATH);

  // Enable FTS5
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      tags TEXT NOT NULL,
      source TEXT NOT NULL,
      session_id TEXT,
      importance INTEGER DEFAULT 3
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      key,
      value,
      tags,
      content='memories',
      content_rowid='id'
    );

    -- Triggers to keep FTS5 in sync
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, key, value, tags) VALUES (new.id, new.key, new.value, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, key, value, tags) VALUES('delete', old.id, old.key, old.value, old.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, key, value, tags) VALUES('delete', old.id, old.key, old.value, old.tags);
      INSERT INTO memories_fts(rowid, key, value, tags) VALUES (new.id, new.key, new.value, new.tags);
    END;
  `);

  return db;
}

// ============================================================================
// Memory Operations
// ============================================================================

export function storeMemory(
  key: string,
  value: string,
  options: {
    tags?: string[];
    source?: MemoryEntry["source"];
    sessionId?: string;
    importance?: number;
  } = {}
): number {
  const database = getDb();
  const tags = JSON.stringify(options.tags || []);
  const importance = options.importance ?? 3;

  const stmt = database.prepare(`
    INSERT INTO memories (key, value, timestamp, tags, source, session_id, importance)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    key,
    value,
    new Date().toISOString(),
    tags,
    options.source || "agent",
    options.sessionId || null,
    importance
  );

  return result.lastInsertRowid as number;
}

export function searchMemory(query: string, limit: number = 10): MemorySearchResult[] {
  const database = getDb();

  if (!query.trim()) return [];

  // Use FTS5 for full-text search
  const stmt = database.prepare(`
    SELECT m.*, bm25(memories_fts) as rank,
           snippet(memories_fts, 1, '[', ']', '...', 20) as snippet
    FROM memories_fts
    JOIN memories m ON memories_fts.rowid = m.id
    WHERE memories_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `);

  try {
    const rows = stmt.all(query, limit) as any[];
    return rows.map((row) => ({
      entry: {
        id: row.id,
        key: row.key,
        value: row.value,
        timestamp: row.timestamp,
        tags: JSON.parse(row.tags),
        source: row.source as MemoryEntry["source"],
        sessionId: row.session_id,
        importance: row.importance,
      },
      rank: row.rank,
      snippet: row.snippet,
    }));
  } catch {
    // If FTS query fails, fall back to LIKE search
    const fallbackStmt = database.prepare(`
      SELECT * FROM memories
      WHERE value LIKE ? OR key LIKE ? OR tags LIKE ?
      ORDER BY importance DESC, timestamp DESC
      LIMIT ?
    `);
    const likeQuery = `%${query}%`;
    const rows = fallbackStmt.all(likeQuery, likeQuery, likeQuery, limit) as any[];
    return rows.map((row) => ({
      entry: {
        id: row.id,
        key: row.key,
        value: row.value,
        timestamp: row.timestamp,
        tags: JSON.parse(row.tags),
        source: row.source as MemoryEntry["source"],
        sessionId: row.session_id,
        importance: row.importance,
      },
      rank: 0,
      snippet: row.value.slice(0, 100),
    }));
  }
}

export function getRecentMemories(limit: number = 20): MemoryEntry[] {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT * FROM memories
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const rows = stmt.all(limit) as any[];
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    value: row.value,
    timestamp: row.timestamp,
    tags: JSON.parse(row.tags),
    source: row.source as MemoryEntry["source"],
    sessionId: row.session_id,
    importance: row.importance,
  }));
}

export function getMemoriesByTag(tag: string, limit: number = 20): MemoryEntry[] {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT * FROM memories
    WHERE tags LIKE ?
    ORDER BY importance DESC, timestamp DESC
    LIMIT ?
  `);

  const rows = stmt.all(`%"${tag}"%`, limit) as any[];
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    value: row.value,
    timestamp: row.timestamp,
    tags: JSON.parse(row.tags),
    source: row.source as MemoryEntry["source"],
    sessionId: row.session_id,
    importance: row.importance,
  }));
}

export function deleteMemory(id: number): boolean {
  const database = getDb();
  const stmt = database.prepare("DELETE FROM memories WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

export function clearLowImportanceMemories(threshold: number = 2): number {
  const database = getDb();
  const stmt = database.prepare("DELETE FROM memories WHERE importance < ?");
  const result = stmt.run(threshold);
  return result.changes;
}

export function updateMemoryImportance(id: number, importance: number): boolean {
  const database = getDb();
  const stmt = database.prepare("UPDATE memories SET importance = ? WHERE id = ?");
  const result = stmt.run(importance, id);
  return result.changes > 0;
}

// ============================================================================
// LLM Summarization Integration
// ============================================================================

export async function summarizeMemoriesForContext(
  memories: MemoryEntry[],
  summarizeFn: (text: string) => Promise<string>
): Promise<string> {
  if (memories.length === 0) return "";

  const memoryText = memories
    .map((m) => `[${m.key}] ${m.value}`)
    .join("\n");

  const prompt = `Summarize the following agent memories into concise facts for future context.\nFocus on: skills learned, user preferences, project state, and important decisions.\n\nMemories:\n${memoryText}\n\nSummary:`;

  const summary = await summarizeFn(prompt);
  return summary;
}

// ============================================================================
// Cross-Session Recall
// ============================================================================

export async function recallFromMemory(
  query: string,
  options: {
    limit?: number;
    summarize?: boolean;
    summarizeFn?: (text: string) => Promise<string>;
  } = {}
): Promise<{ results: MemorySearchResult[]; summary?: string }> {
  const limit = options.limit ?? 10;
  const results = searchMemory(query, limit);

  let summary: string | undefined;
  if (options.summarize && options.summarizeFn && results.length > 0) {
    summary = await summarizeMemoriesForContext(
      results.map((r) => r.entry),
      options.summarizeFn
    );
  }

  return { results, summary };
}

// ============================================================================
// Session Memory Integration
// ============================================================================

export function storeSessionMemory(
  sessionId: string,
  key: string,
  value: string,
  options: {
    tags?: string[];
    importance?: number;
  } = {}
): number {
  return storeMemory(key, value, {
    ...options,
    source: "session",
    sessionId,
  });
}

export function getSessionMemories(sessionId: string): MemoryEntry[] {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT * FROM memories
    WHERE session_id = ?
    ORDER BY timestamp DESC
  `);

  const rows = stmt.all(sessionId) as any[];
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    value: row.value,
    timestamp: row.timestamp,
    tags: JSON.parse(row.tags),
    source: row.source as MemoryEntry["source"],
    sessionId: row.session_id,
    importance: row.importance,
  }));
}

// ============================================================================
// Stats
// ============================================================================

export function getMemoryStats(): {
  totalMemories: number;
  bySource: Record<string, number>;
  byTag: Record<string, number>;
  avgImportance: number;
  oldestMemory: string | null;
  newestMemory: string | null;
} {
  const database = getDb();

  const totalStmt = database.prepare("SELECT COUNT(*) as count FROM memories");
  const total = (totalStmt.get() as any).count;

  const sourceStmt = database.prepare("SELECT source, COUNT(*) as count FROM memories GROUP BY source");
  const sourceRows = sourceStmt.all() as any[];
  const bySource: Record<string, number> = {};
  for (const row of sourceRows) {
    bySource[row.source] = row.count;
  }

  // Get tag distribution (approximate)
  const tagStmt = database.prepare("SELECT tags FROM memories");
  const tagRows = tagStmt.all() as any[];
  const byTag: Record<string, number> = {};
  for (const row of tagRows) {
    try {
      const tags = JSON.parse(row.tags) as string[];
      for (const tag of tags) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }
    } catch {}
  }

  const timeStmt = database.prepare("SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM memories");
  const timeRow = timeStmt.get() as any;

  const avgStmt = database.prepare("SELECT AVG(importance) as avg FROM memories");
  const avgRow = avgStmt.get() as any;

  return {
    totalMemories: total,
    bySource,
    byTag,
    avgImportance: avgRow.avg || 0,
    oldestMemory: timeRow.oldest,
    newestMemory: timeRow.newest,
  };
}

// ============================================================================
// Format Output
// ============================================================================

export function formatMemoryStats(): string {
  const stats = getMemoryStats();
  const lines = [
    "## Memory Stats",
    `  Total memories: ${stats.totalMemories}`,
    `  Avg importance: ${stats.avgImportance.toFixed(1)}`,
    `  Oldest: ${stats.oldestMemory ? new Date(stats.oldestMemory).toLocaleDateString() : "none"}`,
    `  Newest: ${stats.newestMemory ? new Date(stats.newestMemory).toLocaleDateString() : "none"}`,
    "",
    "  By source:",
  ];

  for (const [source, count] of Object.entries(stats.bySource)) {
    lines.push(`    ${source}: ${count}`);
  }

  lines.push("", "  Top tags:");
  const topTags = Object.entries(stats.byTag)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  for (const [tag, count] of topTags) {
    lines.push(`    ${tag}: ${count}`);
  }

  return lines.join("\n");
}

export function formatSearchResults(results: MemorySearchResult[]): string {
  if (results.length === 0) return "No memories found.";

  let output = "## Memory Search Results\n\n";
  for (const { entry, snippet } of results) {
    output += `### [${entry.key}]\n`;
    output += `${snippet}\n`;
    output += `*Tags: ${entry.tags.join(", ")} | Source: ${entry.source} | ${entry.timestamp}*\n\n`;
  }

  return output;
}

// ============================================================================
// Initialize
// ============================================================================

export function initMemoryFts(): void {
  ensureMemoryDir();
  getDb();
  console.log("[memory-fts] FTS5 memory initialized at", FTS_DB_PATH);
}

// ============================================================================
// CLI
// ============================================================================

if (import.meta.main) {
  initMemoryFts();

  const args = process.argv.slice(2);

  if (args[0] === "--search") {
    const query = args.slice(1).join(" ");
    const results = searchMemory(query, 10);
    console.log(formatSearchResults(results));
  } else if (args[0] === "--stats") {
    console.log(formatMemoryStats());
  } else if (args[0] === "--recent") {
    const memories = getRecentMemories(10);
    let output = "## Recent Memories\n\n";
    for (const m of memories) {
      output += `[${m.key}] ${m.value.slice(0, 80)}...\n`;
      output += `*${m.timestamp}*\n\n`;
    }
    console.log(output);
  } else {
    console.log(`
🐣 MEOW FTS5 MEMORY

Usage:
  bun run src/sidecars/memory-fts.ts --search <query>
  bun run src/sidecars/memory-fts.ts --stats
  bun run src/sidecars/memory-fts.ts --recent
    `);
  }
}
