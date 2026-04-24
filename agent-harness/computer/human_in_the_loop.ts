/**
 * human_in_the_loop.ts
 *
 * Human-in-the-Loop (HITL) module for the Desktop Agent.
 * Gates potentially destructive or ambiguous actions behind human approval.
 *
 * Architecture (Eigent-inspired):
 * - riskAssessment() scores an action on 0–10 risk scale
 * - requiresApproval() returns true for HIGH (≥8) and MEDIUM (≥5) risk actions
 * - promptHuman() blocks until the human approves/rejects
 * - approve() / reject() resolve the pending request
 *
 * Integration:
 * - computer_agent.ts calls requiresApproval() before every action
 * - When waiting, screen state is captured and shown to the user
 * - The trigger can operate via: Discord DM, terminal prompt, HTTP callback
 *
 * Risk taxonomy:
 *   0–4   LOW      — safe to auto-execute (e.g., type text, open app)
 *   5–7   MEDIUM   — confirm before proceeding (e.g., delete file, send message)
 *   8–10  HIGH     — hard stop, require explicit approval (e.g., format disk, send email)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface ActionContext {
  tool: string;           // "click" | "type" | "delete" | "send" | ...
  target?: string;        // human-readable description of what will change
  details?: string;       // additional context (file path, URL, etc.)
  screenSummary?: string; // current screen description (for user context)
  confidence?: number;    // 0–1, how confident the agent is about this action
}

export interface RiskAssessment {
  level: RiskLevel;
  score: number;         // 0–10
  reasons: string[];    // why this score was assigned
  suggestion?: string;   // what the agent should do instead if risky
}

export interface ApprovalRequest {
  id: string;
  action: ActionContext;
  risk: RiskAssessment;
  timestamp: number;
  resolved: boolean;
  approved: boolean | null;
  approver?: string;
  resolvedAt?: number;
}

export type TriggerChannel = "discord" | "stdout" | "http-callback" | "none";

// ============================================================================
// Configuration
// ============================================================================

interface HitlConfig {
  enabled: boolean;
  defaultThreshold: RiskLevel;  // minimum level requiring approval
  timeoutMs: number;           // how long to wait for human before giving up
  channel: TriggerChannel;      // how to reach the human
  httpCallbackUrl?: string;     // POST approval result here
  discordChannelId?: string;   // Discord channel/DM to message
  autoApproveLowRisk: boolean; // skip approval for LOW risk actions
}

const DEFAULT_CONFIG: HitlConfig = {
  enabled: true,
  defaultThreshold: "MEDIUM",  // MEDIUM and HIGH require approval
  timeoutMs: 60000,            // 60s to respond
  channel: "stdout",           // default to terminal
  autoApproveLowRisk: true,
};

let CONFIG = { ...DEFAULT_CONFIG };

export function configure(overrides: Partial<HitlConfig>) {
  CONFIG = { ...CONFIG, ...overrides };
}

export function getConfig(): HitlConfig {
  return { ...CONFIG };
}

// ============================================================================
// State
// ============================================================================

const PENDING_FILE = "/tmp/hitl_pending.json";

let pendingRequest: ApprovalRequest | null = null;
let resolveApproval: ((approved: boolean) => void) | null = null;

// ============================================================================
// Risk Assessment
// ============================================================================

/**
 * riskAssessment(action) — compute risk score for an action.
 *
 * Risk is computed from:
 * 1. Action type — destructive actions score higher
 * 2. Target — sensitive targets (system, email, files) score higher
 * 3. Confidence — low confidence in element detection adds risk
 * 4. Context — repeating patterns are lower risk than one-off actions
 */
export function riskAssessment(action: ActionContext): RiskAssessment {
  let score = 0;
  const reasons: string[] = [];

  // --- Action-type scoring ---
  const actionRiskMap: Record<string, number> = {
    click: 2, type: 1, screenshot: 0, ocr: 0,
    openApp: 1, focusWindow: 1, scroll: 1,
    delete: 8, move: 7, rename: 5, copy: 3,
    send: 7, submit: 5, login: 4,
    format: 10, shutdown: 10, reboot: 9,
    download: 4, upload: 5, install: 6,
    exec: 6, shell: 7,
  };
  const base = actionRiskMap[action.tool] ?? 3;
  score += base;
  if (base >= 5) reasons.push(`Action type '${action.tool}' is high-risk`);

  // --- Target scoring ---
  if (action.target) {
    const t = action.target.toLowerCase();

    // Destructive patterns
    if (/delete|remove|trash|rm\s|drop\s|drop\sdatabase/i.test(t)) {
      score += 3;
      reasons.push("Target involves deletion");
    }
    // Sensitive targets
    if (/system|boot|partition|disk|email|bank|password|\.env|credential/i.test(t)) {
      score += 2;
      reasons.push("Sensitive target detected");
    }
    // Web actions
    if (/send\semail|post\sto|tweet|submit\sform/i.test(t)) {
      score += 2;
      reasons.push("Irreversible communication action");
    }
    // File operations
    if (/\.(sh|ps1|bash|exe|dmg|app|deb|rpm|msi)/i.test(t)) {
      score += 1;
      reasons.push("Executable file operation");
    }
  }

  // --- Confidence penalty ---
  if (action.confidence !== undefined && action.confidence < 0.8) {
    const penalty = Math.round((0.8 - action.confidence) * 20);
    score += penalty;
    if (penalty > 0) reasons.push(`Low element confidence (${Math.round(action.confidence * 100)}%) adds risk`);
  }

  // --- Details context ---
  if (action.details) {
    if (/\brm\s+-rf\b/i.test(action.details)) { score += 4; reasons.push("Recursive force delete detected"); }
    if (/sudo|root|admin/i.test(action.details)) { score += 1; reasons.push("Privileged operation"); }
  }

  // Cap at 10
  score = Math.min(10, score);

  // Derive level
  const level: RiskLevel =
    score >= 8 ? "HIGH" :
    score >= 5 ? "MEDIUM" :
    "LOW";

  return { level, score, reasons, suggestion: score >= 5 ? "Consider asking for human approval" : undefined };
}

/**
 * requiresApproval(action) — should this action be gated behind human approval?
 */
export function requiresApproval(action: ActionContext): boolean {
  if (!CONFIG.enabled) return false;

  const { level } = riskAssessment(action);

  if (CONFIG.autoApproveLowRisk && level === "LOW") return false;
  if (CONFIG.defaultThreshold === "LOW") return true;
  if (CONFIG.defaultThreshold === "MEDIUM" && level !== "LOW") return true;
  if (CONFIG.defaultThreshold === "HIGH" && level === "HIGH") return true;

  return false;
}

// ============================================================================
// Approval Queue
// ============================================================================

/**
 * promptHuman(action) — request human approval for an action.
 * Blocks until approved, rejected, or timeout.
 *
 * Returns:
 *   true   — human approved
 *   false  — human rejected or timed out
 */
export async function promptHuman(action: ActionContext): Promise<boolean> {
  const risk = riskAssessment(action);

  const request: ApprovalRequest = {
    id: Math.random().toString(36).slice(2, 10),
    action,
    risk,
    timestamp: Date.now(),
    resolved: false,
    approved: null,
  };

  pendingRequest = request;
  _persistPending(request);

  // Emit notification via configured channel
  await _notifyChannel(request);

  // Wait for human response
  return new Promise<boolean>((resolve) => {
    resolveApproval = resolve;

    // Set timeout
    const timeout = setTimeout(() => {
      if (!request.resolved) {
        request.resolved = true;
        request.approved = false;
        request.resolvedAt = Date.now();
        _clearPending();
        console.log(`[hitl] ⏱️  Approval timeout after ${CONFIG.timeoutMs}ms — defaulting to DENY`);
        resolve(false);
      }
    }, CONFIG.timeoutMs);

    // Resolve handler
    const doResolve = (approved: boolean) => {
      clearTimeout(timeout);
      request.resolved = true;
      request.approved = approved;
      request.resolvedAt = Date.now();
      _clearPending();
      resolve(approved);
    };

    resolveApproval = doResolve;
  });
}

/**
 * approve(requestId?) — approve a pending request (or the current pending).
 */
export function approve(requestId?: string): boolean {
  if (pendingRequest && (!requestId || pendingRequest.id === requestId)) {
    const approved = true;
    if (resolveApproval) {
      resolveApproval(approved);
      resolveApproval = null;
    }
    console.log(`[hitl] ✅ Approved: ${pendingRequest.action.tool} on ${pendingRequest.action.target ?? "unknown"}`);
    return true;
  }
  console.warn(`[hitl] No pending request to approve (id: ${requestId})`);
  return false;
}

/**
 * reject(requestId?) — reject a pending request (or the current pending).
 */
export function reject(requestId?: string): boolean {
  if (pendingRequest && (!requestId || pendingRequest.id === requestId)) {
    const approved = false;
    if (resolveApproval) {
      resolveApproval(approved);
      resolveApproval = null;
    }
    console.log(`[hitl] ❌ Rejected: ${pendingRequest.action.tool} on ${pendingRequest.action.target ?? "unknown"}`);
    return true;
  }
  console.warn(`[hitl] No pending request to reject (id: ${requestId})`);
  return false;
}

/**
 * getPendingRequest() — get the current pending approval request.
 */
export function getPendingRequest(): ApprovalRequest | null {
  return pendingRequest;
}

/**
 * getRiskSummary() — returns a human-readable risk summary for last assessment.
 */
export function getRiskSummary(action: ActionContext): string {
  const { level, score, reasons } = riskAssessment(action);
  const icon = level === "HIGH" ? "🔴" : level === "MEDIUM" ? "🟡" : "🟢";
  let summary = `${icon} Risk: ${level} (score ${score}/10)\n`;
  if (reasons.length > 0) {
    summary += `  Reasons: ${reasons.join("; ")}`;
  }
  return summary;
}

// ============================================================================
// Channel Implementations
// ============================================================================

async function _notifyChannel(request: ApprovalRequest): Promise<void> {
  const { tool, target, details } = request.action;
  const { level, score } = request.risk;
  const icon = level === "HIGH" ? "🔴" : level === "MEDIUM" ? "🟡" : "🟢";

  const msg = [
    `${icon} **Human Approval Required**`,
    `Action: \`${tool}\`${target ? ` targeting \`${target}\`` : ""}`,
    `Risk: ${level} (score ${score}/10)`,
    details ? `Details: ${details}` : "",
    `Timeout: ${Math.round(CONFIG.timeoutMs / 1000)}s`,
    "",
    `Approve: \`/hitl approve ${request.id}\``,
    `Reject: \`/hitl reject ${request.id}\``,
  ].filter(Boolean).join("\n");

  if (CONFIG.channel === "stdout") {
    console.log("\n" + msg + "\n");
  } else if (CONFIG.channel === "http-callback" && CONFIG.httpCallbackUrl) {
    await _httpNotify(msg, request);
  } else if (CONFIG.channel === "discord" && CONFIG.discordChannelId) {
    // Discord notification handled by the relay; write to a notification file
    const notifPath = "/tmp/hitl_notification.json";
    writeFileSync(notifPath, JSON.stringify({ request, message: msg, channelId: CONFIG.discordChannelId }));
    console.log(`[hitl] Discord notification written to ${notifPath}`);
  }
}

async function _httpNotify(msg: string, request: ApprovalRequest): Promise<void> {
  try {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);
    const body = JSON.stringify({
      id: request.id,
      action: request.action,
      risk: request.risk,
      message: msg,
      timestamp: request.timestamp,
    });
    await execAsync(
      `curl -s -X POST "${CONFIG.httpCallbackUrl}" -H "Content-Type: application/json" -d '${body.replace(/'/g, "'\"'\"'")}'`,
      { timeout: 10000 }
    );
    console.log(`[hitl] HTTP callback sent to ${CONFIG.httpCallbackUrl}`);
  } catch (e: any) {
    console.warn(`[hitl] HTTP callback failed: ${e.message}`);
  }
}

// ============================================================================
// Persistence
// ============================================================================

function _persistPending(request: ApprovalRequest) {
  try {
    mkdirSync("/tmp", { recursive: true });
    writeFileSync(PENDING_FILE, JSON.stringify(request, null, 2));
  } catch (e: any) {
    console.warn(`[hitl] Could not persist pending request: ${e.message}`);
  }
}

function _clearPending() {
  pendingRequest = null;
  resolveApproval = null;
  try {
    if (existsSync(PENDING_FILE)) {
      writeFileSync(PENDING_FILE, JSON.stringify({ cleared: true, at: Date.now() }));
    }
  } catch { /* ignore */ }
}

/**
 * loadPendingRequest() — restore a pending request from disk (e.g., after restart).
 */
export function loadPendingRequest(): ApprovalRequest | null {
  try {
    if (existsSync(PENDING_FILE)) {
      const data = JSON.parse(readFileSync(PENDING_FILE, "utf-8"));
      if (data.cleared) return null;
      return data as ApprovalRequest;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * reset() — clear all pending state (use with caution).
 */
export function reset(): void {
  _clearPending();
  try { if (existsSync(PENDING_FILE)) writeFileSync(PENDING_FILE, ""); } catch { /* ignore */ }
}

// ============================================================================
// CLI Commands (for manual testing)
// ============================================================================

/**
 * handleCliCommand(input: string) — process a HITL CLI command.
 * Commands: "approve", "reject", "status", "reset"
 */
export function handleCliCommand(input: string): string {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const arg = parts[1];

  if (cmd === "approve" || cmd === "yes" || cmd === "y") {
    const ok = approve(arg);
    return ok ? "✅ Request approved." : "❌ No pending request.";
  }
  if (cmd === "reject" || cmd === "no" || cmd === "n") {
    const ok = reject(arg);
    return ok ? "❌ Request rejected." : "❌ No pending request.";
  }
  if (cmd === "status") {
    const p = pendingRequest;
    if (!p) return "No pending approval requests.";
    return `Pending: [${p.risk.level}] ${p.action.tool} — ${p.action.target ?? "unknown"} (id: ${p.id})`;
  }
  if (cmd === "reset") {
    reset();
    return "HITL state reset.";
  }
  return `Unknown command: ${cmd}. Use: approve, reject, status, reset`;
}