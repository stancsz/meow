/**
 * db-server.ts — Node.js database server
 *
 * Runs as a child process of the Bun main process.
 * Wraps MeowDatabase (better-sqlite3 + sqlite-vec) and responds to
 * JSON-RPC commands over stdio.
 *
 * Usage: node db-server.ts <dbPath>
 *
 * Protocol:
 *   stdin:  JSON-RPC Request  { id, method, params }
 *   stdout: JSON-RPC Response { id, result } or { id, error }
 *
 * Line-delimited JSON (one JSON object per line).
 */

import Database from "better-sqlite3";
import { createRequire } from "module";
import { HNSWIndex } from "./hnsw";

// Kernel action types (duplicated from kernel.ts to avoid ESM module resolution issues)
type KernelAction =
  | { type: "SET_STATE"; key: string; value: any }
  | { type: "DELETE_STATE"; key: string }
  | { type: "STORE_VECTOR"; content: string; embedding: number[]; metadata: any };

const require = createRequire(import.meta.url);

interface JsonRpcRequest {
  id: number;
  method: string;
  params: any[];
}

interface JsonRpcResponse {
  id: number;
  result?: any;
  error?: string;
}

interface DbExecuteResult {
  changes: number;
  lastInsertRowid: number;
}

class DbServer {
  private db: Database.Database;
  private id = 0;
  private pending = new Map<number, (val: any) => void>();
  private hnsw = new HNSWIndex();

  constructor(dbPath: string = "meow.db") {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");

    // Load sqlite-vec extension
    try {
      const vec = require("sqlite-vec");
      this.db.loadExtension(vec.getLoadablePath());
      console.error("✓ db-server: sqlite-vec extension loaded");
    } catch (e: any) {
      console.error("⚠️ db-server: Could not load sqlite-vec:", e.message);
    }

    this.initializeSchema();
    this.loadHNSWIndex();
    this.startListening();
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
      console.error(`✓ db-server: Loaded HNSW index with ${rows.length} vector embeddings.`);
    } catch (e: any) {
      console.error("⚠️ db-server: Failed to pre-load HNSW vector index:", e.message);
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

    // Vector memory table with dynamic dimension
    const dimension = parseInt(process.env.EMBEDDING_DIMENSION || "1536");
    try {
      const tableInfo = this.db.prepare(
        "SELECT sql FROM sqlite_master WHERE name = 'vec_memory'"
      ).get() as { sql: string } | undefined;

      if (tableInfo) {
        const match = tableInfo.sql.match(/float\[(\d+)\]/);
        const existingDim = match ? parseInt(match[1]) : null;
        if (existingDim !== dimension) {
          console.error(
            `⚠️ db-server: Embedding dimension mismatch (found ${existingDim}, expected ${dimension}). Recreating vec_memory.`
          );
          this.db.exec("DROP TABLE vec_memory");
          this.db.exec(
            `CREATE VIRTUAL TABLE vec_memory USING vec0(embedding float[${dimension}]);`
          );
        }
      } else {
        this.db.exec(
          `CREATE VIRTUAL TABLE vec_memory USING vec0(embedding float[${dimension}]);`
        );
      }
      console.error(`✓ db-server: vec_memory table ready (dimension: ${dimension})`);
    } catch (e: any) {
      console.error("⚠️ db-server: Could not initialize vec_memory:", e.message);
    }

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

  private send(response: JsonRpcResponse) {
    process.stdout.write(JSON.stringify(response) + "\n");
  }

  private handleRequest(req: JsonRpcRequest) {
    const { id, method, params } = req;
    let result: any;
    let error: string | undefined;

    try {
      switch (method) {
        case "query": {
          const [sql, args] = params ?? [];
          const callArgs = this.deserializeParams(args);
          
          let intercepted = false;
          if (/FROM\s+vec_memory/i.test(sql)) {
            try {
              let embedding: number[] = [];
              if (callArgs && callArgs.length > 0) {
                const rawEmbedding = callArgs[0];
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
                  const ids = notInMatch[1].split(",").map((s: string) => parseInt(s.trim())).filter((n: number) => !isNaN(n));
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
                  result = results;
                  intercepted = true;
                } else {
                  result = [];
                  intercepted = true;
                }
              }
            } catch (err: any) {
              console.error("⚠️ db-server: HNSW query intercept failed:", err.message);
            }
          }

          if (!intercepted) {
            const stmt = this.db.prepare(sql);
            result = callArgs ? stmt.all(...callArgs) : stmt.all();
          }
          break;
        }
        case "execute": {
          const [sql, args] = params ?? [];
          const callArgs = this.deserializeParams(args);
          const stmt = this.db.prepare(sql);
          const runResult = callArgs ? stmt.run(...callArgs) : stmt.run();
          result = {
            changes: runResult.changes,
            lastInsertRowid: Number(runResult.lastInsertRowid),
          };

          // Intercept vector insert
          if (/INSERT INTO vec_memory/i.test(sql) && callArgs && callArgs.length >= 2) {
            try {
              const rowid = Number(callArgs[0]);
              let embedding: number[] = [];
              const rawEmbedding = callArgs[1];
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
            } catch (err: any) {
              console.error("⚠️ db-server: Failed to index embedding in HNSW during execute():", err.message);
            }
          }
          break;
        }
        case "exec": {
          const [sql] = params ?? [];
          this.db.exec(sql);
          result = { done: true };
          break;
        }
        case "loadExtension": {
          const [path] = params ?? [];
          this.db.loadExtension(path);
          result = { loaded: true };
          break;
        }
        case "close": {
          this.db.close();
          result = { closed: true };
          break;
        }
        case "ping": {
          result = { ok: true };
          break;
        }
        case "batch": {
          const actions = params?.[0] ?? [];
          result = this.processBatch(actions);
          break;
        }
        default:
          error = `Unknown method: ${method}`;
      }
    } catch (e: any) {
      error = e.message;
    }

    this.send(error ? { id, error } : { id, result });
  }

  private processBatch(actions: KernelAction[]): { processed: number; errors: string[] } {
    const errors: string[] = [];
    const transaction = this.db.transaction((batch: KernelAction[]) => {
      for (const action of batch) {
        try {
          switch (action.type) {
            case "SET_STATE":
              this.db
                .prepare(
                  `INSERT INTO swarm_state (key, value, updated_at)
                   VALUES (?, ?, CURRENT_TIMESTAMP)
                   ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`
                )
                .run(action.key, JSON.stringify(action.value));
              break;
            case "DELETE_STATE":
              this.db
                .prepare("DELETE FROM swarm_state WHERE key = ?")
                .run(action.key);
              break;
            case "STORE_VECTOR": {
              const insertResult = this.db
                .prepare("INSERT INTO vector_memory_data (content, metadata) VALUES (?, ?)")
                .run(action.content, JSON.stringify(action.metadata));
              const lastId = insertResult.lastInsertRowid;
              this.db
                .prepare("INSERT INTO vec_memory (rowid, embedding) VALUES (CAST(? AS INTEGER), ?)")
                .run(lastId, new Float32Array(action.embedding));

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

  /**
   * Reconstruct typed arrays from the portable serialization produced by deepSerialize.
   * Handles the { __typed_array__: true, dtype, data, len } format.
   */
  private deserializeParams(args: any): any[] | undefined {
    if (!Array.isArray(args) || args.length === 0) return undefined;
    return args.map((arg: any) => {
      if (arg && arg.__typed_array__ === true) {
        const buf = Buffer.from(arg.data, "base64");
        if (arg.dtype === "float32") {
          return new Float32Array(buf.buffer, buf.byteOffset, arg.len);
        }
      }
      return arg;
    });
  }

  private startListening() {
    let buffer = "";

    process.stdin.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const req = JSON.parse(trimmed) as JsonRpcRequest;
          if (req.id && req.method) {
            this.handleRequest(req);
          }
        } catch (e) {
          // Ignore malformed lines
        }
      }
    });

    process.stdin.on("end", () => {
      this.db.close();
      process.exit(0);
    });
  }
}

// Entry point
const dbPath = process.argv[2] ?? "meow.db";
console.error(`db-server: Starting with dbPath=${dbPath}`);
new DbServer(dbPath);
