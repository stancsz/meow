import Database from "better-sqlite3";
import { createRequire } from "module";
import { config } from "../config/env";
import { DatabasePort, DbExecuteResult } from "../extensions/database/manifest";

const require = createRequire(import.meta.url);

export class MeowDatabase implements DatabasePort {
  private db: Database.Database;

  constructor(dbPath: string = "meow.db") {
    this.db = new Database(dbPath);

    // Physical Mandate: WAL mode for concurrent reads
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");

    // Load sqlite-vec extension for vector search (cross-platform)
    try {
      const vec = require("sqlite-vec");
      this.db.loadExtension(vec.getLoadablePath());
      console.log("✓ sqlite-vec extension loaded");
    } catch (e) {
      console.warn("⚠️ Could not load sqlite-vec extension:", e);
    }

    this.initializeSchema();
  }

  private initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS swarm_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vector_memory_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT,
        metadata TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const dimension = config.embeddingDimension;
    try {
      const tableInfo = this.db.prepare("SELECT sql FROM sqlite_master WHERE name = 'vec_memory'").get() as { sql: string } | undefined;

      if (tableInfo) {
        const match = tableInfo.sql.match(/float\[(\d+)\]/);
        const existingDim = match ? parseInt(match[1]) : null;

        if (existingDim !== dimension) {
          console.warn(`⚠️ Embedding dimension mismatch (found ${existingDim}, expected ${dimension}). Recreating vec_memory table...`);
          this.db.exec("DROP TABLE vec_memory");
          this.db.exec(`
            CREATE VIRTUAL TABLE vec_memory USING vec0(
              embedding float[${dimension}]
            );
          `);
        }
      } else {
        this.db.exec(`
          CREATE VIRTUAL TABLE vec_memory USING vec0(
            embedding float[${dimension}]
          );
        `);
      }
      console.log(`✓ vec_memory table ready (dimension: ${dimension})`);
    } catch (e) {
      console.warn("⚠️ Could not initialize vec_memory virtual table:", e);
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS missions (
        pid INTEGER PRIMARY KEY,
        agent_name TEXT,
        goal TEXT,
        status TEXT DEFAULT 'running',
        progress_score INTEGER DEFAULT 0,
        progress_summary TEXT,
        last_pulse DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  // Implements DatabasePort
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...(params ?? [])) as T[];
  }

  async execute(sql: string, params?: any[]): Promise<DbExecuteResult> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...(params ?? []));
    return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) };
  }

  async exec(sql: string): Promise<{ done: boolean }> {
    this.db.exec(sql);
    return { done: true };
  }

  async batch(actions: any[]): Promise<{ processed: number; errors: string[] }> {
    // Synchronous batch for direct Node path — no IPC overhead
    const errors: string[] = [];
    const transaction = this.db.transaction((batch: any[]) => {
      for (const action of batch) {
        try {
          switch (action.type) {
            case "SET_STATE":
              this.db.prepare(
                `INSERT INTO swarm_state (key, value, updated_at)
                 VALUES (?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`
              ).run(action.key, JSON.stringify(action.value));
              break;
            case "DELETE_STATE":
              this.db.prepare("DELETE FROM swarm_state WHERE key = ?").run(action.key);
              break;
            case "STORE_VECTOR": {
              const result = this.db.prepare(
                "INSERT INTO vector_memory_data (content, metadata) VALUES (?, ?)"
              ).run(action.content, JSON.stringify(action.metadata));
              const lastId = result.lastInsertRowid;
              this.db.prepare(
                "INSERT INTO vec_memory (rowid, embedding) VALUES (CAST(? AS INTEGER), ?)"
              ).run(lastId, new Float32Array(action.embedding));
              break;
            }
          }
        } catch (e: any) {
          errors.push(`${action.type}: ${e.message}`);
        }
      }
    });
    transaction(actions);
    return { processed: actions.length, errors };
  }

  async loadExtension(path: string): Promise<void> {
    this.db.loadExtension(path);
  }

  async close(): Promise<void> {
    this.db.close();
  }

  // Legacy — for code that still uses getRawDb()
  public getRawDb(): Database.Database {
    return this.db;
  }
}