import { MeowKernel } from "../kernel/kernel";
import { QuantumReasoning } from "./quantum_reasoning";
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

export class QuantumMemory {
  private db: DatabasePort;
  private kernel: MeowKernel;
  private reasoning: QuantumReasoning;
  private measuredIds: Set<number> = new Set();

  constructor(db: DatabasePort, kernel: MeowKernel, reasoning: QuantumReasoning) {
    this.db = db;
    this.kernel = kernel;
    this.reasoning = reasoning;
  }

  public async recall(queryText: string, queryEmbedding: number[]): Promise<MemoryResult[]> {
    // Check vec_memory table exists and has data
    let candidates: DBMemoryRow[] = [];
    try {
      const notInClause = Array.from(this.measuredIds).join(',') || -1;
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
    } catch (e) {
      // vec_memory might not be available or empty
      return [];
    }

    if (candidates.length === 0) return [];
    if (candidates.length === 1) {
      const winner = candidates[0];
      this.measuredIds.add(winner.rowid);
      return [{
        content: winner.content,
        metadata: JSON.parse(winner.metadata),
        distance: winner.distance
      }];
    }

    // 2. Grover Amplitude Amplification (Real Circuit Simulation)
    const winner = await this.reasoning.groverSearch(candidates, queryText, (msg) => {
      process.stdout.write(`\r${pc.magenta(msg)}`);
    });

    if (!winner) return [];

    // 3. No-Cloning Theorem: Destructive Read
    // Once measured, the memory is collapsed and removed from future superposition turns.
    this.measuredIds.add(winner.rowid);

    return [{
      content: winner.content,
      metadata: JSON.parse(winner.metadata),
      distance: winner.distance
    }];
  }

  /**
   * Store new context (Unitary Evolution of State)
   */
  public store(content: string, embedding: number[], metadata: any = {}) {
    this.kernel.push({
      type: "STORE_VECTOR",
      content,
      embedding,
      metadata
    });
  }
}
