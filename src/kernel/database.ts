import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { join } from "path";

export class MeowDatabase {
  private db: Database.Database;

  constructor(dbPath: string = "meow.db") {
    this.db = new Database(dbPath);
    
    // Physical Mandate: WAL mode for concurrent reads
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");

    // Load sqlite-vec extension
    sqliteVec.load(this.db);

    this.checkIntegrity();
    this.initializeSchema();
  }

  private checkIntegrity() {
    const result = this.db.pragma("integrity_check") as any;
    const status = Array.isArray(result) ? result[0]?.integrity_check : result;
    if (status !== "ok") {
      console.error("🚨 Database integrity check failed:", status);
    }
  }

  private initializeSchema() {
    // swarm_state: JSON config, TTL, agent status
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS swarm_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE,
        value TEXT, -- JSON string
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // vector_memory: metadata and content
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vector_memory_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT,
        metadata TEXT, -- JSON string
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // sqlite-vec virtual table for embeddings
    // We'll use 1536 dimensions as a default (standard for OpenAI/modern embeddings)
    // but this can be adjusted.
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_memory USING vec0(
          embedding float[1536]
        );
      `);
    } catch (e) {
      console.error("Failed to create virtual table vec_memory:", e);
    }

    // missions: track background specialist activity
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS missions (
        pid INTEGER PRIMARY KEY,
        agent_name TEXT,
        goal TEXT,
        status TEXT DEFAULT 'running', -- running, completed, failed, hanged
        last_pulse DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  public getRawDb(): Database.Database {
    return this.db;
  }

  public close() {
    this.db.close();
  }
}
