/**
 * Epoch 33: Reasoning Audit - Metacognition Infrastructure
 * 
 * Captures full traces of task completions for experience replay.
 * Stores reasoning patterns, tool sequences, and learnings in SQLite.
 * 
 * This enables Meow to search memory for "Lessons Learned" from previous tasks.
 * 
 * @see JOB.md [XL-18] Metacognition Audit
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Import DoneHooks types
import { type DoneHook, type HookContext, type HookResult } from "./done-hooks";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Configuration
// ============================================================================

const DATA_DIR = join(__dirname, "..", "..", "data");
const AUDIT_DB_PATH = join(DATA_DIR, "reasoning_audit.db");

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================================================
// Types
// ============================================================================

export interface ReasoningTrace {
  id: string;
  taskId: string;
  taskDescription: string;
  success: boolean;
  startTime: number;
  endTime: number;
  durationMs: number;
  iterations: number;
  toolCallCount: number;
  messageCount: number;
  toolSequence: string[];  // Ordered list of tool names
  errorMessage?: string;
  learnings?: string;
  rawMessages?: string;  // JSON stringified for full context
  createdAt: number;
}

export interface ReasoningSearchResult {
  trace: ReasoningTrace;
  relevance: number;
  matchedOn: string[];
}

// ============================================================================
// SQLite Database Helper
// ============================================================================

// Simple SQLite wrapper using Bun's built-in support
let db: any = null;

function getDb() {
  if (db) return db;
  
  // Use dynamic import for better compatibility
  try {
    // Bun's native SQLite support
    const Database = require("bun:sqlite");
    db = new Database(AUDIT_DB_PATH);
    initializeSchema();
    return db;
  } catch {
    // Fallback: try to use a simple JSON-based store
    console.warn("[reasoning-audit] SQLite not available, using JSON fallback");
    return null;
  }
}

function initializeSchema() {
  if (!db) return;
  
  db.run(`
    CREATE TABLE IF NOT EXISTS reasoning_audit (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      task_description TEXT NOT NULL,
      success INTEGER NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      iterations INTEGER DEFAULT 0,
      tool_call_count INTEGER DEFAULT 0,
      message_count INTEGER DEFAULT 0,
      tool_sequence TEXT,  -- JSON array
      error_message TEXT,
      learnings TEXT,
      raw_messages TEXT,  -- JSON
      created_at INTEGER NOT NULL
    )
  `);
  
  // Create indexes for common queries
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_task_id ON reasoning_audit(task_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_success ON reasoning_audit(success)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_created ON reasoning_audit(created_at DESC)`);
  
  console.log("[reasoning-audit] Database schema initialized");
}

// ============================================================================
// JSON Fallback Store (for environments without SQLite)
// ============================================================================

interface JsonStore {
  traces: ReasoningTrace[];
}

const JSON_STORE_PATH = join(DATA_DIR, "reasoning_audit.json");

function loadJsonStore(): JsonStore {
  if (existsSync(JSON_STORE_PATH)) {
    try {
      return JSON.parse(readFileSync(JSON_STORE_PATH, "utf-8"));
    } catch {
      return { traces: [] };
    }
  }
  return { traces: [] };
}

function saveJsonStore(store: JsonStore) {
  try {
    writeFileSync(JSON_STORE_PATH, JSON.stringify(store, null, 2));
  } catch (e) {
    console.warn("[reasoning-audit] Failed to save JSON store:", e);
  }
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Generate a unique ID for a trace
 */
function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Extract tool sequence from tool calls
 */
function extractToolSequence(toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>): string[] {
  return toolCalls.map(tc => tc.name);
}

/**
 * Extract learnings from a failed task
 */
function extractLearnings(
  context: HookContext,
  success: boolean
): string | undefined {
  if (success) {
    // For successful tasks, extract key insights from the interaction
    const messageContent = context.messages
      .filter(m => m.role === "assistant")
      .map(m => m.content)
      .join(" ");
    
    // Look for success indicators
    if (messageContent.includes("✅") || messageContent.includes("success") || messageContent.includes("complete")) {
      return "Task completed successfully - patterns to remember";
    }
    
    return "Task completed";
  } else {
    // For failed tasks, extract error context
    const errorMsg = context.metadata?.error as string | undefined;
    return errorMsg || "Task failed - check error logs for details";
  }
}

/**
 * Store a reasoning trace
 */
export function storeReasoningTrace(trace: ReasoningTrace): boolean {
  // Try SQLite first
  const database = getDb();
  
  if (database) {
    try {
      database.run(
        `INSERT INTO reasoning_audit (
          id, task_id, task_description, success, start_time, end_time,
          duration_ms, iterations, tool_call_count, message_count,
          tool_sequence, error_message, learnings, raw_messages, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          trace.id,
          trace.taskId,
          trace.taskDescription,
          trace.success ? 1 : 0,
          trace.startTime,
          trace.endTime,
          trace.durationMs,
          trace.iterations,
          trace.toolCallCount,
          trace.messageCount,
          JSON.stringify(trace.toolSequence),
          trace.errorMessage || null,
          trace.learnings || null,
          trace.rawMessages || null,
          trace.createdAt
        ]
      );
      return true;
    } catch (e) {
      console.error("[reasoning-audit] SQLite insert failed:", e);
    }
  }
  
  // Fallback to JSON
  try {
    const store = loadJsonStore();
    store.traces.push(trace);
    
    // Keep only last 1000 traces to prevent unbounded growth
    if (store.traces.length > 1000) {
      store.traces = store.traces.slice(-1000);
    }
    
    saveJsonStore(store);
    return true;
  } catch (e) {
    console.error("[reasoning-audit] JSON store failed:", e);
    return false;
  }
}

/**
 * Search reasoning traces by keyword query
 */
export function searchReasoningTraces(
  query: string,
  limit: number = 10,
  includeFailed: boolean = true
): ReasoningSearchResult[] {
  const results: ReasoningSearchResult[] = [];
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  
  // Try SQLite first
  const database = getDb();
  
  if (database) {
    try {
      const queryCondition = includeFailed ? "" : "WHERE success = 1";
      const rows = database.query(
        `SELECT * FROM reasoning_audit ${queryCondition} ORDER BY created_at DESC LIMIT 100`
      ).all();
      
      for (const row of rows as any[]) {
        const trace = rowToTrace(row);
        const result = scoreTrace(trace, queryLower, queryWords);
        if (result) results.push(result);
      }
    } catch (e) {
      console.error("[reasoning-audit] SQLite search failed:", e);
    }
  } else {
    // Fallback to JSON
    const store = loadJsonStore();
    for (const trace of store.traces) {
      if (!includeFailed && !trace.success) continue;
      const result = scoreTrace(trace, queryLower, queryWords);
      if (result) results.push(result);
    }
  }
  
  // Sort by relevance and limit
  results.sort((a, b) => b.relevance - a.relevance);
  return results.slice(0, limit);
}

/**
 * Convert database row to ReasoningTrace
 */
function rowToTrace(row: any): ReasoningTrace {
  return {
    id: row.id,
    taskId: row.task_id,
    taskDescription: row.task_description,
    success: row.success === 1,
    startTime: row.start_time,
    endTime: row.end_time,
    durationMs: row.duration_ms,
    iterations: row.iterations,
    toolCallCount: row.tool_call_count,
    messageCount: row.message_count,
    toolSequence: JSON.parse(row.tool_sequence || "[]"),
    errorMessage: row.error_message,
    learnings: row.learnings,
    rawMessages: row.raw_messages,
    createdAt: row.created_at
  };
}

/**
 * Score a trace for relevance to a query
 */
function scoreTrace(
  trace: ReasoningTrace,
  queryLower: string,
  queryWords: string[]
): ReasoningSearchResult | null {
  const matchedOn: string[] = [];
  let relevance = 0;
  
  // Check task description match (highest weight)
  if (trace.taskDescription.toLowerCase().includes(queryLower)) {
    relevance += 20;
    matchedOn.push("task_description");
  }
  
  // Check keyword matches
  for (const word of queryWords) {
    if (trace.taskDescription.toLowerCase().includes(word)) {
      relevance += 5;
      matchedOn.push(`word:${word}`);
    }
    
    // Check tool sequence match
    if (trace.toolSequence.some(t => t.toLowerCase().includes(word))) {
      relevance += 3;
      matchedOn.push(`tool:${word}`);
    }
    
    // Check learnings match
    if (trace.learnings?.toLowerCase().includes(word)) {
      relevance += 4;
      matchedOn.push("learnings");
    }
    
    // Check error message match (for failed tasks)
    if (trace.errorMessage?.toLowerCase().includes(word)) {
      relevance += 6;
      matchedOn.push("error");
    }
  }
  
  // Boost successful traces
  if (trace.success) {
    relevance += 2;
  }
  
  // Boost by tool count (more complex tasks are more interesting)
  relevance += Math.min(trace.toolCallCount / 5, 3);
  
  if (relevance > 0) {
    return { trace, relevance, matchedOn };
  }
  
  return null;
}

/**
 * Get all traces (for debugging)
 */
export function getAllTraces(limit: number = 100): ReasoningTrace[] {
  const database = getDb();
  
  if (database) {
    try {
      const rows = database.query(
        `SELECT * FROM reasoning_audit ORDER BY created_at DESC LIMIT ?`
      ).all(limit);
      return (rows as any[]).map(rowToTrace);
    } catch (e) {
      console.error("[reasoning-audit] SQLite query failed:", e);
    }
  }
  
  // Fallback to JSON
  const store = loadJsonStore();
  return store.traces.slice(-limit).reverse();
}

/**
 * Get traces by task pattern (fuzzy match on task description)
 */
export function getTracesByPattern(pattern: string, limit: number = 10): ReasoningTrace[] {
  const patternLower = pattern.toLowerCase();
  
  const database = getDb();
  
  if (database) {
    try {
      const rows = database.query(
        `SELECT * FROM reasoning_audit 
         WHERE task_description LIKE ? 
         ORDER BY created_at DESC LIMIT ?`,
        [`%${pattern}%`, limit]
      ).all();
      return (rows as any[]).map(rowToTrace);
    } catch (e) {
      console.error("[reasoning-audit] SQLite pattern query failed:", e);
    }
  }
  
  // Fallback to JSON
  const store = loadJsonStore();
  return store.traces
    .filter(t => t.taskDescription.toLowerCase().includes(patternLower))
    .slice(-limit)
    .reverse();
}

/**
 * Format search results for display
 */
export function formatSearchResults(results: ReasoningSearchResult[]): string {
  if (results.length === 0) {
    return "No reasoning traces found matching your query.";
  }
  
  const lines: string[] = [];
  lines.push("## Reasoning Traces (Experience Replay)\n");
  
  for (const { trace, relevance, matchedOn } of results) {
    const status = trace.success ? "✅" : "❌";
    const duration = trace.durationMs < 1000 
      ? `${trace.durationMs}ms` 
      : `${(trace.durationMs / 1000).toFixed(1)}s`;
    
    lines.push(`### ${status} ${trace.taskDescription.slice(0, 60)}${trace.taskDescription.length > 60 ? "..." : ""}`);
    lines.push(`- **Relevance**: ${relevance} (matched: ${matchedOn.join(", ")})`);
    lines.push(`- **Duration**: ${duration} | **Tools**: ${trace.toolCallCount}`);
    
    if (trace.toolSequence.length > 0) {
      lines.push(`- **Tool Sequence**: ${trace.toolSequence.slice(0, 5).join(" → ")}${trace.toolSequence.length > 5 ? " → ..." : ""}`);
    }
    
    if (trace.learnings) {
      lines.push(`- **Learnings**: ${trace.learnings.slice(0, 100)}`);
    }
    
    if (trace.errorMessage) {
      lines.push(`- **Error**: ${trace.errorMessage.slice(0, 80)}`);
    }
    
    lines.push("");
  }
  
  return lines.join("\n");
}

// ============================================================================
// DoneHook Integration
// ============================================================================

/**
 * Create the Reasoning Audit DoneHook
 * 
 * This hook triggers on ALL task completions (success or failure)
 * and captures the full reasoning trace for experience replay.
 */
export function createReasoningAuditHook(): DoneHook {
  return {
    name: "reasoning-audit",
    priority: 50,  // Run after skill crystallization (100) but before others
    trigger: (context: HookContext) => {
      // Trigger on ALL task completions - both success and failure
      return true;
    },
    execute: async (context: HookContext): Promise<HookResult> => {
      try {
        const durationMs = context.endTime - context.startTime;
        const toolSequence = extractToolSequence(context.toolCalls);
        const learnings = extractLearnings(context, context.task.success);
        
        // Extract error message if present
        let errorMessage: string | undefined;
        if (!context.task.success && context.metadata?.error) {
          errorMessage = String(context.metadata.error);
        }
        
        // Extract iterations from metadata
        const iterations = (context.metadata?.iterations as number) || 0;
        
        // Store the raw messages as JSON for full context (truncated to prevent bloat)
        let rawMessages: string | undefined;
        try {
          const truncatedMessages = context.messages.slice(-20);  // Last 20 messages
          rawMessages = JSON.stringify(truncatedMessages);
          // Truncate if too long
          if (rawMessages.length > 50000) {
            rawMessages = rawMessages.slice(0, 50000) + "... [truncated]";
          }
        } catch {
          // Ignore serialization errors
        }
        
        const trace: ReasoningTrace = {
          id: generateTraceId(),
          taskId: context.task.id,
          taskDescription: context.task.description,
          success: context.task.success,
          startTime: context.startTime,
          endTime: context.endTime,
          durationMs,
          iterations,
          toolCallCount: context.toolCalls.length,
          messageCount: context.messages.length,
          toolSequence,
          errorMessage,
          learnings,
          rawMessages,
          createdAt: Date.now()
        };
        
        const stored = storeReasoningTrace(trace);
        
        if (stored) {
          console.log(`[reasoning-audit] Trace stored: ${trace.id} (${trace.taskDescription.slice(0, 50)}...)`);
          return {
            success: true,
            metadata: {
              traceId: trace.id,
              toolCount: trace.toolCallCount,
              durationMs: trace.durationMs
            }
          };
        } else {
          return {
            success: false,
            error: "Failed to store reasoning trace"
          };
        }
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e)
        };
      }
    }
  };
}

/**
 * Register the Reasoning Audit hook to the default DoneHooks instance
 */
export function registerReasoningAuditHook(): void {
  try {
    const { getDefaultHooks } = require("./done-hooks");
    const hooks = getDefaultHooks();
    
    if (!hooks.hasHook("reasoning-audit")) {
      hooks.register(createReasoningAuditHook());
      console.log("[reasoning-audit] Hook registered to DoneHooks");
    }
  } catch (e) {
    console.error("[reasoning-audit] Failed to register hook:", e);
  }
}

// ============================================================================
// CLI for Testing
// ============================================================================

const cmd = process.argv[2]?.toLowerCase();

if (cmd === "search" || cmd === "query") {
  const query = process.argv.slice(3).join(" ") || "current goals";
  const results = searchReasoningTraces(query, 10);
  console.log(formatSearchResults(results));
  process.exit(0);
}

if (cmd === "list" || cmd === "all") {
  const traces = getAllTraces(20);
  console.log(`Found ${traces.length} traces:\n`);
  for (const trace of traces) {
    const status = trace.success ? "✅" : "❌";
    console.log(`${status} ${trace.taskDescription.slice(0, 60)} (${trace.durationMs}ms)`);
  }
  process.exit(0);
}

if (cmd === "stats") {
  const database = getDb();
  if (database) {
    try {
      const total = database.query("SELECT COUNT(*) as count FROM reasoning_audit").get();
      const successful = database.query("SELECT COUNT(*) as count FROM reasoning_audit WHERE success = 1").get();
      const failed = database.query("SELECT COUNT(*) as count FROM reasoning_audit WHERE success = 0").get();
      
      console.log(`Total traces: ${(total as any).count}`);
      console.log(`Successful: ${(successful as any).count}`);
      console.log(`Failed: ${(failed as any).count}`);
    } catch (e) {
      console.error("Stats query failed:", e);
    }
  } else {
    const store = loadJsonStore();
    const successful = store.traces.filter(t => t.success).length;
    console.log(`Total traces: ${store.traces.length}`);
    console.log(`Successful: ${successful}`);
    console.log(`Failed: ${store.traces.length - successful}`);
  }
  process.exit(0);
}

// Export for use in other modules
export { storeReasoningTrace, searchReasoningTraces, formatSearchResults };
