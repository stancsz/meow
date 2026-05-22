import os from "os";
import fs from "fs";
import path from "path";

export interface AuditEntry {
  runId: string;
  timestamp: string;
  level: string;
  actionType: string;
  detail: string;
}

export class AuditLogger {
  private runId: string;
  private logPath: string;

  constructor(runId: string) {
    this.runId = runId;
    const baseDir = path.join(os.homedir(), ".meow");
    const auditDir = path.join(baseDir, "audit");
    if (!fs.existsSync(auditDir)) {
      fs.mkdirSync(auditDir, { recursive: true });
    }
    // We name the file using the runId to keep it clean and match the test grep pattern ~/.meow/audit/*.jsonl
    this.logPath = path.join(auditDir, `${runId}.jsonl`);
  }

  /**
   * Appends a log entry to the structured run audit file.
   */
  public log(entry: { level: string; actionType: string; detail: string }) {
    const logEntry: AuditEntry = {
      runId: this.runId,
      timestamp: new Date().toISOString(),
      level: entry.level,
      actionType: entry.actionType,
      detail: entry.detail,
    };
    fs.appendFileSync(this.logPath, JSON.stringify(logEntry) + "\n", "utf-8");
  }

  /**
   * Log an error action type.
   */
  public error(actionType: string, detail: string) {
    this.log({ level: "error", actionType, detail });
  }

  /**
   * Structured audit log for LLM calls, including model, cost, tokens, and duration.
   */
  public llmCall(
    model: string,
    inputTokens: number,
    outputTokens: number,
    durationMs: number,
    costCents: number,
    success: boolean
  ) {
    this.log({
      level: "info",
      actionType: "llm_call",
      detail: `Model: ${model} | Input: ${inputTokens} | Output: ${outputTokens} | Duration: ${durationMs}ms | Cost: ${costCents.toFixed(6)}¢ | Success: ${success}`,
    });
  }

  /**
   * Return the absolute path of this run's JSONL audit file.
   */
  public getLogPath(): string {
    return this.logPath;
  }
}
