#!/usr/bin/env bun
/**
 * bun-orchestrator.ts - Intelligent Agentic Job Orchestrator
 *
 * This refactors bun-scheduler from a simple loop into an agent-driven
 * mission manager. It parses JOB.md, uses an LLM to prioritize tasks,
 * and manages worker processes (Meow Agent Kernel) with autonomous execution.
 */

import { spawn, ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runLeanAgent } from "../../agent-kernel/src/core/lean-agent.ts";
import { getSkillContext } from "../src/sidecars/skill-manager.ts";
import { distillJobToSkill } from "../src/sidecars/skill-distiller.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Manual .env loader for Bun
const envPath = join(__dirname, "..", "..", ".env");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const [key, ...val] = line.split("=");
    if (key && val.length) process.env[key.trim()] = val.join("=").trim();
  }
}

const JOB_MD = join(__dirname, "..", "JOB.md");
const JOBS_FILE = join(__dirname, "..", "data", "orchestrator.json");

// Meow CLI entry point
const MEOW_CLI = join(__dirname, "..", "..", "agent-kernel", "cli", "index.ts");
console.log(`[orchestrator] Using MEOW_CLI: ${MEOW_CLI}`);

const MEOW_RUN = join(__dirname, "..", "src", "meow-run.ts");

// Ensure API Key is set for the Planner Agent
if (!process.env.LLM_API_KEY) {
  process.env.LLM_API_KEY = process.env.ANTHROPIC_API_KEY;
}

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
  briefing?: string; // Strategic directions from the Commander
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
      const h1Match = line.match(/^# (.+?)(?:\s+\[.+\])?$/);
      if (h1Match) {
        if (currentJob) mdJobs.push(currentJob);
        currentJob = { name: h1Match[1].trim(), prompt: "" };
      } else if (currentJob) {
        currentJob.prompt += line + "\n";
      }
    }
    if (currentJob) mdJobs.push(currentJob);

    // Merge with existing state
    // Reset "running" jobs to "pending" on restart (orphaned from crashed session)
    for (const md of mdJobs) {
      const existing = this.jobs.find(j => j.name === md.name);
      if (existing) {
        existing.prompt = md.prompt.trim();
        // If job was running but worker is gone (orphaned), reset to pending
        if (existing.status === "running" && !this.workers.has(existing.name)) {
          console.log(`[orchestrator] Resetting orphaned job "${existing.name}" from running→pending`);
          existing.status = "pending";
          existing.history.push({
            timestamp: new Date().toISOString(),
            exitCode: -1,
            duration: 0,
            note: "Orphaned - worker not found on sync"
          });
        }
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
    this.writeJobsToMd(); // Synchronize badges back to Markdown
  }

  private writeJobsToMd() {
    let content = "";
    for (const job of this.jobs) {
      const badge = 
        job.status === "running" ? " [RUNNING 🛰️]" :
        job.status === "completed" ? " [DONE ✅]" :
        job.status === "failed" ? " [FAILED ❌]" :
        job.status === "blocked" ? " [BLOCKED 🛑]" : "";
      
      content += `# ${job.name}${badge}\n${job.prompt}\n\n`;
    }
    writeFileSync(JOB_MD, content.trim() + "\n");
  }

  /**
   * Use an LLM Agent to decide what to do next based on JOB.md and status.
   */
  private async plan(): Promise<void> {
    console.log("[orchestrator] Agent planning session starting...");

    // Send FULL JOB DESCRIPTIONS to the agent so it knows WHAT each job is.
    const jobsSummary = this.jobs.map(j => {
      return `## ${j.name}\nStatus: ${j.status}\nPrompt: ${j.prompt}\nPriority: ${j.priority}\nLast Run: ${j.lastRun || "Never"}`;
    }).join("\n\n---\n\n");

    // Include available skills to avoid reinventing the wheel
    const skillContext = getSkillContext(process.env.MEOW_CWD || "/app");

    const prompt = `You are the Mission Commander (Embers). 
Current Missions defined in JOB.md:
---
${jobsSummary}
---

${skillContext}

Your goal is to decide which jobs to START or ABORT, and provide STRATEGIC DIRECTIONS for each.
Don't just repeat the prompt. Think like a lead engineer. Tell the agent:
1. What the high-level goal is.
2. What specific skills they should use (from the list above).
3. Any pitfalls to avoid from previous failed runs.

Respond with a JSON block:
{
  "actions": [
    { 
      "type": "START", 
      "job": "Job Name", 
      "briefing": "strategic directions to the agent... talk to them like a technical lead." 
    },
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
            if (job && job.status !== "running") {
              job.briefing = action.briefing; // Store the strategic direction
              await this.startWorker(job);
            }
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

    const fullPrompt = job.briefing 
      ? `MISSION BRIEFING FROM COMMANDER:\n${job.briefing}\n\nGOAL:\n${job.prompt}`
      : job.prompt;

    const proc = spawn("bun", [
      "run", MEOW_CLI,
      "--auto",
      "--dangerous",
      "--mcp-config", join(__dirname, "..", "mcp-bridge.json"),
      "--",
      fullPrompt
    ], {
      cwd: process.env.MEOW_CWD || join(__dirname, ".."),
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
      shell: process.platform === "win32"
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
      const str = chunk.toString();
      state.lastOutput = Date.now();
      console.error(`[${job.name}:err] ${str}`);
      // Also add to buffer so the distiller can see errors if needed
      state.buffer += str;
    });

    proc.on("close", async (code) => {
      console.log(`[orchestrator] Worker ${job.name} exited with code ${code}`);
      this.workers.delete(job.name);
      job.status = code === 0 ? "completed" : "failed";
      job.history.push({
        timestamp: new Date().toISOString(),
        exitCode: code,
        duration: Date.now() - state.startedAt
      });
      
      // Autonomous Skill Distillation
      if (code === 0) {
        try {
          const result = await distillJobToSkill(
            job.name,
            job.prompt,
            state.buffer,
            process.env.MEOW_CWD || "/app"
          );
          if (result.success) {
            console.log(`[orchestrator] 💎 Skill Distilled: ${result.skillName}`);
          }
        } catch (e) {
          console.error("[orchestrator] Distillation failed:", e);
        }
      }

      this.saveState();
      // writeJobsToMd disabled - JOB.md is mounted read-only in docker
      // this.writeJobsToMd();
    });
  }

  private handleInteractivePrompts(state: WorkerState, latestOutput: string) {
    // Meow in --auto --dangerous mode is fully autonomous and doesn't prompt for tool use.
    // However, if it ever needs to prompt for manual input (e.g. workspace trust), 
    // we can add patterns here.
    const patterns = [
      /\[y\/n\]/i,
      /\(y\/n\)/i,
      /trust/i
    ];

    for (const pattern of patterns) {
      if (pattern.test(latestOutput)) {
        console.log(`[orchestrator] Interaction requested by Meow for ${state.jobName}: "${latestOutput.trim()}"`);
        // Strategy: Auto-approve trust/permissions for headless operation
        state.proc.stdin?.write("y\n");
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
      this.writeJobsToMd(); // Keep JOB.md in sync
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
