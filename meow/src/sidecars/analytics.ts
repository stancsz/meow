/**
 * analytics.ts - Analytics Sidecar
 *
 * Anonymous usage tracking for Meow CLI. All data is local only.
 * Set MEOW_ANALYTICS=false to disable.
 *
 * Tracks:
 * - Token usage per session
 * - Tool usage frequency
 * - Error rates
 * - Session duration
 * - Model used
 *
 * Storage: ~/.meow/analytics/*.jsonl
 */
import { existsSync, appendFileSync, mkdirSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const DISABLED = process.env.MEOW_ANALYTICS === "false";
const ANALYTICS_DIR = join(homedir(), ".meow", "analytics");

function ensureAnalyticsDir(): void {
  if (DISABLED) return;
  if (!existsSync(ANALYTICS_DIR)) mkdirSync(ANALYTICS_DIR, { recursive: true });
}

export interface SessionStartEvent { type: "session_start"; timestamp: string; sessionId: string; model: string; }
export interface SessionEndEvent { type: "session_end"; timestamp: string; sessionId: string; durationMs: number; iterations: number; completed: boolean; }
export interface ToolCallEvent { type: "tool_call"; timestamp: string; sessionId: string; toolName: string; success: boolean; durationMs: number; error?: string; }
export interface TokenUsageEvent { type: "token_usage"; timestamp: string; sessionId: string; promptTokens: number; completionTokens: number; totalTokens: number; estimatedCostUSD: number; }
export interface ErrorEvent { type: "error"; timestamp: string; sessionId: string; errorType: string; errorMessage: string; }
export type AnalyticsEvent = SessionStartEvent | SessionEndEvent | ToolCallEvent | TokenUsageEvent | ErrorEvent;

let currentSessionId: string | null = null;
let currentSessionStart: number | null = null;

export function trackSessionStart(sessionId: string, model: string): void {
  if (DISABLED) return;
  ensureAnalyticsDir();
  appendEvent({ type: "session_start", timestamp: new Date().toISOString(), sessionId, model });
}

export function trackSessionEnd(sessionId: string, iterations: number, completed: boolean): void {
  if (DISABLED || !currentSessionStart) return;
  appendEvent({ type: "session_end", timestamp: new Date().toISOString(), sessionId, durationMs: Date.now() - currentSessionStart, iterations, completed });
  currentSessionId = null;
  currentSessionStart = null;
}

export function setCurrentSession(sessionId: string): void {
  currentSessionId = sessionId;
  currentSessionStart = Date.now();
}

export function trackToolCall(toolName: string, success: boolean, durationMs: number, error?: string): void {
  if (DISABLED || !currentSessionId) return;
  appendEvent({ type: "tool_call", timestamp: new Date().toISOString(), sessionId: currentSessionId, toolName, success, durationMs, error });
}

export function trackTokenUsage(promptTokens: number, completionTokens: number, totalTokens: number, estimatedCostUSD: number): void {
  if (DISABLED || !currentSessionId) return;
  appendEvent({ type: "token_usage", timestamp: new Date().toISOString(), sessionId: currentSessionId, promptTokens, completionTokens, totalTokens, estimatedCostUSD });
}

export function trackError(errorType: string, errorMessage: string): void {
  if (DISABLED) return;
  appendEvent({ type: "error", timestamp: new Date().toISOString(), sessionId: currentSessionId || "unknown", errorType, errorMessage: errorMessage.slice(0, 200) });
}

function appendEvent(event: AnalyticsEvent): void {
  if (DISABLED) return;
  try {
    const date = new Date().toISOString().slice(0, 10);
    const filePath = join(ANALYTICS_DIR, `events_${date}.jsonl`);
    appendFileSync(filePath, JSON.stringify(event) + "\n", "utf-8");
  } catch { /* silently fail */ }
}

export interface AggregatedStats {
  totalSessions: number; totalTokens: number; totalCostUSD: number;
  toolUsage: Record<string, number>; errorRate: number; avgSessionDurationMs: number; modelUsage: Record<string, number>;
}

export function getAggregatedStats(days: number = 7): AggregatedStats {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const toolUsage: Record<string, number> = {};
  let totalTokens = 0, totalCostUSD = 0, totalErrors = 0, totalToolCalls = 0;
  let totalSessionDurationMs = 0, totalSessions = 0;
  const modelUsage: Record<string, number> = {};
  if (!existsSync(ANALYTICS_DIR)) return { totalSessions: 0, totalTokens: 0, totalCostUSD: 0, toolUsage: {}, errorRate: 0, avgSessionDurationMs: 0, modelUsage: {} };

  for (const file of readdirSync(ANALYTICS_DIR).filter(f => f.endsWith(".jsonl"))) {
    const filePath = join(ANALYTICS_DIR, file);
    try {
      const stat = statSync(filePath);
      if (new Date(stat.mtimeMs).getTime() < cutoff) continue;
      const content = readFileSync(filePath, "utf-8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as AnalyticsEvent;
          if (new Date(event.timestamp).getTime() < cutoff) continue;
          switch (event.type) {
            case "session_start": modelUsage[event.model] = (modelUsage[event.model] || 0) + 1; break;
            case "session_end": totalSessions++; totalSessionDurationMs += event.durationMs; break;
            case "tool_call": toolUsage[event.toolName] = (toolUsage[event.toolName] || 0) + 1; totalToolCalls++; if (!event.success) totalErrors++; break;
            case "token_usage": totalTokens += event.totalTokens; totalCostUSD += event.estimatedCostUSD; break;
            case "error": totalErrors++; break;
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
  return { totalSessions, totalTokens, totalCostUSD, toolUsage, errorRate: totalToolCalls > 0 ? totalErrors / totalToolCalls : 0, avgSessionDurationMs: totalSessions > 0 ? totalSessionDurationMs / totalSessions : 0, modelUsage };
}

export function formatAnalyticsReport(stats: AggregatedStats): string {
  const lines = ["Analytics (last 7 days)", "", `  Sessions:    ${stats.totalSessions}`, `  Total tokens: ${stats.totalTokens.toLocaleString()}`, `  Total cost:   $${stats.totalCostUSD.toFixed(4)}`, `  Error rate:  ${(stats.errorRate * 100).toFixed(1)}%`, `  Avg session: ${(stats.avgSessionDurationMs / 1000).toFixed(1)}s`, ""];
  if (Object.keys(stats.toolUsage).length > 0) {
    lines.push("  Top tools:");
    for (const [tool, count] of Object.entries(stats.toolUsage).sort((a, b) => b[1] - a[1]).slice(0, 5)) lines.push(`    ${tool}: ${count}`);
    lines.push("");
  }
  if (Object.keys(stats.modelUsage).length > 0) { lines.push("  Models used:"); for (const [m, c] of Object.entries(stats.modelUsage)) lines.push(`    ${m}: ${c}`); lines.push(""); }
  return lines.join("\n");
}
