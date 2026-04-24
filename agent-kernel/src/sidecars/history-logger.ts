/**
 * history-logger.ts
 * 
 * Tabular experiment logger inspired by karpathy/autoresearch.
 * Keeps a durable record of agent actions and outcomes.
 */

import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface HistoryEntry {
  timestamp: string;
  missionId: string;
  tick: number;
  observation: string;
  orientation: string;
  decision: string;
  action: string | null;
  result: string | null;
  confidence: number;
}

export function logHistory(entry: HistoryEntry, cwd: string = process.cwd()): void {
  const logDir = join(cwd, ".meow");
  const logPath = join(logDir, "history.tsv");

  if (!existsSync(logDir)) {
    return; // Silently skip if .meow is not initialized
  }

  const isNew = !existsSync(logPath);
  const headers = ["timestamp", "missionId", "tick", "confidence", "orientation", "decision", "action", "result"].join("\t");
  
  const line = [
    entry.timestamp,
    entry.missionId,
    entry.tick,
    entry.confidence.toFixed(2),
    entry.orientation.replace(/\t|\n/g, " "),
    entry.decision.replace(/\t|\n/g, " "),
    (entry.action || "").replace(/\t|\n/g, " "),
    (entry.result || "").replace(/\t|\n/g, " "),
  ].join("\t");

  try {
    if (isNew) {
      writeFileSync(logPath, headers + "\n");
    }
    appendFileSync(logPath, line + "\n");
  } catch (e) {
    console.error(`[HistoryLogger] Failed to write to log: ${e}`);
  }
}
