import { MeowKernel } from "../kernel/kernel";
import { ReasoningEngine } from "./reasoning";
import { DatabasePort } from "../extensions/database/manifest";
import pc from "picocolors";

export interface MemoryResult {
  content: string;
  metadata: Record<string, any>;
  distance: number;
}

interface DBMemoryRow {
  rowid: number;
  content: string;
  metadata: string;
  distance: number;
}

/**
 * AgenticMemory — handles persistent episodic memory for agents.
 * Stores and retrieves task history, successful patterns, and failure context.
 *
 * Two-tier system:
 * - Long-term: SQLite + sqlite-vec for semantic recall (weighted by relevance)
 * - Session: in-memory deduplication and recent history
 *
 * Agentic episodic memory for long-running tasks.
 */
export class AgenticMemory {
  private db: DatabasePort;
  private kernel: MeowKernel;
  private reasoning: ReasoningEngine;
  private recalledIds: Set<number> = new Set();

  constructor(db: DatabasePort, kernel: MeowKernel, reasoning: ReasoningEngine) {
    this.db = db;
    this.kernel = kernel;
    this.reasoning = reasoning;
  }

  /**
   * Recall relevant memories from the semantic store.
   * Uses sqlite-vec for nearest-neighbor search on embeddings.
   */
  public async recall(queryText: string, queryEmbedding: number[]): Promise<MemoryResult[]> {
    let candidates: DBMemoryRow[] = [];
    try {
      const notInClause = Array.from(this.recalledIds).join(',') || -1;
      candidates = await this.db.query<DBMemoryRow>(
        `SELECT
          v.rowid,
          d.content,
          d.metadata,
          v.distance
        FROM vec_memory v
        JOIN vector_memory_data d ON v.rowid = d.id
        WHERE v.embedding MATCH ?
        AND k = 10
        AND v.rowid NOT IN (${notInClause})
        ORDER BY v.distance`,
        [new Float32Array(queryEmbedding)]
      );
    } catch {
      return [];
    }

    if (candidates.length === 0) return [];

    // Use FastSearch to refine the vec results
    const best = await this.reasoning.findBest(
      candidates,
      queryText,
      (msg) => this.kernel.log?.(msg, "memory")
    );

    if (best) {
      this.recalledIds.add(best.rowid);
    }

    return candidates.map(c => ({
      content: c.content,
      metadata: JSON.parse(c.metadata || "{}"),
      distance: c.distance
    }));
  }

  /**
   * Store a new memory entry with its embedding.
   * Used after task completion to record successful patterns.
   */
  public async store(content: string, metadata: Record<string, any>, embedding: number[]): Promise<void> {
    try {
      if (!embedding || embedding.length === 0) {
        this.kernel.log?.("Memory store skipped: empty embedding", "warn");
        return;
      }
      const rowResult = await this.db.execute(
        `INSERT INTO vector_memory_data (content, metadata) VALUES (?, ?)`,
        [content, JSON.stringify(metadata)]
      );
      const rowId = rowResult?.lastInsertRowid;
      if (rowId && embedding.length > 1) {
        await this.db.execute(
          `SELECT vec0_insert('vec_memory', ?)`,
          [new Float32Array(embedding)]
        );
      }
    } catch (e) {
      this.kernel.log?.(`Memory store failed: ${e}`, "warn");
    }
  }

  /**
   * Clear the recall session (set-based deduplication reset).
   */
  public reset(): void {
    this.recalledIds.clear();
  }
}