/**
 * bun-scheduler.ts - Bun-based job scheduler for agent-harness
 *
 * Parses JOB.md (H1 headings = job names, description below = job prompt),
 * runs Claude Code CLI for each job on a hourly schedule.
 *
 * Features:
 * - Parallel job execution
 * - 30-second heartbeat to detect hung jobs
 * - SIGUSR1 nudge after 60s stall, kill after 3 stalls
 * - 60-minute timeout per job
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JOB_MD = join(__dirname, "JOB.md");
const JOBS_FILE = join(__dirname, "data", "jobs.json");
const CLAUDE_CLI = "/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js";
const TICK_INTERVAL_MS = 30000;      // 30 seconds
const JOB_TIMEOUT_MS = 3600000;      // 60 minutes per job
const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
const STALL_THRESHOLD_MS = 60000;     // 60 seconds of no output = stuck
const MAX_STALLS = 3;                 // after 3 stalls, kill the job
const JOB_STAGGER_MS = 60000;          // 60 seconds between job starts (to avoid rate limits)

// ============================================================================
// Types
// ============================================================================

interface Job {
  name: string;
  prompt: string;
  lastRun: number | null;
  lastStatus: "success" | "failed" | null;
  history: JobRun[];
  nextRun: number | null;
  running: boolean;
}

interface JobRun {
  timestamp: number;
  status: "success" | "failed" | "timeout";
  output: string;
  durationMs: number;
}

// ============================================================================
// Running Jobs Tracker (for heartbeat)
// ============================================================================

interface RunningJob {
  proc: ReturnType<typeof spawn>;
  job: Job;
  lastOutput: number;
  stallCount: number;
  timer: ReturnType<typeof setTimeout>;
}

const runningJobs = new Map<string, RunningJob>();

// Global heartbeat - check all running jobs every 30s
setInterval(() => {
  const now = Date.now();
  for (const [jobName, runner] of runningJobs) {
    const sinceLastOutput = now - runner.lastOutput;
    if (sinceLastOutput > STALL_THRESHOLD_MS) {
      runner.stallCount++;
      console.log(`[scheduler] Heartbeat: ${jobName} stalled (${runner.stallCount}x, ${Math.round(sinceLastOutput/1000)}s no output)`);

      if (runner.stallCount >= MAX_STALLS) {
        console.log(`[scheduler] ${jobName} stalled ${MAX_STALLS}x — killing`);
        try { runner.proc.kill("SIGTERM"); } catch { /* ignore */ }
        setTimeout(() => {
          try { runner.proc.kill("SIGKILL"); } catch { /* ignore */ }
        }, 3000);
      } else {
        // Nudge with SIGUSR1
        try { runner.proc.kill("SIGUSR1"); } catch { /* ignore */ }
        console.log(`[scheduler] Nudged ${jobName} with SIGUSR1`);
      }
    }
  }
}, HEARTBEAT_INTERVAL_MS);

// ============================================================================
// Job Parsing
// ============================================================================

function parseJobMd(markdown: string): { name: string; prompt: string }[] {
  const jobs: { name: string; prompt: string }[] = [];

  // Split by blank lines (each job is separated by \n\n)
  const sections = markdown.split(/\n\n+/);

  for (const section of sections) {
    // First line should be an H1
    const lines = section.split('\n');
    const h1Match = lines[0].match(/^#\s+(.+)$/);
    if (!h1Match) continue;

    const name = h1Match[1].trim();
    // Everything after the H1 is the prompt
    const prompt = lines.slice(1).join('\n').trim().replace(/^"/, '').replace(/"$/, '');

    if (name && prompt) {
      jobs.push({ name, prompt });
    }
  }

  return jobs;
}

// ============================================================================
// State Persistence
// ============================================================================

function ensureDataDir(): void {
  const dataDir = join(__dirname, "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

function loadJobs(): Job[] {
  ensureDataDir();
  if (!existsSync(JOBS_FILE)) return [];

  try {
    const raw = readFileSync(JOBS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveJobs(jobs: Job[]): void {
  ensureDataDir();
  writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
}

// Sync job list from JOB.md (add new jobs, preserve history for existing)
function syncJobsFromMd(): Job[] {
  const jobs = loadJobs();
  const mdJobs = parseJobMd(readFileSync(JOB_MD, "utf-8"));

  // Build map of existing jobs by name
  const existingMap = new Map(jobs.map((j) => [j.name, j]));

  // Merge: keep history for existing jobs, add new jobs
  const merged: Job[] = [];
  for (const mdJob of mdJobs) {
    const existing = existingMap.get(mdJob.name);
    if (existing) {
      // Ensure new fields exist on loaded jobs
      existing.running = existing.running || false;
      existing.nextRun = existing.nextRun ?? null;
      existing.prompt = mdJob.prompt; // update prompt from md
      merged.push(existing);
      existingMap.delete(mdJob.name);
    } else {
      merged.push({
        name: mdJob.name,
        prompt: mdJob.prompt,
        lastRun: null,
        lastStatus: null,
        history: [],
        nextRun: null,
        running: false,
      });
    }
  }

  // Add any jobs from state file that are no longer in JOB.md (keep for history)
  for (const leftover of existingMap.values()) {
    merged.push({
      name: leftover.name,
      prompt: leftover.prompt,
      lastRun: leftover.lastRun,
      lastStatus: leftover.lastStatus,
      history: leftover.history,
      nextRun: leftover.nextRun,
      running: leftover.running,
    });
  }

  saveJobs(merged);
  return merged;
}

// ============================================================================
// Job Execution
// ============================================================================

async function runJob(job: Job, timeoutMs: number = JOB_TIMEOUT_MS): Promise<{ success: boolean; output: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    console.log(`[scheduler] Running job: ${job.name}`);
    console.log(`[scheduler] Prompt: ${job.prompt.slice(0, 80)}...`);
    console.log(`[scheduler] Timeout: ${timeoutMs}ms`);

    const startTime = Date.now();
    let timedOut = false;

    const proc = spawn(
      "bun",
      [
        "run", "--bun", CLAUDE_CLI,
        "--print",
        `--dangerously-skip-permissions`,
        job.prompt
      ],
      {
        cwd: process.env.CLAUDE_CWD || "/app",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
        shell: false,
      }
    );

    let stdout = "";
    let stderr = "";
    const lastOutput = Date.now();

    // Register for heartbeat monitoring
    runningJobs.set(job.name, {
      proc,
      job,
      lastOutput,
      stallCount: 0,
      timer: null as unknown as ReturnType<typeof setTimeout>
    });

    const timer = setTimeout(() => {
      timedOut = true;
      console.log(`[scheduler] Job "${job.name}" timed out after ${timeoutMs}ms`);
      proc.kill("SIGTERM");
      setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch { /* ignore */ }
      }, 5000);
    }, timeoutMs);
    runningJobs.get(job.name)!.timer = timer;

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      const entry = runningJobs.get(job.name);
      if (entry) entry.lastOutput = Date.now();
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      const entry = runningJobs.get(job.name);
      if (entry) entry.lastOutput = Date.now();
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      runningJobs.delete(job.name);
      const elapsed = Date.now() - startTime;
      const success = code === 0 && !timedOut;
      const output = stdout.trim().slice(0, 2000) || stderr.trim().slice(0, 2000);

      console.log(`[scheduler] Job "${job.name}" ${timedOut ? "timed out" : (success ? "succeeded" : "failed")} in ${elapsed}ms`);

      resolve({ success: success && !timedOut, output: timedOut ? "TIMEOUT" : (output || (success ? "OK" : `exit ${code}`)), timedOut });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      runningJobs.delete(job.name);
      resolve({ success: false, output: `spawn error: ${err.message}`, timedOut: false });
    });
  });
}

// ============================================================================
// Scheduler Loop
// ============================================================================

async function tick(): Promise<void> {
  const jobs = syncJobsFromMd();
  const now = Date.now();

  // Collect all due jobs that aren't currently running
  const dueJobs = jobs.filter(job => !job.running && (job.nextRun === null || now >= job.nextRun));

  if (dueJobs.length === 0) {
    return;
  }

  console.log(`[scheduler] ${dueJobs.length} job(s) due — launching with ${JOB_STAGGER_MS/1000}s stagger`);

  // Launch all due jobs in parallel, but stagger the starts by JOB_STAGGER_MS
  const promises = dueJobs.map(async (job, index) => {
    // Stagger start times: job 0 starts at 0s, job 1 at 60s, job 2 at 120s, etc.
    const staggerDelay = index * JOB_STAGGER_MS;
    if (staggerDelay > 0) {
      console.log(`[scheduler] Delaying ${job.name} by ${staggerDelay/1000}s (position ${index+1}/${dueJobs.length})`);
      await new Promise(resolve => setTimeout(resolve, staggerDelay));
    }

    // Mark as running immediately
    job.running = true;
    job.nextRun = now + JOB_TIMEOUT_MS;
    saveJobs(jobs);

    console.log(`[scheduler] Starting: ${job.name}`);

    // Execute job with 60 minute timeout
    const result = await runJob(job, JOB_TIMEOUT_MS);

    // Record result
    job.history.push({
      timestamp: now,
      status: result.timedOut ? "timeout" : (result.success ? "success" : "failed"),
      output: result.output.slice(0, 1000),
      durationMs: result.timedOut ? JOB_TIMEOUT_MS : (Date.now() - now),
    });
    job.lastStatus = result.timedOut ? "timeout" : (result.success ? "success" : "failed");
    job.lastRun = now;
    job.running = false;

    saveJobs(jobs);
    console.log(`[scheduler] Completed: ${job.name} (${result.timedOut ? "timeout" : result.success ? "success" : "failed"})`);
  });

  // Wait for all jobs to complete in parallel
  await Promise.all(promises);

  console.log(`[scheduler] All due jobs finished`);
}

// ============================================================================
// CLI Commands
// ============================================================================

function listJobs(): void {
  const mdJobs = parseJobMd(readFileSync(JOB_MD, "utf-8"));
  const jobs = loadJobs();

  console.log("\n=== Jobs from JOB.md ===");
  for (const job of mdJobs) {
    const state = jobs.find((j) => j.name === job.name);
    const lastRun = state?.lastRun
      ? new Date(state.lastRun).toISOString()
      : "never";
    const status = state?.lastStatus || "pending";
    console.log(`  [${status}] ${job.name} (last: ${lastRun})`);
    console.log(`    Prompt: ${job.prompt.slice(0, 60)}...`);
  }

  console.log("\n=== State file jobs (no longer in JOB.md) ===");
  for (const j of jobs) {
    if (!mdJobs.find((m) => m.name === j.name)) {
      console.log(`  [${j.lastStatus || "unknown"}] ${j.name}`);
    }
  }
}

function showStatus(): void {
  const jobs = loadJobs();
  console.log("\n=== Job Status ===");
  for (const job of jobs) {
    const lastRun = job.lastRun ? new Date(job.lastRun).toISOString() : "never";
    console.log(`  [${job.lastStatus || "pending"}] ${job.name} (running: ${job.running})`);
    console.log(`    last run: ${lastRun}`);
    console.log(`    history: ${job.history.length} run(s)`);
    if (job.history.length > 0) {
      const last = job.history[job.history.length - 1];
      console.log(`    last output: ${last.output.slice(0, 80)}...`);
    }
  }
  console.log(`\n=== Running Jobs (heartbeat) ===`);
  for (const [name] of runningJobs) {
    console.log(`  [ACTIVE] ${name}`);
  }
}

async function runJobNow(jobName: string): Promise<void> {
  const jobs = syncJobsFromMd();
  const job = jobs.find((j) => j.name === jobName);

  if (!job) {
    console.error(`Job not found: ${jobName}`);
    console.error("Run 'list' to see available jobs.");
    return;
  }

  if (job.running) {
    console.log(`Job "${jobName}" is already running.`);
    return;
  }

  job.running = true;
  job.nextRun = Date.now() + JOB_TIMEOUT_MS;
  saveJobs(jobs);

  const result = await runJob(job, JOB_TIMEOUT_MS);

  job.history.push({
    timestamp: Date.now(),
    status: result.timedOut ? "timeout" : (result.success ? "success" : "failed"),
    output: result.output.slice(0, 1000),
    durationMs: result.timedOut ? JOB_TIMEOUT_MS : (Date.now() - Date.now()),
  });
  job.lastStatus = result.timedOut ? "timeout" : (result.success ? "success" : "failed");
  job.lastRun = Date.now();
  job.running = false;
  saveJobs(jobs);

  console.log(`\nResult: ${result.timedOut ? "TIMEOUT" : (result.success ? "SUCCESS" : "FAILED")}`);
  console.log(`Output: ${result.output.slice(0, 500)}`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const cmd = process.argv[2];

  if (!existsSync(JOB_MD)) {
    console.error(`JOB.md not found at ${JOB_MD}`);
    console.error("Create JOB.md with H1 headings for each job.");
    process.exit(1);
  }

  switch (cmd) {
    case "list":
      listJobs();
      break;

    case "status":
      showStatus();
      break;

    case "run": {
      const jobName = process.argv[3];
      if (!jobName) {
        console.error("Usage: run <jobname>");
        process.exit(1);
      }
      await runJobNow(jobName);
      break;
    }

    case "start":
    case undefined:
      console.log(`[scheduler] Starting scheduler (PID ${process.pid})`);
      console.log(`[scheduler] Watching ${JOB_MD}`);
      console.log(`[scheduler] Tick interval: ${TICK_INTERVAL_MS}ms`);
      console.log(`[scheduler] Job timeout: ${JOB_TIMEOUT_MS}ms (60 min)`);
      console.log(`[scheduler] Heartbeat: every ${HEARTBEAT_INTERVAL_MS}ms, stall after ${STALL_THRESHOLD_MS}ms, kill after ${MAX_STALLS} stalls`);
      console.log(`[scheduler] If job finishes early, next run fires immediately`);

      // Main loop
      while (true) {
        await tick();
        await new Promise((resolve) => setTimeout(resolve, TICK_INTERVAL_MS));
      }

    default:
      console.log("Usage: bun-scheduler.ts [start|stop|status|run|list]");
      console.log("  list   - list all jobs from JOB.md");
      console.log("  status - show job statuses and running jobs");
      console.log("  run <jobname> - run a specific job immediately");
      console.log("  start  - run the scheduler loop (default)");
  }
}

main().catch((e) => {
  console.error(`[scheduler] Fatal: ${e.message}`);
  process.exit(1);
});