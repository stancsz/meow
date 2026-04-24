/**
 * bun-scheduler.ts - Bun-based job scheduler for agent-harness
 *
 * Parses JOB.md (H1 headings = job names, description below = job prompt),
 * runs Claude Code CLI for each job on a hourly schedule.
 *
 * Usage:
 *   bun run /app/bun-scheduler.ts [start|stop|status|run|list]
 *   bun run /app/bun-scheduler.ts       # run scheduler loop
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JOB_MD = join(__dirname, "JOB.md");
const JOBS_FILE = join(__dirname, "data", "jobs.json");
const CLAUDE_CLI = "/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js";
const TICK_INTERVAL_MS = 30000; // 30 seconds
const JOB_TIMEOUT_MS = 3600000; // 60 minutes per job

// ============================================================================
// Types
// ============================================================================

interface Job {
  name: string;
  prompt: string;
  lastRun: number | null;
  lastStatus: "success" | "failed" | null;
  history: JobRun[];
  nextRun: number | null; // timestamp when job is next due to run
  running: boolean;       // currently executing
}

interface JobRun {
  timestamp: number;
  status: "success" | "failed" | "timeout";
  output: string;
  durationMs: number;
}

// ============================================================================
// Job Parsing
// ============================================================================

function parseJobMd(markdown: string): { name: string; prompt: string }[] {
  const jobs: { name: string; prompt: string }[] = [];
  const h1Regex = /^# (.+)$/gm;
  let match;

  while ((match = h1Regex.exec(markdown)) !== null) {
    const name = match[1].trim();
    const start = match.index + match[0].length;
    const end = h1Regex.lastIndex;
    const content = markdown.slice(start, end).trim();

    // Find next H1 or end of file
    const nextH1Match = markdown.slice(end).match(/^# /m);
    const prompt = nextH1Match
      ? content.slice(0, content.lastIndexOf(`# ${nextH1Match[1]}`)).trim()
      : content.trim();

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
      ["run", "--bun", CLAUDE_CLI, "--continue", "--prompt", job.prompt],
      {
        cwd: process.env.CLAUDE_CWD || "/app",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
        shell: false,
      }
    );

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Timeout handler
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      console.log(`[scheduler] Job "${job.name}" timed out after ${timeoutMs}ms`);
      proc.kill("SIGTERM");
      // Give it 5 seconds to die gracefully, then kill
      setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch { /* already dead */ }
      }, 5000);
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timeoutTimer);
      const elapsed = Date.now() - startTime;
      const success = code === 0 && !timedOut;
      const output = stdout.trim().slice(0, 2000) || stderr.trim().slice(0, 2000);

      console.log(`[scheduler] Job "${job.name}" ${timedOut ? "timed out" : (success ? "succeeded" : "failed")} in ${elapsed}ms`);

      resolve({ success: success && !timedOut, output: timedOut ? "TIMEOUT" : (output || (success ? "OK" : `exit ${code}`)), timedOut });
    });

    proc.on("error", (err) => {
      clearTimeout(timeoutTimer);
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

  for (const job of jobs) {
    // Skip if currently running
    if (job.running) {
      continue;
    }

    // Determine if job is due
    const isDue = job.nextRun === null || now >= job.nextRun;

    if (!isDue) {
      continue;
    }

    // Mark as running and set next run to 60 minutes from now
    job.running = true;
    job.nextRun = now + JOB_TIMEOUT_MS;
    saveJobs(jobs);

    // Execute job with 60 minute timeout
    const result = await runJob(job, JOB_TIMEOUT_MS);

    // Record result
    job.history.push({
      timestamp: now,
      status: result.timedOut ? "timeout" : (result.success ? "success" : "failed"),
      output: result.output.slice(0, 1000),
      durationMs: result.timedOut ? JOB_TIMEOUT_MS : (now - job.lastRun!),
    });
    job.lastStatus = result.timedOut ? "timeout" : (result.success ? "success" : "failed");
    job.lastRun = now;
    job.running = false;

    // If job finished early (didn't use full hour), schedule next run sooner
    // But still enforce minimum 60 min between START times
    // nextRun already set to start + 60min, so we just ensure the gap is respected

    saveJobs(jobs);

    // Run next job immediately (don't wait for tick interval)
    // tick() will be called again in the loop for remaining due jobs
  }
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
    console.log(`  [${job.lastStatus || "pending"}] ${job.name}`);
    console.log(`    last run: ${lastRun}`);
    console.log(`    history: ${job.history.length} run(s)`);
    if (job.history.length > 0) {
      const last = job.history[job.history.length - 1];
      console.log(`    last output: ${last.output.slice(0, 80)}...`);
    }
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

  const result = await runJob(job, JOB_TIMEOUT_MS);

  job.history.push({
    timestamp: Date.now(),
    status: result.timedOut ? "timeout" : (result.success ? "success" : "failed"),
    output: result.output.slice(0, 1000),
    durationMs: result.timedOut ? JOB_TIMEOUT_MS : (Date.now() - (job.lastRun || Date.now())),
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
      console.log(`[scheduler] If job finishes early, next run fires immediately`);

      // Main loop
      while (true) {
        await tick();
        await new Promise((resolve) => setTimeout(resolve, TICK_INTERVAL_MS));
      }

    default:
      console.log("Usage: airflow-scheduler.ts [start|stop|status|run|list]");
      console.log("  list   - list all jobs from JOB.md");
      console.log("  status - show job statuses and last run times");
      console.log("  run <jobname> - run a specific job immediately");
      console.log("  start  - run the scheduler loop (default)");
  }
}

main().catch((e) => {
  console.error(`[scheduler] Fatal: ${e.message}`);
  process.exit(1);
});