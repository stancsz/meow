import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// agent-harness/computer/human_in_the_loop.ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
var DEFAULT_CONFIG = {
  enabled: true,
  defaultThreshold: "MEDIUM",
  timeoutMs: 60000,
  channel: "stdout",
  autoApproveLowRisk: true
};
var CONFIG = { ...DEFAULT_CONFIG };
function configure(overrides) {
  CONFIG = { ...CONFIG, ...overrides };
}
function getConfig() {
  return { ...CONFIG };
}
var PENDING_FILE = "/tmp/hitl_pending.json";
var pendingRequest = null;
var resolveApproval = null;
function riskAssessment(action) {
  let score = 0;
  const reasons = [];
  const actionRiskMap = {
    click: 2,
    type: 1,
    screenshot: 0,
    ocr: 0,
    openApp: 1,
    focusWindow: 1,
    scroll: 1,
    delete: 8,
    move: 7,
    rename: 5,
    copy: 3,
    send: 7,
    submit: 5,
    login: 4,
    format: 10,
    shutdown: 10,
    reboot: 9,
    download: 4,
    upload: 5,
    install: 6,
    exec: 6,
    shell: 7
  };
  const base = actionRiskMap[action.tool] ?? 3;
  score += base;
  if (base >= 5)
    reasons.push(`Action type '${action.tool}' is high-risk`);
  if (action.target) {
    const t = action.target.toLowerCase();
    if (/delete|remove|trash|rm\s|drop\s|drop\sdatabase/i.test(t)) {
      score += 3;
      reasons.push("Target involves deletion");
    }
    if (/system|boot|partition|disk|email|bank|password|\.env|credential/i.test(t)) {
      score += 2;
      reasons.push("Sensitive target detected");
    }
    if (/send\semail|post\sto|tweet|submit\sform/i.test(t)) {
      score += 2;
      reasons.push("Irreversible communication action");
    }
    if (/\.(sh|ps1|bash|exe|dmg|app|deb|rpm|msi)/i.test(t)) {
      score += 1;
      reasons.push("Executable file operation");
    }
  }
  if (action.confidence !== undefined && action.confidence < 0.8) {
    const penalty = Math.round((0.8 - action.confidence) * 20);
    score += penalty;
    if (penalty > 0)
      reasons.push(`Low element confidence (${Math.round(action.confidence * 100)}%) adds risk`);
  }
  if (action.details) {
    if (/\brm\s+-rf\b/i.test(action.details)) {
      score += 4;
      reasons.push("Recursive force delete detected");
    }
    if (/sudo|root|admin/i.test(action.details)) {
      score += 1;
      reasons.push("Privileged operation");
    }
  }
  score = Math.min(10, score);
  const level = score >= 8 ? "HIGH" : score >= 5 ? "MEDIUM" : "LOW";
  return { level, score, reasons, suggestion: score >= 5 ? "Consider asking for human approval" : undefined };
}
function requiresApproval(action) {
  if (!CONFIG.enabled)
    return false;
  const { level } = riskAssessment(action);
  if (CONFIG.autoApproveLowRisk && level === "LOW")
    return false;
  if (CONFIG.defaultThreshold === "LOW")
    return true;
  if (CONFIG.defaultThreshold === "MEDIUM" && level !== "LOW")
    return true;
  if (CONFIG.defaultThreshold === "HIGH" && level === "HIGH")
    return true;
  return false;
}
async function promptHuman(action) {
  const risk = riskAssessment(action);
  const request = {
    id: Math.random().toString(36).slice(2, 10),
    action,
    risk,
    timestamp: Date.now(),
    resolved: false,
    approved: null
  };
  pendingRequest = request;
  _persistPending(request);
  await _notifyChannel(request);
  return new Promise((resolve) => {
    resolveApproval = resolve;
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
    const doResolve = (approved) => {
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
function approve(requestId) {
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
function reject(requestId) {
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
function getPendingRequest() {
  return pendingRequest;
}
function getRiskSummary(action) {
  const { level, score, reasons } = riskAssessment(action);
  const icon = level === "HIGH" ? "\uD83D\uDD34" : level === "MEDIUM" ? "\uD83D\uDFE1" : "\uD83D\uDFE2";
  let summary = `${icon} Risk: ${level} (score ${score}/10)
`;
  if (reasons.length > 0) {
    summary += `  Reasons: ${reasons.join("; ")}`;
  }
  return summary;
}
async function _notifyChannel(request) {
  const { tool, target, details } = request.action;
  const { level, score } = request.risk;
  const icon = level === "HIGH" ? "\uD83D\uDD34" : level === "MEDIUM" ? "\uD83D\uDFE1" : "\uD83D\uDFE2";
  const msg = [
    `${icon} **Human Approval Required**`,
    `Action: \`${tool}\`${target ? ` targeting \`${target}\`` : ""}`,
    `Risk: ${level} (score ${score}/10)`,
    details ? `Details: ${details}` : "",
    `Timeout: ${Math.round(CONFIG.timeoutMs / 1000)}s`,
    "",
    `Approve: \`/hitl approve ${request.id}\``,
    `Reject: \`/hitl reject ${request.id}\``
  ].filter(Boolean).join(`
`);
  if (CONFIG.channel === "stdout") {
    console.log(`
` + msg + `
`);
  } else if (CONFIG.channel === "http-callback" && CONFIG.httpCallbackUrl) {
    await _httpNotify(msg, request);
  } else if (CONFIG.channel === "discord" && CONFIG.discordChannelId) {
    const notifPath = "/tmp/hitl_notification.json";
    writeFileSync(notifPath, JSON.stringify({ request, message: msg, channelId: CONFIG.discordChannelId }));
    console.log(`[hitl] Discord notification written to ${notifPath}`);
  }
}
async function _httpNotify(msg, request) {
  try {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);
    const body = JSON.stringify({
      id: request.id,
      action: request.action,
      risk: request.risk,
      message: msg,
      timestamp: request.timestamp
    });
    await execAsync(`curl -s -X POST "${CONFIG.httpCallbackUrl}" -H "Content-Type: application/json" -d '${body.replace(/'/g, `'"'"'`)}'`, { timeout: 1e4 });
    console.log(`[hitl] HTTP callback sent to ${CONFIG.httpCallbackUrl}`);
  } catch (e) {
    console.warn(`[hitl] HTTP callback failed: ${e.message}`);
  }
}
function _persistPending(request) {
  try {
    mkdirSync("/tmp", { recursive: true });
    writeFileSync(PENDING_FILE, JSON.stringify(request, null, 2));
  } catch (e) {
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
  } catch {}
}
function loadPendingRequest() {
  try {
    if (existsSync(PENDING_FILE)) {
      const data = JSON.parse(readFileSync(PENDING_FILE, "utf-8"));
      if (data.cleared)
        return null;
      return data;
    }
  } catch {}
  return null;
}
function reset() {
  _clearPending();
  try {
    if (existsSync(PENDING_FILE))
      writeFileSync(PENDING_FILE, "");
  } catch {}
}
function handleCliCommand(input) {
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
    if (!p)
      return "No pending approval requests.";
    return `Pending: [${p.risk.level}] ${p.action.tool} — ${p.action.target ?? "unknown"} (id: ${p.id})`;
  }
  if (cmd === "reset") {
    reset();
    return "HITL state reset.";
  }
  return `Unknown command: ${cmd}. Use: approve, reject, status, reset`;
}
export {
  riskAssessment,
  reset,
  requiresApproval,
  reject,
  promptHuman,
  loadPendingRequest,
  handleCliCommand,
  getRiskSummary,
  getPendingRequest,
  getConfig,
  configure,
  approve
};
