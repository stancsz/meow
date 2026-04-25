/**
 * memory.ts \u2014 Memory Sidecar
 *
 * Persistent memory for Meow across sessions.
 * Memory is stored as JSON files in ~/.agent-kernel/memory/
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface MemoryEntry {
  key: string;
  value: unknown;
  timestamp: string;
  tags?: string[];
  source?: "user" | "agent" | "session" | "import";
}

export interface MemoryStore {
  updatedAt: string;
  entries: Record<string, MemoryEntry>;
}

export interface MemoryStats {
  totalEntries: number;
  entriesBySource: Record<string, number>;
  oldestEntry: string | null;
  newestEntry: string | null;
  sizeBytes: number;
}

const MEOW_DIR = join(homedir(), ".meow");
const MEMORY_DIR = join(MEOW_DIR, "memory");

function ensureMemoryDir(): void {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
}

function memoryFilePath(storeName: string): string {
  return join(MEMORY_DIR, `${storeName}.json`);
}

export function loadStore(storeName: string): MemoryStore {
  ensureMemoryDir();
  const filePath = memoryFilePath(storeName);
  if (!existsSync(filePath)) return { updatedAt: new Date().toISOString(), entries: {} };
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as MemoryStore;
  } catch {
    return { updatedAt: new Date().toISOString(), entries: {} };
  }
}

function saveStore(storeName: string, store: MemoryStore): void {
  ensureMemoryDir();
  store.updatedAt = new Date().toISOString();
  writeFileSync(memoryFilePath(storeName), JSON.stringify(store, null, 2), "utf-8");
}

export function getMemory(storeName: string, key: string): unknown {
  return loadStore(storeName).entries[key]?.value ?? null;
}

export function setMemory(
  storeName: string,
  key: string,
  value: unknown,
  options: { tags?: string[]; source?: "user" | "agent" | "session" | "import" } = {}
): void {
  const store = loadStore(storeName);
  store.entries[key] = { key, value, timestamp: new Date().toISOString(), tags: options.tags, source: options.source || "agent" };
  saveStore(storeName, store);
}

export function deleteMemory(storeName: string, key: string): boolean {
  const store = loadStore(storeName);
  if (store.entries[key]) { delete store.entries[key]; saveStore(storeName, store); return true; }
  return false;
}

export function listMemoryKeys(storeName: string): string[] {
  return Object.keys(loadStore(storeName).entries);
}

export function searchByTag(storeName: string, tag: string): MemoryEntry[] {
  return Object.values(loadStore(storeName).entries).filter((e) => e.tags?.includes(tag));
}

export function searchByPrefix(storeName: string, prefix: string): MemoryEntry[] {
  return Object.values(loadStore(storeName).entries).filter((e) => e.key.startsWith(prefix));
}

export function remember(
  storeName: string,
  key: string,
  value: unknown,
  options: { tags?: string[]; source?: "user" | "agent" | "session" | "import" } = {}
): void {
  const existing = getMemory(storeName, key);
  if (Array.isArray(existing)) setMemory(storeName, key, [...existing, value], options);
  else if (existing !== null) setMemory(storeName, key, [existing, value], options);
  else setMemory(storeName, key, value, options);
}

export function getMemoryStats(storeName: string): MemoryStats {
  const store = loadStore(storeName);
  const entries = Object.values(store.entries);
  const bySource: Record<string, number> = {};
  let oldest: string | null = null;
  let newest: string | null = null;
  for (const entry of entries) {
    bySource[entry.source || "agent"] = (bySource[entry.source || "agent"] || 0) + 1;
    if (!oldest || entry.timestamp < oldest) oldest = entry.timestamp;
    if (!newest || entry.timestamp > newest) newest = entry.timestamp;
  }
  let sizeBytes = 0;
  const filePath = memoryFilePath(storeName);
  if (existsSync(filePath)) sizeBytes = statSync(filePath).size;
  return { totalEntries: entries.length, entriesBySource: bySource, oldestEntry: oldest, newestEntry: newest, sizeBytes };
}

export function exportMemory(storeName: string): string {
  return JSON.stringify(loadStore(storeName), null, 2);
}

export function importMemory(storeName: string, json: string): { success: boolean; imported: number; error?: string } {
  try {
    const data = JSON.parse(json) as MemoryStore;
    if (!data.entries || typeof data.entries !== "object") return { success: false, imported: 0, error: "Invalid memory format" };
    const count = Object.keys(data.entries).length;
    saveStore(storeName, data);
    return { success: true, imported: count };
  } catch (e: any) { return { success: false, imported: 0, error: e.message }; }
}

export function clearMemory(storeName: string): void {
  saveStore(storeName, { updatedAt: new Date().toISOString(), entries: {} });
}

export function listMemoryStores(): string[] {
  ensureMemoryDir();
  return readdirSync(MEMORY_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
}

export function autoLearnFromConversation(storeName: string, messages: { role: string; content: string }[]): number {
  const patterns = [
    { re: /(?:i prefer|i like|i use|i'm using|i am using)\s+([^.,\n]{3,60})/gi, tag: "preference" },
    { re: /(?:my name is|i'm|i am)\s+([^.,\n]{2,40})/gi, tag: "identity" },
    { re: /(?:i work on|i develop|i'm working on|i am working on|i build)\s+([^.,\n]{3,60})/gi, tag: "context" },
    { re: /(?:remember|always)\s+([^.\n]{3,80})/gi, tag: "fact" },
  ];
  let learned = 0;
  for (const msg of messages) {
    if (msg.role === "user") {
      for (const { re, tag } of patterns) {
        const regex = new RegExp(re.source, "gi");
        let match: RegExpExecArray | null = null;
        while ((match = regex.exec(msg.content)) !== null && learned < 10) {
          setMemory(storeName, `fact_${Date.now()}_${learned}`, match[1].trim(), { tags: [tag, "auto-learned"], source: "agent" });
          learned++;
        }
      }
    }
  }
  return learned;
}

export async function initMemory(): Promise<void> {
  ensureMemoryDir();
  for (const store of ["user", "workspace"]) {
    if (!existsSync(memoryFilePath(store))) saveStore(store, { updatedAt: new Date().toISOString(), entries: {} });
  }
}

export function formatMemoryStats(storeName: string): string {
  const stats = getMemoryStats(storeName);
  const lines = [`Memory Store: ${storeName}`, `  Entries: ${stats.totalEntries}`, `  Size: ${(stats.sizeBytes / 1024).toFixed(1)} KB`];
  if (stats.oldestEntry) lines.push(`  Oldest: ${new Date(stats.oldestEntry).toLocaleDateString()}`);
  if (stats.newestEntry) lines.push(`  Newest: ${new Date(stats.newestEntry).toLocaleDateString()}`);
  for (const [source, count] of Object.entries(stats.entriesBySource)) lines.push(`  ${source}: ${count}`);
  return lines.join("\n");
}

