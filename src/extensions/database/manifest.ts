/**
 * Database Extension IPC Protocol
 *
 * Defines the JSON-RPC interface between the Bun main process and the
 * Node.js subprocess that runs better-sqlite3 + sqlite-vec.
 */

// JSON-RPC message types
export interface JsonRpcRequest {
  id: number;
  method: string;
  params: any[];
}

export interface JsonRpcResponse {
  id: number;
  result?: any;
  error?: string;
}

// DatabasePort: the interface that the Bun-side proxy exposes
// to replace MeowDatabase calls (getRawDb().prepare() etc.)
export interface DatabasePort {
  // Asynchronous query for SELECT statements — returns rows
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  // Execute for INSERT/UPDATE/DELETE — returns changes/lastInsertRowid
  execute(sql: string, params?: any[]): Promise<DbExecuteResult>;
  // Execute raw SQL (no params) — for CREATE TABLE etc.
  exec(sql: string): Promise<{ done: boolean }>;
  // Process a batch of KernelActions in a transaction
  batch(actions: any[]): Promise<BatchResult>;
  // Load a SQLite extension (path to .so / .dll / .dylib)
  loadExtension(path: string): Promise<void>;
  // Close the database connection
  close(): Promise<void>;
}

export interface BatchResult {
  processed: number;
  errors: string[];
}

export interface DbExecuteResult {
  changes: number;
  lastInsertRowid: number;
}

// db-server methods
export type DbServerMethod = "query" | "execute" | "exec" | "loadExtension" | "close" | "batch";

// IPC command types sent from Bun proxy to Node server
export interface IpcCommand {
  method: DbServerMethod;
  params?: any[];
}

// Server capabilities (for future extension)
export interface DbServerCapabilities {
  supportsVectorMemory: boolean;
  maxDimension: number;
}
