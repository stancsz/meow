/**
 * auto-daemon.ts - Background auto-improvement daemon
 *
 * Actively works on a mission by periodically prompting Meow.
 * Also monitors logs/ for new Meow→Claude fallback events.
 *
 * Monitors itself: warns if no API activity for 30 seconds.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(__dirname, "..", "..", "logs");
const COMPARE_AND_FIX = join(__dirname, "..", "sidecars", "compare-and-fix.ts");
const MEOW_RUN = join(__dirname, "..", "meow-run.ts");
const STATUS_FILE = join(LOGS_DIR, ".auto-daemon.status");
const MISSION_FILE = join(LOGS_DIR, ".auto-daemon.mission");
const PROGRESS_FILE = join(LOGS_DIR, ".auto-daemon.progress");
const OUTPUT_FILE = join(LOGS_DIR, ".auto-daemon.output");

// Work every 60 seconds by default (configurable via MEOW_WORK_INTERVAL_MS)
const WORK_INTERVAL_MS = parseInt(process.env.MEOW_WORK_INTERVAL_MS || "60000");
// Warn if no API activity for 30 seconds
const API_TIMEOUT_MS = 30000;

interface DaemonStatus {
  pid: number;
  startedAt: string;
  lastPoll: string;
  lastWork: string;
  lastFoundLog: string | null;
  mission: string | null;
  iteration: number;
}

interface Progress {
  iteration: number;
  lastMeowCall: string | null;
  lastMeowResponse: string | null;
  lastApiActivity: string | null;
  lastError: string | null;
  consecutiveFails: number;
}

// ============================================================================
// File helpers
// ============================================================================

function readStatus(): DaemonStatus | null {
  if (!existsSync(STATUS_FILE)) return null;
  try { return JSON.parse(readFileSync(STATUS_FILE, "utf-8")); } catch { return null; }
}

function writeStatus(status: DaemonStatus): void {
  writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
}

function removeStatus(): void {
  try { unlinkSync(STATUS_FILE); } catch {}
}

function readMissionFromFile(): string | null {
  if (!existsSync(MISSION_FILE)) return null;
  try { return readFileSync(MISSION_FILE, "utf-8").trim(); } catch { return null; }
}

function writeMissionToFile(prompt: string): void {
  writeFileSync(MISSION_FILE, prompt);
}

function deleteMissionFile(): void {
  try { unlinkSync(MISSION_FILE); } catch {}
}

function readProgress(): Progress | null {
  if (!existsSync(PROGRESS_FILE)) return null;
  try { return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8")); } catch { return null; }
}

function writeProgress(progress: Progress): void {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function appendOutput(entry: { timestamp: string; iteration: number; response: string; elapsed: number }): void {
  const existing = existsSync(OUTPUT_FILE)
    ? (JSON.parse(readFileSync(OUTPUT_FILE, "utf-8")) as any[]).slice(-49)
    : [];
  existing.push(entry);
  writeFileSync(OUTPUT_FILE, JSON.stringify(existing, null, 2));
}

function readOutput(): { timestamp: string; iteration: number; response: string; elapsed: number }[] {
  if (!existsSync(OUTPUT_FILE)) return [];
  try { return JSON.parse(readFileSync(OUTPUT_FILE, "utf-8")); } catch { return []; }
}

// ============================================================================
// Fallback log scanner
// ============================================================================

function findNewestFallbackLog(since: string): string | null {
  if (!existsSync(LOGS_DIR)) return null;
  const sinceMs = new Date(since).getTime();
  const files = readdirSync(LOGS_DIR)
    .filter(f => f.includes("meow-claude-code"))
    .filter(f => f.endsWith(".json"))
    .map(f => ({ path: join(LOGS_DIR, f), mtime: statSync(join(LOGS_DIR, f)).mtime.getTime() }))
    .filter(f => f.mtime > sinceMs)
    .sort((a, b) => b.mtime - a.mtime);
  return files.length > 0 ? files[0].path : null;
}

// ============================================================================
// Spawn compare-and-fix
// ============================================================================

function spawnCompareAndFix(logPath: string): void {
  console.error(`[auto-daemon] New fallback: ${logPath}`);
  const proc = spawn("bun", ["run", COMPARE_AND_FIX], {
    cwd: "/app",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
    shell: false,
    detached: false,
  });
  let stderr = "";
  proc.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  proc.on("close", (code) => {
    console.error(`[auto-daemon] compare-and-fix ${code === 0 ? "completed" : `exited ${code}`}`);
    if (stderr) console.error(stderr.slice(0, 300));
  });
  proc.on("error", (err) => {
    console.error(`[auto-daemon] compare-and-fix spawn error: ${err.message}`);
  });
}

// ============================================================================
// Spawn Meow with mission prompt
// ============================================================================

function spawnMeowMission(mission: string, iteration: number): { promise: Promise<string>, cancel: () => void } {
  let resolvePromise: (value: string) => void;
  let rejectPromise: (err: Error) => void;
  let cancelled = false;

  const promise = new Promise<string>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;

    const proc = spawn("bun", ["run", "--bun", MEOW_RUN, "--", mission], {
      cwd: "/app",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
      shell: false,
      detached: false,
    });

    let stdout = "";
    let stderr = "";
    const startTime = Date.now();

    // Mark API activity immediately
    const now = new Date().toISOString();
    const progress = readProgress() || { iteration: 0, lastMeowCall: null, lastMeowResponse: null, lastApiActivity: null, lastError: null, consecutiveFails: 0 };
    progress.lastMeowCall = now;
    progress.lastApiActivity = now;
    writeProgress(progress);

    proc.stdout?.on("data", (chunk: Buffer) => {
      // Each chunk marks API activity
      const progress = readProgress() || { iteration: 0, lastMeowCall: null, lastMeowResponse: null, lastApiActivity: null, lastError: null, consecutiveFails: 0 };
      progress.lastApiActivity = new Date().toISOString();
      writeProgress(progress);
      stdout += chunk.toString();
    });

    proc.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      if (cancelled) return;
      const elapsed = Date.now() - startTime;
      console.error(`[auto-daemon] Meow iteration ${iteration} done in ${elapsed}ms (exit ${code})`);

      if (code === 0 && stdout.trim()) {
        const progress = readProgress() || { iteration: 0, lastMeowCall: null, lastMeowResponse: null, lastApiActivity: null, lastError: null, consecutiveFails: 0 };
        progress.lastMeowResponse = new Date().toISOString();
        progress.consecutiveFails = 0;
        writeProgress(progress);
        // Append response to output file
        const outputEntry = {
          timestamp: new Date().toISOString(),
          iteration,
          response: stdout.trim(),
          elapsed,
        };
        appendOutput(outputEntry);
        resolvePromise(stdout.trim());
      } else {
        const progress = readProgress() || { iteration: 0, lastMeowCall: null, lastMeowResponse: null, lastApiActivity: null, lastError: null, consecutiveFails: 0 };
        progress.lastError = stderr.trim().slice(0, 200) || `exit code ${code}`;
        progress.consecutiveFails = (progress.consecutiveFails || 0) + 1;
        writeProgress(progress);
        resolvePromise(`[iteration ${iteration} failed: ${progress.lastError}]`);
      }
    });

    proc.on("error", (err) => {
      if (cancelled) return;
      const progress = readProgress() || { iteration: 0, lastMeowCall: null, lastMeowResponse: null, lastApiActivity: null, lastError: null, consecutiveFails: 0 };
      progress.lastError = err.message;
      progress.consecutiveFails = (progress.consecutiveFails || 0) + 1;
      writeProgress(progress);
      resolvePromise(`[iteration ${iteration} spawn error: ${err.message}]`);
    });

    // Apply per-call timeout
    setTimeout(() => {
      if (cancelled) return;
      proc.kill("SIGTERM");
      const progress = readProgress() || { iteration: 0, lastMeowCall: null, lastMeowResponse: null, lastApiActivity: null, lastError: null, consecutiveFails: 0 };
      progress.lastError = "Meow timed out";
      progress.consecutiveFails = (progress.consecutiveFails || 0) + 1;
      writeProgress(progress);
      resolvePromise(`[iteration ${iteration} timed out after ${WORK_INTERVAL_MS}ms]`);
    }, WORK_INTERVAL_MS - 1000);
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
    },
  };
}

// ============================================================================
// Main daemon loop
// ============================================================================

let running = true;
let currentWorkPromise: Promise<string> | null = null;
let apiWatchdogTimer: NodeJS.Timeout | null = null;
let isWorking = false;

function startApiWatchdog(): void {
  if (apiWatchdogTimer) clearInterval(apiWatchdogTimer);

function startApiWatchdog(): void {
  if (apiWatchdogTimer) clearInterval(apiWatchdogTimer);

  apiWatchdogTimer = setInterval(() => {
    const progress = readProgress();
    if (!progress?.lastApiActivity) return;

    const elapsed = Date.now() - new Date(progress.lastApiActivity).getTime();
    // We're working but no API response for 30s = hang detected
    if (isWorking && elapsed > API_TIMEOUT_MS) {
      console.error(`[auto-daemon] HANG DETECTED: no API response for ${Math.round(elapsed / 1000)}s`);
      logFallbackHang(progress.iteration, elapsed);
    }
  }, 10000);
}

/**
 * Log a hang as a fallback event so compare-and-fix fires on it
 */
function logFallbackHang(iteration: number, elapsedMs: number): void {
  const mission = readMissionFromFile() || "";
  const hangLog = {
    timestamp: new Date().toISOString(),
    channelId: "auto-daemon",
    userPrompt: mission.slice(0, 500),
    attemptPath: "meow→claude-code",
    meowError: `Hang detected: iteration ${iteration} made no API call after ${elapsedMs}ms`,
    fallbackSuccess: false,
    finalBackend: "meow",
    finalResponseLength: 0,
  };
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(LOGS_DIR, `${ts}_auto-daemon_hang_meow-claude-code.json`);
  try {
    writeFileSync(path, JSON.stringify(hangLog, null, 2));
    console.error(`[auto-daemon] Hang logged to ${path} — compare-and-fix should trigger next poll`);
  } catch (e: any) {
    console.error(`[auto-daemon] Failed to log hang: ${e.message}`);
  }
}
}

function stopApiWatchdog(): void {
  if (apiWatchdogTimer) {
    clearInterval(apiWatchdogTimer);
    apiWatchdogTimer = null;
  }
}

function runDaemonLoop(): void {
  const pid = process.pid;
  const startedAt = new Date().toISOString();
  let iteration = 0;
  let lastPoll = startedAt;

  // Initialize progress
  writeProgress({ iteration: 0, lastMeowCall: null, lastMeowResponse: null, lastApiActivity: null, lastError: null, consecutiveFails: 0 });

  startApiWatchdog();

  console.error(`[auto-daemon] Daemon starting (PID ${pid}) — working every ${WORK_INTERVAL_MS}ms, API watchdog after ${API_TIMEOUT_MS}ms`);

  const loop = setInterval(async () => {
    if (!running) return;

    const mission = readMissionFromFile();
    const s = readStatus();

    if (!mission) {
      // No mission — just poll for fallback logs
      try {
        const newest = findNewestFallbackLog(lastPoll);
        if (newest) {
          lastPoll = newest;
          spawnCompareAndFix(newest);
        }
      } catch (e: any) {
        console.error(`[auto-daemon] poll error: ${e.message}`);
      }
      writeStatus({ pid, startedAt, lastPoll: new Date().toISOString(), lastWork: s?.lastWork ?? "", lastFoundLog: newest ?? s?.lastFoundLog ?? null, mission, iteration });
      return;
    }

    // There is a mission — actively work on it
    iteration++;
    const now = new Date().toISOString();
    isWorking = true;
    console.error(`[auto-daemon] Iteration ${iteration}: working on mission`);

    writeStatus({ pid, startedAt, lastPoll: now, lastWork: now, lastFoundLog: s?.lastFoundLog ?? null, mission, iteration });
    writeProgress({
      iteration,
      lastMeowCall: null,
      lastMeowResponse: null,
      lastApiActivity: null,
      lastError: null,
      consecutiveFails: 0,
    });

    try {
      const { promise } = spawnMeowMission(mission, iteration);
      currentWorkPromise = promise;
      const response = await promise;
      currentWorkPromise = null;

      if (response.startsWith("[iteration") && response.includes("failed") && !response.includes("timed out")) {
        console.error(`[auto-daemon] Iteration ${iteration} failed: ${response}`);
      } else {
        console.error(`[auto-daemon] Iteration ${iteration} response (${response.length} chars): ${response.slice(0, 200)}`);
      }
    } catch (e: any) {
      console.error(`[auto-daemon] Iteration ${iteration} error: ${e.message}`);
    }

    isWorking = false;

    // Also check for fallbacks while we're at it
    try {
      const newest = findNewestFallbackLog(lastPoll);
      if (newest) {
        lastPoll = newest;
        spawnCompareAndFix(newest);
      }
    } catch (e: any) {
      console.error(`[auto-daemon] fallback poll error: ${e.message}`);
    }

    writeStatus({ pid, startedAt, lastPoll: new Date().toISOString(), lastWork: now, lastFoundLog: s?.lastFoundLog ?? null, mission, iteration });
  }, WORK_INTERVAL_MS);

  process.on("SIGTERM", () => {
    running = false;
    clearInterval(loop);
    stopApiWatchdog();
    console.error(`[auto-daemon] PID ${pid} stopping`);
    removeStatus();
    try { unlinkSync(PROGRESS_FILE); } catch {}
    process.exit(0);
  });
}

// ============================================================================
// Exports
// ============================================================================

export function getAutoDaemonStatus(): {
  running: boolean;
  pid: number | null;
  lastKnownLog: string;
  mission: string | null;
  iteration: number;
  lastWork: string | null;
} {
  const s = readStatus();
  if (!s) return { running: false, pid: null, lastKnownLog: "(none)", mission: null, iteration: 0, lastWork: null };
  try {
    process.kill(s.pid, 0);
    return { running: true, pid: s.pid, lastKnownLog: s.lastFoundLog ?? "(none)", mission: s.mission ?? null, iteration: s.iteration ?? 0, lastWork: s.lastWork ?? null };
  } catch {
    removeStatus();
    return { running: false, pid: null, lastKnownLog: "(none)", mission: null, iteration: 0, lastWork: null };
  }
}

export function startAutoDaemon(): string {
  const existing = readStatus();
  if (existing) {
    try {
      process.kill(existing.pid, 0);
      return `[auto-daemon] Already running (PID ${existing.pid})`;
    } catch {
      removeStatus();
    }
  }
  const daemon = spawn("bun", ["run", "--bun", import.meta.filename, "run"], {
    cwd: "/app",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
    shell: false,
    detached: true,
  });
  daemon.unref();
  return `[auto-daemon] Started (PID ${daemon.pid}) — working every ${WORK_INTERVAL_MS}ms`;
}

export function stopAutoDaemon(): string {
  const s = readStatus();
  if (!s) return `[auto-daemon] Not running`;
  running = false;
  try {
    process.kill(s.pid, "SIGTERM");
    return `[auto-daemon] Sent SIGTERM to PID ${s.pid}`;
  } catch (e: any) {
    removeStatus();
    return `[auto-daemon] Failed: ${e.message}`;
  }
}

export function setMission(prompt: string): void {
  writeMissionToFile(prompt);
  // Update running daemon's status
  const s = readStatus();
  if (s) writeStatus({ ...s, mission: prompt });
}

export function getMission(): string | null {
  return readMissionFromFile();
}

export function clearMission(): void {
  deleteMissionFile();
}

export function getProgress(): Progress | null {
  return readProgress();
}

// ============================================================================
// CLI
// ============================================================================

const cmd = process.argv[2]?.toLowerCase();

if (!cmd || cmd === "status") {
  const s = getAutoDaemonStatus();
  const p = readProgress();
  if (!s.running) {
    console.log("Auto daemon: stopped");
  } else {
    console.log(`Auto daemon: RUNNING | PID: ${s.pid} | Iteration: ${s.iteration} | Last work: ${s.lastWork ?? "never"}`);
    if (s.mission) console.log(`Mission: ${s.mission}`);
    if (p) {
      console.log(`Last Meow call: ${p.lastMeowCall ?? "never"} | Last response: ${p.lastMeowResponse ?? "never"} | API activity: ${p.lastApiActivity ?? "never"}`);
      if (p.lastError) console.log(`Last error: ${p.lastError}`);
      if (p.consecutiveFails > 0) console.log(`Consecutive fails: ${p.consecutiveFails}`);
    }
  }
  process.exit(0);
}

if (cmd === "stop") {
  deleteMissionFile();
  console.log(stopAutoDaemon());
  process.exit(0);
}

if (cmd === "start") {
  console.log(startAutoDaemon());
  process.exit(0);
}

if (cmd === "mission") {
  const missionArgs = process.argv.slice(3).join(" ");
  if (!missionArgs) {
    const current = readMissionFromFile();
    console.log(current ? `Current mission: ${current}` : "No mission set");
  } else {
    writeMissionToFile(missionArgs);
    console.log(`Mission set: ${missionArgs}`);
    const s = readStatus();
    if (s) writeStatus({ ...s, mission: missionArgs });
  }
  process.exit(0);
}

if (cmd === "progress") {
  const p = readProgress();
  if (!p) {
    console.log("No progress recorded");
  } else {
    console.log(JSON.stringify(p, null, 2));
  }
  process.exit(0);
}

if (cmd === "output") {
  const entries = readOutput();
  if (entries.length === 0) {
    console.log("No output recorded");
  } else {
    console.log(`=== Daemon output (${entries.length} entries) ===`);
    for (const entry of entries) {
      console.log(`\n--- Iteration ${entry.iteration} @ ${entry.timestamp} (${entry.elapsed}ms) ---`);
      console.log(entry.response.slice(0, 500));
    }
  }
  process.exit(0);
}

if (cmd === "run") {
  runDaemonLoop();
} else {
  console.error(`[auto-daemon] Usage: auto-daemon.ts [start|stop|status|mission|progress|run]`);
  process.exit(cmd ? 1 : 0);
}
