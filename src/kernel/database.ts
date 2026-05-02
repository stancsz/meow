import Database from "better-sqlite3";
import { join } from "path";
import { createRequire } from "module";
import { config } from "../config/env";

const require = createRequire(import.meta.url);

export class MeowDatabase {
  private db: Database.Database;

  constructor(dbPath: string = "meow.db") {
    this.db = new Database(dbPath);

    // Physical Mandate: WAL mode for concurrent reads
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");

    // Load sqlite-vec extension for vector search (cross-platform)
    try {
      // sqlite-vec package handles platform detection automatically
      const vec = require("sqlite-vec");
      this.db.loadExtension(vec.getLoadablePath());
      console.log("✓ sqlite-vec extension loaded");
    } catch (e) {
      console.warn("⚠️ Could not load sqlite-vec extension:", e);
    }

    this.initializeSchema();
  }

  private initializeSchema() {
    // swarm_state: JSON config, TTL, agent status
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS swarm_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // vector_memory: metadata and content
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vector_memory_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT,
        metadata TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // sqlite-vec virtual table for embeddings with dynamic dimension support
    const dimension = config.embeddingDimension;
    try {
      // Check if table exists and what its dimension is
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

    // missions: track background specialist activity
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS missions (
        pid INTEGER PRIMARY KEY,
        agent_name TEXT,
        goal TEXT,
        status TEXT DEFAULT 'running',
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