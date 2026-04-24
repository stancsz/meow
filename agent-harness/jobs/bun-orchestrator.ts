#!/usr/bin/env bun
/**
 * bun-orchestrator.ts - Intelligent Agentic Job Orchestrator
 *
 * This refactors bun-scheduler from a simple loop into an agent-driven
 * mission manager. It parses JOB.md, uses an LLM to prioritize tasks,
 * and manages worker processes (Claude Code) with interactive prompt handling.
 */

import { spawn, ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runLeanAgent } from "../../agent-kernel/src/core/lean-agent.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JOB_MD = join(__dirname, "JOB.md");
const JOBS_FILE = join(__dirname, "..", "data", "orchestrator.json");
const CLAUDE_CLI = "/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js";
const MEOW_RUN = join(__dirname, "..", "src", "meow-run.ts");

// ============================================================================
// Types
// ============================================================================

interface Job {
  name: string;
  prompt: string;
  status: "pending" | "running" | "blocked" | "completed" | "failed";
  lastRun: string | null;
  history: any[];
  priority: number;
}

interface WorkerState {
  proc: ChildProcess;
  jobName: string;
  startedAt: number;
  lastOutput: number;
  buffer: string;
  isStalled: boolean;
}

// ============================================================================
// Orchestrator Engine
// ============================================================================

class Orchestrator {
  private jobs: Job[] = [];
  private workers = new Map<string, WorkerState>();
  private pollInterval: number = 60000; // 1 minute

  constructor() {
    this.ensureDataDir();
    this.loadState();
  }

  private ensureDataDir() {
    const dataDir = join(__dirname, "data");
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  }

  private loadState() {
    if (existsSync(JOBS_FILE)) {
      try {
        const data = JSON.parse(readFileSync(JOBS_FILE, "utf-8"));
        this.jobs = data.jobs || [];
      } catch (e) {
        this.jobs = [];
      }
    }
    this.syncJobsFromMd();
  }

  private saveState() {
    writeFileSync(JOBS_FILE, JSON.stringify({ jobs: this.jobs }, null, 2));
  }

  private syncJobsFromMd() {
    if (!existsSync(JOB_MD)) return;
    const content = readFileSync(JOB_MD, "utf-8");
    const h1Regex = /^# (.+)$/gm;
    let match;
    const mdJobs: { name: string; prompt: string }[] = [];

    const lines = content.split("\n");
    let currentJob: { name: string; prompt: string } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const h1Match = line.match(/^# (.+)$/);
      if (h1Match) {
        if (currentJob) mdJobs.push(currentJob);
        currentJob = { name: h1Match[1].trim(), prompt: "" };
      } else if (currentJob) {
        currentJob.prompt += line + "\n";
      }
    }
    if (currentJob) mdJobs.push(currentJob);

    // Merge with existing state
    for (const md of mdJobs) {
      const existing = this.jobs.find(j => j.name === md.name);
      if (existing) {
        existing.prompt = md.prompt.trim();
      } else {
        this.jobs.push({
          name: md.name,
          prompt: md.prompt.trim(),
          status: "pending",
          lastRun: null,
          history: [],
          priority: 0
        });
      }
    }
    this.saveState();
  }

  /**
   * Use an LLM Agent to decide what to do next based on JOB.md and status.
   */
  private async plan(): Promise<void> {
    console.log("[orchestrator] Agent planning session starting...");

    const jobsSummary = this.jobs.map(j => `- ${j.name} (Status: ${j.status}, Priority: ${j.priority})`).join("\n");
    const prompt = `You are the Mission Orchestrator. 
Current Jobs:
${jobsSummary}

Your goal is to decide which jobs to START or ABORT.
We have ${this.workers.size} workers currently running. Max is 2.

Respond with a JSON block:
{
  "actions": [
    { "type": "START", "job": "Job Name" },
    { "type": "ABORT", "job": "Job Name", "reason": "why" }
  ]
}
Only recommend starting jobs that are 'pending' or 'failed'.`;

    try {
      const result = await runLeanAgent(prompt, { maxIterations: 1 });
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[0]);
        for (const action of plan.actions || []) {
          if (action.type === "START") {
            const job = this.jobs.find(j => j.name === action.job);
            if (job && job.status !== "running") await this.startWorker(job);
          } else if (action.type === "ABORT") {
            this.abortWorker(action.job, action.reason);
          }
        }
      }
    } catch (e) {
      console.error("[orchestrator] Planner Agent failed, using fallback heuristic:", e);
      // Fallback heuristic
      const next = this.jobs.find(j => j.status === "pending" || j.status === "failed");
      if (next && this.workers.size < 2) await this.startWorker(next);
    }
  }

  private abortWorker(jobName: string, reason: string) {
    const worker = this.workers.get(jobName);
    if (worker) {
      console.log(`[orchestrator] ABORTING ${jobName} per Agent plan: ${reason}`);
      worker.proc.kill("SIGTERM");
    }
  }

  private async startWorker(job: Job) {
    if (this.workers.has(job.name)) return;

    console.log(`[orchestrator] Starting worker for: ${job.name}`);
    job.status = "running";
    job.lastRun = new Date().toISOString();
    this.saveState();

    const proc = spawn("bun", [
      "run", "--bun", CLAUDE_CLI,
      "--print",
      "--dangerously-skip-permissions",
      "--",
      job.prompt
    ], {
      cwd: process.env.CLAUDE_CWD || "/app",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    const state: WorkerState = {
      proc,
      jobName: job.name,
      startedAt: Date.now(),
      lastOutput: Date.now(),
      buffer: "",
      isStalled: false
    };

    this.workers.set(job.name, state);

    proc.stdout?.on("data", (chunk: Buffer) => {
      const str = chunk.toString();
      state.buffer += str;
      state.lastOutput = Date.now();
      process.stdout.write(`[${job.name}] ${str}`);
      this.handleInteractivePrompts(state, str);
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      state.lastOutput = Date.now();
      process.stderr.write(`[${job.name}:err] ${chunk.toString()}`);
    });

    proc.on("close", (code) => {
      console.log(`[orchestrator] Worker ${job.name} exited with code ${code}`);
      this.workers.delete(job.name);
      job.status = code === 0 ? "completed" : "failed";
      job.history.push({
        timestamp: new Date().toISOString(),
        exitCode: code,
        duration: Date.now() - state.startedAt
      });
      this.saveState();
    });
  }

  private handleInteractivePrompts(state: WorkerState, latestOutput: string) {
    // Patterns for Claude Code interaction
    // Examples: "Allow tool use? [y/N]", "Proceed? (y/n)", etc.
    const patterns = [
      /\[y\/n\]/i,
      /\(y\/n\)/i,
      /\? \[y\/N\]/i,
      /Proceed\?/i,
      /Allow tool use\?/i
    ];

    for (const pattern of patterns) {
      if (pattern.test(latestOutput) || pattern.test(state.buffer.slice(-100))) {
        console.log(`[orchestrator] INT-MODE DETECTED for ${state.jobName}: "${latestOutput.trim()}"`);
        
        // Strategy: Auto-approve safe-looking tools
        // This is where a "Safety Agent" would decide.
        // For now, we auto-approve to keep it working.
        console.log(`[orchestrator] Auto-approving for ${state.jobName}`);
        state.proc.stdin?.write("y\n");
        state.buffer = ""; // Clear buffer after responding
        break;
      }
    }
  }

  public async start() {
    console.log("[orchestrator] Running...");
    this.syncJobsFromMd();
    
    // Main loop
    while (true) {
      this.syncJobsFromMd();
      await this.plan();
      this.monitorWorkers();
      await new Promise(r => setTimeout(r, 10000)); // Tick every 10s
    }
  }

  private monitorWorkers() {
    const now = Date.now();
    for (const [name, state] of this.workers) {
      const elapsed = now - state.lastOutput;
      if (elapsed > 180000) { // 3 minutes hang
        console.log(`[orchestrator] Job ${name} HANG DETECTED (${elapsed}ms no output)`);
        if (!state.isStalled) {
          state.isStalled = true;
          // Nudge
          state.proc.kill("SIGUSR1");
        } else if (elapsed > 300000) { // 5 minutes flat-line
          console.log(`[orchestrator] Terminating ${name}`);
          state.proc.kill("SIGKILL");
        }
      }
    }
  }
}

// ============================================================================
// Execution
// ============================================================================

const orchestrator = new Orchestrator();
orchestrator.start().catch(err => {
  console.error("[orchestrator] Fatal error:", err);
  process.exit(1);
});
