import Database from "better-sqlite3";
import { createRequire } from "module";
import { config } from "../config/env";
import { DatabasePort, DbExecuteResult } from "../extensions/database/manifest";
import { HNSWIndex } from "../extensions/database/hnsw";
import fs from "fs";
import path from "path";

const require = createRequire(import.meta.url);

export class MeowDatabase implements DatabasePort {
  private db: Database.Database;
  private hnsw = new HNSWIndex();

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
    this.loadHNSWIndex();
  }

  private loadHNSWIndex() {
    try {
      const rows = this.db.prepare(`
        SELECT d.id, v.embedding
        FROM vector_memory_data d
        JOIN vec_memory v ON d.id = v.rowid
      `).all() as { id: number; embedding: Buffer | Float32Array | number[] }[];
      
      for (const row of rows) {
        let embeddingArray: number[] = [];
        if (row.embedding) {
          if (row.embedding instanceof Buffer) {
            const float32 = new Float32Array(
              row.embedding.buffer,
              row.embedding.byteOffset,
              row.embedding.byteLength / 4
            );
            embeddingArray = Array.from(float32);
          } else if (row.embedding instanceof Float32Array) {
            embeddingArray = Array.from(row.embedding);
          } else if (Array.isArray(row.embedding)) {
            embeddingArray = row.embedding;
          }
        }
        if (embeddingArray.length > 0) {
          this.hnsw.insert(row.id, embeddingArray);
        }
      }
      console.log(`✓ Loaded HNSW index with ${rows.length} vector embeddings.`);
    } catch (e) {
      console.warn("⚠️ Failed to pre-load HNSW vector index:", e);
    }
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

    // AI-Native Phase 1.1: task_outcomes — structured fingerprint for every task
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_outcomes (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id          TEXT NOT NULL,
        task_text       TEXT NOT NULL,
        result          TEXT,
        quality_score   INTEGER,
        failure_reason  TEXT,
        tools_called    TEXT,
        skills_used     TEXT,
        tokens_in       INTEGER,
        tokens_out      INTEGER,
        duration_ms     INTEGER,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_task_outcomes_result ON task_outcomes(result);
      CREATE INDEX IF NOT EXISTS idx_task_outcomes_run ON task_outcomes(run_id);
    `);

    // AI-Native Phase 2.2: meow_self_improvements — track monitoring agent changes
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meow_self_improvements (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger_type    TEXT,
        failure_cluster TEXT,
        files_patched   TEXT,
        eval_before     INTEGER,
        eval_after      INTEGER,
        deployed        INTEGER DEFAULT 0,
        human_reviewed  INTEGER DEFAULT 0,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS meow_eval_baselines (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        suite      TEXT,
        score      INTEGER,
        model      TEXT,
        trigger    TEXT,
        run_id     TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  // Implements DatabasePort
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (/FROM\s+vec_memory/i.test(sql)) {
      try {
        let embedding: number[] = [];
        if (params && params.length > 0) {
          const rawEmbedding = params[0];
          if (rawEmbedding instanceof Float32Array) {
            embedding = Array.from(rawEmbedding);
          } else if (rawEmbedding instanceof Buffer) {
            const float32 = new Float32Array(
              rawEmbedding.buffer,
              rawEmbedding.byteOffset,
              rawEmbedding.byteLength / 4
            );
            embedding = Array.from(float32);
          } else if (Array.isArray(rawEmbedding)) {
            embedding = rawEmbedding;
          }
        }

        if (embedding.length > 0) {
          // Parse limit (k)
          let limit = 10;
          const kMatch = sql.match(/k\s*=\s*(\d+)/i);
          if (kMatch) {
            limit = parseInt(kMatch[1]);
          }

          // Parse NOT IN clause
          const notInSet = new Set<number>();
          const notInMatch = sql.match(/NOT IN\s*\(([^)]+)\)/i);
          if (notInMatch) {
            const ids = notInMatch[1].split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));
            for (const id of ids) {
              notInSet.add(id);
            }
          }

          // Perform HNSW search!
          const nearestIds = this.hnsw.search(embedding, limit + notInSet.size);
          const filteredIds = nearestIds.filter(id => !notInSet.has(id)).slice(0, limit);

          if (filteredIds.length > 0) {
            // Retrieve actual details from database
            const placeholders = filteredIds.map(() => "?").join(",");
            const rows = this.db.prepare(`
              SELECT id as rowid, content, metadata
              FROM vector_memory_data
              WHERE id IN (${placeholders})
            `).all(...filteredIds) as { rowid: number; content: string; metadata: string }[];

            // Map distances and sort according to distance
            const results = rows.map(row => {
              const node = this.hnsw.getNode(row.rowid);
              const distance = node ? 1.0 - this.hnsw.similarity(embedding, node.vector) : 0.5;
              return {
                rowid: row.rowid,
                content: row.content,
                metadata: row.metadata,
                distance: distance
              };
            });

            results.sort((a, b) => a.distance - b.distance);
            return results as T[];
          }
          return [];
        }
      } catch (err) {
        console.warn("⚠️ HNSW query intercept failed, falling back to SQLite:", err);
      }
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...(params ?? [])) as T[];
  }

  async execute(sql: string, params?: any[]): Promise<DbExecuteResult> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...(params ?? []));

    // Intercept vector insert
    if (/INSERT INTO vec_memory/i.test(sql) && params && params.length >= 2) {
      try {
        const rowid = Number(params[0]);
        let embedding: number[] = [];
        const rawEmbedding = params[1];
        if (rawEmbedding instanceof Float32Array) {
          embedding = Array.from(rawEmbedding);
        } else if (rawEmbedding instanceof Buffer) {
          const float32 = new Float32Array(
            rawEmbedding.buffer,
            rawEmbedding.byteOffset,
            rawEmbedding.byteLength / 4
          );
          embedding = Array.from(float32);
        } else if (Array.isArray(rawEmbedding)) {
          embedding = rawEmbedding;
        }
        if (embedding.length > 0) {
          this.hnsw.insert(rowid, embedding);
        }
      } catch (err) {
        console.warn("⚠️ Failed to index embedding in HNSW during execute():", err);
      }
    }

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

              // Symmetrically update the HNSW graph
              this.hnsw.insert(Number(lastId), Array.from(action.embedding));
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

  // ── AI-Native Phase 1.1: Task outcomes ─────────────────────────────────────

  insertTaskOutcome(opts: {
    runId: string;
    taskText: string;
    result: string;
    qualityScore?: number;
    failureReason?: string;
    toolsCalled?: string[];
    skillsUsed?: string[];
    tokensIn?: number;
    tokensOut?: number;
    durationMs?: number;
  }): void {
    this.db.prepare(`
      INSERT INTO task_outcomes (run_id, task_text, result, quality_score, failure_reason, tools_called, skills_used, tokens_in, tokens_out, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      opts.runId,
      opts.taskText,
      opts.result,
      opts.qualityScore ?? null,
      opts.failureReason ?? null,
      opts.toolsCalled ? JSON.stringify(opts.toolsCalled) : null,
      opts.skillsUsed ? JSON.stringify(opts.skillsUsed) : null,
      opts.tokensIn ?? null,
      opts.tokensOut ?? null,
      opts.durationMs ?? null
    );
  }

  getTaskOutcomes(result?: string, limit = 100): Array<{
    id: number; run_id: string; task_text: string; result: string;
    quality_score: number; failure_reason: string; tools_called: string;
    skills_used: string; tokens_in: number; tokens_out: number;
    duration_ms: number; created_at: string;
  }> {
    const sql = result
      ? `SELECT * FROM task_outcomes WHERE result = ? ORDER BY created_at DESC LIMIT ?`
      : `SELECT * FROM task_outcomes ORDER BY created_at DESC LIMIT ?`;
    return this.db.prepare(sql).all(result ?? limit, ...(result ? [limit] : [])) as any;
  }

  getRecentFailures(hours = 24, limit = 20): Array<{ task_text: string; failure_reason: string; freq: number }> {
    return this.db.prepare(`
      SELECT task_text, failure_reason, COUNT(*) as freq
      FROM task_outcomes
      WHERE result = 'failure'
        AND created_at > datetime('now', '-${hours} hours')
        AND failure_reason IS NOT NULL
      GROUP BY failure_reason
      ORDER BY freq DESC
      LIMIT ?
    `).all(limit) as Array<{ task_text: string; failure_reason: string; freq: number }>;
  }

  // ── AI-Native Phase 2.2: Self-improvement tracking ─────────────────────────

  insertSelfImprovement(opts: {
    triggerType: string;
    failureCluster: string;
    filesPatched: string[];
    evalBefore?: number;
    evalAfter?: number;
    deployed?: boolean;
  }): void {
    this.db.prepare(`
      INSERT INTO meow_self_improvements (trigger_type, failure_cluster, files_patched, eval_before, eval_after, deployed)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      opts.triggerType,
      opts.failureCluster,
      JSON.stringify(opts.filesPatched),
      opts.evalBefore ?? null,
      opts.evalAfter ?? null,
      opts.deployed ? 1 : 0
    );
  }

  getSelfImprovements(deployed?: boolean): Array<{
    id: number; trigger_type: string; failure_cluster: string;
    files_patched: string; eval_before: number; eval_after: number;
    deployed: number; human_reviewed: number; created_at: string;
  }> {
    const sql = deployed !== undefined
      ? `SELECT * FROM meow_self_improvements WHERE deployed = ? ORDER BY created_at DESC`
      : `SELECT * FROM meow_self_improvements ORDER BY created_at DESC`;
    return this.db.prepare(sql).all(...(deployed !== undefined ? [deployed ? 1 : 0] : [])) as any;
  }

  insertEvalBaseline(opts: { suite: string; score: number; model: string; trigger: string; runId?: string }): void {
    this.db.prepare(`
      INSERT INTO meow_eval_baselines (suite, score, model, trigger, run_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(opts.suite, opts.score, opts.model, opts.trigger, opts.runId ?? null);
  }

  getEvalBaseline(suite: string): number | null {
    const row = this.db.prepare(
      `SELECT score FROM meow_eval_baselines WHERE suite = ? ORDER BY created_at DESC LIMIT 1`
    ).get(suite) as { score: number } | undefined;
    return row ? row.score : null;
  }

  getRecentEvalBaselines(suite: string, limit = 10): Array<{ score: number; trigger: string; created_at: string }> {
    return this.db.prepare(
      `SELECT score, trigger, created_at FROM meow_eval_baselines WHERE suite = ? ORDER BY created_at DESC LIMIT ?`
    ).all(suite, limit) as any;
  }
}