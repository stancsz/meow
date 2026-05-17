import Database from "better-sqlite3";
import { createRequire } from "module";
import { config } from "../config/env";
import { DatabasePort, DbExecuteResult } from "../extensions/database/manifest";
import fs from "fs";
import path from "path";

const require = createRequire(import.meta.url);

export class MeowDatabase implements DatabasePort {
  private db: Database.Database;

  constructor(dbPath: string = "meow.db") {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");

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

    // Priority 1: Reproducibility + Seed Management
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mission_runs (
        run_id         TEXT PRIMARY KEY,
        mission_id     TEXT NOT NULL,
        mission_type   TEXT NOT NULL DEFAULT 'mission',
        status         TEXT DEFAULT 'running',
        seed           INTEGER,
        deterministic  INTEGER DEFAULT 0,
        model          TEXT,
        total_cost     REAL DEFAULT 0,
        checkpoint_path TEXT,
        parent_run_id  TEXT,
        created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at   DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_runs_status ON mission_runs(status);
      CREATE INDEX IF NOT EXISTS idx_runs_created ON mission_runs(created_at);
    `);

    // Priority 1: Cost Tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mission_cost (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id        TEXT NOT NULL,
        model         TEXT NOT NULL,
        input_tokens  INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cost_cents    REAL DEFAULT 0,
        logged_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (run_id) REFERENCES mission_runs(run_id)
      );
      CREATE INDEX IF NOT EXISTS idx_cost_run_id ON mission_cost(run_id);
    `);

    // Priority 2: Verifiable Audit Trails
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id       TEXT,
        timestamp    DATETIME DEFAULT CURRENT_TIMESTAMP,
        level        TEXT DEFAULT 'info',
        action_type  TEXT NOT NULL,
        detail       TEXT,
        agent        TEXT,
        mission_goal TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_run_id ON audit_log(run_id);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
    `);

    // Priority 2: Cross-session memory
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS episodic_memory (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id   TEXT NOT NULL,
        summary      TEXT NOT NULL,
        raw_content  TEXT,
        relevance    REAL DEFAULT 0.5,
        reinforced   INTEGER DEFAULT 0,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_episodic_session ON episodic_memory(session_id);
    `);

    // Priority 2: Agent capabilities registry
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_registry (
        agent_name   TEXT PRIMARY KEY,
        capabilities TEXT,
        last_seen    DATETIME DEFAULT CURRENT_TIMESTAMP,
        status       TEXT DEFAULT 'available'
      );
    `);

    // Priority 3: Eval harness
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS benchmark_results (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id          TEXT UNIQUE NOT NULL,
        suite           TEXT NOT NULL,
        model           TEXT NOT NULL,
        total_score     REAL NOT NULL,
        pass_rate       REAL NOT NULL,
        total_cost      REAL NOT NULL,
        total_duration_ms INTEGER NOT NULL,
        report_path     TEXT,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_bench_run_id ON benchmark_results(run_id);
      CREATE INDEX IF NOT EXISTS idx_bench_suite ON benchmark_results(suite);
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

  // ── Priority 1: Reproducibility + Cost helpers ────────────────────────────

  startRun(runId: string, missionId: string, seed: number | undefined, deterministic: boolean, model?: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO mission_runs (run_id, mission_id, seed, deterministic, status, model)
      VALUES (?, ?, ?, ?, 'running', ?)
    `).run(runId, missionId, seed ?? null, deterministic ? 1 : 0, model ?? null);
  }

  checkpoint(runId: string, name: string): void {
    const path = `~/.meow/checkpoints/${runId}_${name}.json`;
    this.db.prepare(`
      UPDATE mission_runs SET checkpoint_path = ?, updated_at = CURRENT_TIMESTAMP WHERE run_id = ?
    `).run(path, runId);
  }

  endRun(runId: string, status: string = "completed"): void {
    const totalCost = this.getTotalCost(runId);
    this.db.prepare(`
      UPDATE mission_runs SET completed_at = CURRENT_TIMESTAMP, status = ?, total_cost = ?, updated_at = CURRENT_TIMESTAMP
      WHERE run_id = ?
    `).run(status, totalCost, runId);
  }

  logCost(runId: string, model: string, inputTokens: number, outputTokens: number, costCents: number): void {
    this.db.prepare(`
      INSERT INTO mission_cost (run_id, model, input_tokens, output_tokens, cost_cents)
      VALUES (?, ?, ?, ?, ?)
    `).run(runId, model, inputTokens, outputTokens, costCents);
  }

  getTotalCost(runId: string): number {
    const row = this.db.prepare(
      "SELECT COALESCE(SUM(cost_cents), 0) as total FROM mission_cost WHERE run_id = ?"
    ).get(runId) as { total: number } | undefined;
    return row?.total ?? 0;
  }

  // ── Priority 2: Audit log ────────────────────────────────────────────────

  audit(actionType: string, detail: string, level: string = "info", runId?: string, agent?: string, missionGoal?: string): void {
    this.db.prepare(`
      INSERT INTO audit_log (run_id, action_type, detail, level, agent, mission_goal)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(runId ?? null, actionType, detail, level, agent ?? null, missionGoal ?? null);
  }

  // ── Priority 2: Cross-session memory ─────────────────────────────────────

  storeEpisodic(sessionId: string, summary: string, rawContent?: string, relevance: number = 0.5): void {
    this.db.prepare(`
      INSERT INTO episodic_memory (session_id, summary, raw_content, relevance)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, summary, rawContent ?? null, relevance);
  }

  getRecentEpisodic(limit: number = 10): Array<{ session_id: string; summary: string; relevance: number; created_at: string }> {
    return this.db.prepare(`
      SELECT session_id, summary, relevance, created_at
      FROM episodic_memory
      ORDER BY created_at DESC, relevance DESC
      LIMIT ?
    `).all(limit) as Array<{ session_id: string; summary: string; relevance: number; created_at: string }>;
  }

  // ── Priority 2: Agent registry ────────────────────────────────────────────

  registerAgent(name: string, capabilities: string[]): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO agent_registry (agent_name, capabilities, last_seen, status)
      VALUES (?, ?, CURRENT_TIMESTAMP, 'available')
    `).run(name, JSON.stringify(capabilities));
  }
}