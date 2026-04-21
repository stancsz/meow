/**
 * auto-daemon.ts - Background auto-improvement daemon
 *
 * Monitors logs/ for new Meow→Claude fallback events.
 * On each new fallback, spawns compare-and-fix to improve Meow's kernel.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const LOGS_DIR = "/app/logs";
const COMPARE_AND_FIX = "/app/compare-and-fix.ts";
const STATUS_FILE = "/app/logs/.auto-daemon.status";
const MISSION_FILE = "/app/logs/.auto-daemon.mission";
const POLL_INTERVAL_MS = 10000;

interface DaemonStatus {
  pid: number;
  startedAt: string;
  lastPoll: string;
  lastFoundLog: string | null;
  mission: string | null;
}

function readStatus(): DaemonStatus | null {
  if (!existsSync(STATUS_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATUS_FILE, "utf-8"));
  } catch { return null; }
}

function writeStatus(status: DaemonStatus): void {
  writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
}

function removeStatus(): void {
  try { unlinkSync(STATUS_FILE); } catch {}
}

function writeMissionToFile(prompt: string): void {
  writeFileSync(MISSION_FILE, prompt);
}

function readMissionFromFile(): string | null {
  if (!existsSync(MISSION_FILE)) return null;
  try { return readFileSync(MISSION_FILE, "utf-8").trim(); } catch { return null; }
}

function deleteMissionFile(): void {
  try { unlinkSync(MISSION_FILE); } catch {}
}

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

function runPollLoop(): void {
  const pid = process.pid;
  const startedAt = new Date().toISOString();
  let lastPoll = startedAt;
  let lastFoundLog: string | null = null;
  const mission = readMissionFromFile();

  writeStatus({ pid, startedAt, lastPoll, lastFoundLog, mission });
  console.error(`[auto-daemon] Poll loop running (PID ${pid})${mission ? ` for mission: ${mission}` : ""}`);

  const interval = setInterval(() => {
    try {
      const newest = findNewestFallbackLog(lastPoll);
      if (newest && newest !== lastFoundLog) {
        lastFoundLog = newest;
        writeStatus({ pid, startedAt, lastPoll: new Date().toISOString(), lastFoundLog, mission });
        spawnCompareAndFix(newest);
      } else {
        writeStatus({ pid, startedAt, lastPoll: new Date().toISOString(), lastFoundLog, mission });
      }
    } catch (e: any) {
      console.error(`[auto-daemon] poll error: ${e.message}`);
    }
  }, POLL_INTERVAL_MS);

  process.on("SIGTERM", () => {
    clearInterval(interval);
    console.error(`[auto-daemon] PID ${pid} stopping`);
    removeStatus();
    process.exit(0);
  });
}

// ============================================================================
// Exports for relay.ts
// ============================================================================

export function getAutoDaemonStatus(): { running: boolean; pid: number | null; lastKnownLog: string; mission: string | null } {
  const s = readStatus();
  if (!s) return { running: false, pid: null, lastKnownLog: "(none)", mission: null };
  try {
    process.kill(s.pid, 0);
    return { running: true, pid: s.pid, lastKnownLog: s.lastFoundLog ?? "(none)", mission: s.mission ?? null };
  } catch {
    removeStatus();
    return { running: false, pid: null, lastKnownLog: "(none)", mission: null };
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
  return `[auto-daemon] Started daemon (PID ${daemon.pid}) — use \`/auto status\` to check`;
}

export function stopAutoDaemon(): string {
  const s = readStatus();
  if (!s) return `[auto-daemon] Not running`;
  try {
    process.kill(s.pid, "SIGTERM");
    return `[auto-daemon] Sent SIGTERM to PID ${s.pid}`;
  } catch (e: any) {
    removeStatus();
    return `[auto-daemon] Failed to kill PID ${s.pid}: ${e.message}`;
  }
}

// ============================================================================
// CLI entry
// ============================================================================

const cmd = process.argv[2]?.toLowerCase();

if (!cmd || cmd === "status") {
  const s = getAutoDaemonStatus();
  if (!s.running) {
    console.log("Auto daemon: stopped");
  } else {
    const full = readStatus();
    console.log(`Auto daemon: RUNNING | PID: ${s.pid} | Started: ${full?.startedAt ?? "?"} | Last poll: ${full?.lastPoll ?? "?"} | Last log: ${s.lastKnownLog}`);
    if (s.mission) console.log(`Mission: ${s.mission}`);
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

if (cmd === "run") {
  runPollLoop();
} else {
  console.error(`[auto-daemon] Usage: auto-daemon.ts [start|stop|status|mission|run]`);
  process.exit(cmd ? 1 : 0);
}
