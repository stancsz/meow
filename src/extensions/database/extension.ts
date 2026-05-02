/**
 * extension.ts — Bun-side database extension
 *
 * Spawns the Node.js db-server.ts subprocess and proxies all MeowDatabase
 * calls over stdio JSON-RPC. Implements the DatabasePort interface so
 * callers can use this in place of MeowDatabase.
 */

import { Extension } from "../Extension";
import { DatabasePort, DbExecuteResult, BatchResult } from "./manifest";

// Note: 'bun' import is done inside the constructor (lazy) so this module
// can be safely imported in Node.js without crashing ExtensionManager discover.

let _idCounter = 0;
function nextId() {
  return ++_idCounter;
}

export interface DatabaseExtensionConfig {
  dbPath?: string;
  embeddingDimension?: number;
}

/**
 * DatabaseExtension — implements DatabasePort for the Bun main process.
 * All calls are forwarded over stdio JSON-RPC to the Node db-server.
 */
export class DatabaseExtension implements DatabasePort {
  private proc: any;
  private pending = new Map<number, (val: any) => void>();
  private buffer = "";
  private id = 0;
  private isClosed = false;

  constructor(config: DatabaseExtensionConfig = {}) {
    const dbPath = config.dbPath ?? "meow.db";
    const dim = config.embeddingDimension ?? 1536;

    // Lazy import of Bun to avoid crashes when ExtensionManager discovers extensions in Node
    const { spawn } = require("bun");

    // Spawn Node subprocess running db-server.ts
    this.proc = spawn({
      cmd: [
        "node",
        "src/extensions/database/db-server.ts",
        dbPath,
      ],
      env: {
        ...process.env,
        EMBEDDING_DIMENSION: String(dim),
      },
      stdout: "inherit",
      stderr: "inherit",
      stdin: "pipe",
    });

    // Collect responses from stdout
    this.proc.stdout?.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const resp = JSON.parse(trimmed);
          const resolve = this.pending.get(resp.id);
          if (resolve) {
            this.pending.delete(resp.id);
            resolve(resp);
          }
        } catch {
          // Ignore malformed
        }
      }
    });

    this.proc.onExit = (exit: { exitCode: number }) => {
      if (!this.isClosed) {
        console.error(`db-server exited unexpectedly with code ${exit.exitCode}`);
      }
    };
  }

  private send(method: string, params?: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = nextId();
      this.pending.set(id, resolve);
      const request = JSON.stringify({ id, method, params });
      this.proc.stdin?.write(request + "\n");

      // Timeout after 30s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`db-server call ${method} timed out`));
        }
      }, 30000);
    }).then((resp: any) => {
      if (resp.error) throw new Error(resp.error);
      return resp.result;
    });
  }

  query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    return this.send("query", [sql, params]);
  }

  execute(sql: string, params?: any[]): Promise<DbExecuteResult> {
    return this.send("execute", [sql, params]);
  }

  exec(sql: string): Promise<{ done: boolean }> {
    return this.send("exec", [sql]);
  }

  loadExtension(path: string): Promise<void> {
    return this.send("loadExtension", [path]);
  }

  batch(actions: any[]): Promise<BatchResult> {
    return this.send("batch", [actions]);
  }

  async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;
    try {
      await this.send("close");
    } catch {
      // Server may already be closing
    }
    this.proc.kill();
  }
}

// Extension manifest
export const databaseExtension: Extension = {
  name: "database",
  description:
    "SQLite database with vector memory (better-sqlite3 + sqlite-vec). Runs in a Node subprocess for Bun compatibility.",
  tools: [], // Internal only — no tools exposed to agent
  onLoad: async (agent: any) => {
    // Replace agent.db with the extension proxy
    const ext = new DatabaseExtension({
      dbPath: "meow.db",
      embeddingDimension: agent.config?.embeddingDimension ?? 1536,
    });

    // Make ext available on agent so callers can use it directly
    (agent as any).db = ext;
    (agent as any).kernel.db = ext;

    console.log("✓ Database extension loaded (Node subprocess)");
  },
};
