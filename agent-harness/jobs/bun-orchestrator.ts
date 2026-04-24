#!/usr/bin/env bun
/**
 * bun-orchestrator.ts - Continuous Improvement Orchestrator
 *
 * Redesigned as a continuous improvement engine:
 * - Jobs are NEVER done - they loop back smarter
 * - Commander Agent decides priorities dynamically
 * - Each run produces learnings that improve the next run
 *
 * Job lifecycle: IDLE → RUNNING → IMPROVED → IDLE (loop)
 */

import { spawn, ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runLeanAgent } from "/app/agent-kernel/src/core/lean-agent.ts";
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
const EVOLVE_DIR = join(__dirname, "..", "evolve");
const DOGFOOD_DIR = join(__dirname, "..", "dogfood");
const DESIGN_DIR = join(__dirname, "..", "design");
const SCRATCH_DIR = join(__dirname, "..", "scratch");

// Meow CLI entry point
const MEOW_CLI = join(__dirname, "..", "..", "agent-kernel", "cli", "index.ts");

// Ensure API Key is set for the Planner Agent
if (!process.env.LLM_API_KEY) {
  process.env.LLM_API_KEY = process.env.ANTHROPIC_API_KEY;
}

// ============================================================================
// Types
// ============================================================================

type JobStatus = "idle" | "running" | "improved" | "blocked";

interface Job {
  name: string;
  prompt: string;
  status: JobStatus;
  lastRun: string | null;
  lastImproved: string | null;
  history: Array<{
    timestamp: string;
    exitCode: number | null;
    duration: number;
    learnings?: string;
  }>;
  briefing?: string; // Strategic directions from the Commander
  iteration: number;
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
  private tickInterval: number = 30000; // 30 seconds between planning cycles

  constructor() {
    this.ensureDataDir();
    this.loadState();
  }

  private ensureDataDir() {
    const dataDir = join(__dirname, "..", "data");
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  }

  /**
   * Check epoch gates - determine if EVOLVE can proceed to next epoch
   * based on DOGFOOD validation status.
   */
  private checkEpochGates(): string {
    const validationDir = join(DOGFOOD_DIR, "validation");
    const evolveEpochDir = join(EVOLVE_DIR, "epoch");

    let status = "No epoch history yet.";

    // Check for latest epoch promise
    if (existsSync(evolveEpochDir)) {
      const epochs = (readdirSync(evolveEpochDir) as string[])
        .filter(f => f.startsWith("epoch-"))
        .sort()
        .reverse();

      if (epochs.length > 0) {
        const latestEpoch = epochs[0];
        const promiseFile = join(evolveEpochDir, latestEpoch, "promise.md");

        // Check for validation file for this epoch
        let validationStatus = "NOT_VALIDATED";
        if (existsSync(validationDir)) {
          const validations = (readdirSync(validationDir) as string[])
            .filter(f => f.startsWith(latestEpoch.replace("epoch-", "")));

          if (validations.length > 0) {
            const latestValidation = validations.sort().reverse()[0];
            try {
              const validation = JSON.parse(
                readFileSync(join(validationDir, latestValidation), "utf-8")
              );
              validationStatus = validation.status || "UNKNOWN";
            } catch {}
          }
        }

        const canProceed = validationStatus === "VALIDATED";
        status = `Epoch ${latestEpoch}: ${validationStatus}\nCan EVOLVE proceed: ${canProceed ? "YES ✅" : "NO ❌ (DOGFOOD must validate first)"}`;
      }
    }

    return status;
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

    const mdJobs: { name: string; prompt: string }[] = [];
    const lines = content.split("\n");
    let currentJob: { name: string; prompt: string } | null = null;

    for (const line of lines) {
      // Only match H1 (single # followed by space), not H2+ (## etc)
      const h1Match = line.match(/^#\s+(.+?)(?:\s*\[.+\])?\s*$/);
      if (h1Match) {
        if (currentJob) mdJobs.push(currentJob);
        currentJob = { name: h1Match[1].trim(), prompt: "" };
      } else if (currentJob) {
        currentJob.prompt += line + "\n";
      }
    }
    if (currentJob) mdJobs.push(currentJob);

    // Build a map of existing job state (history, iteration, etc.) to preserve
    const existingState = new Map<string, Partial<Job>>();
    for (const job of this.jobs) {
      existingState.set(job.name, {
        history: job.history,
        iteration: job.iteration,
        lastRun: job.lastRun,
        lastImproved: job.lastImproved,
      });
    }

    // Rebuild jobs list from JOB.md ONLY - it's the source of truth
    this.jobs = [];
    for (const md of mdJobs) {
      const prev = existingState.get(md.name);
      this.jobs.push({
        name: md.name,
        prompt: md.prompt.trim(),
        status: "idle", // Always start idle, let Commander decide
        lastRun: prev?.lastRun || null,
        lastImproved: prev?.lastImproved || null,
        history: prev?.history || [],
        iteration: prev?.iteration || 0,
      });
      console.log(`[orchestrator] Synced capability loop: ${md.name}`);
    }
    this.saveState();
  }

  /**
   * Commander Agent - decides what to work on next
   */
  private async plan(): Promise<void> {
    console.log("[orchestrator] Commander Agent planning...");

    // Build context about current state
    const epochStatus = this.checkEpochGates();
    const jobsSummary = this.jobs.map(j => {
      const recentLearnings = j.history.slice(-2).map(h => h.learnings).filter(Boolean).join("; ") || "None yet";
      return `## ${j.name}
Status: ${j.status} (iteration ${j.iteration})
Last Run: ${j.lastRun || "Never"}
Recent Learnings: ${recentLearnings}`;
    }).join("\n\n---\n\n");

    const skillContext = getSkillContext(process.env.MEOW_CWD || "/app");

    const prompt = `You are the Commander Agent (Embers). Your role is to orchestrate capability evolution with STRICT EPOCH GATES.

## EPOCH GATE STATUS
${epochStatus}

## Current Capability Loops
${jobsSummary}

${skillContext}

## STRICT EPOCH GATE RULES

1. **EVOLVE cannot start new epoch** unless DOGFOOD validates the previous epoch's promise
2. **DOGFOOD must validate** the exact test cases in the promise file
3. **DESIGN only prototypes** capabilities that are VALIDATED by DOGFOOD
4. **No sloppy implementations** - if DOGFOOD finds something broken, EVOLVE must wait until fixed

## Decision Rules

### THE QUALITY GATE (STRICT)
- **NO SLOPS**: If an implementation is "sloppy" (untested, partially broken), DOGFOOD must fix it before EVOLVE can proceed.
- **EPOCH SEQUENCING**: Every EVOLVE run MUST be followed by a DOGFOOD validation.
- **MEOWJU IDENTITY**: All autonomous commits must use the identity 'meowju'.

Max 2 concurrent jobs.`;

    try {
      const result = await runLeanAgent(prompt, { maxIterations: 1 });
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[0]);
        console.log(`[orchestrator] Commander reasoning: ${plan.reasoning || "No reasoning provided"}`);

        // First, mark all jobs not in the RUN list as idle
        const runJobs = new Set((plan.decisions || []).filter((d: any) => d.type === "RUN").map((d: any) => d.job));

        for (const job of this.jobs) {
          const isInRunList = runJobs.has(job.name) ||
            runJobs.has(job.name.split(":")[0]) || // "EVOLVE" matches "EVOLVE: Research..."
            Array.from(runJobs).some(r => job.name.toLowerCase().includes(r.toLowerCase()));
          if (!isInRunList) {
            const decision = plan.decisions?.find((d: any) =>
              d.job === job.name ||
              job.name.startsWith(d.job + ":") ||
              job.name.toLowerCase().includes(d.job.toLowerCase())
            );
            if (decision && decision.type === "IDLE" && job.status !== "idle") {
              console.log(`[orchestrator] ${job.name} → IDLE (${decision.reason})`);
              job.status = "idle";
            }
          }
        }

        // Execute RUN decisions
        console.log(`[orchestrator] Commander decisions: ${JSON.stringify(plan.decisions)}`);
        for (const action of plan.decisions || []) {
          if (action.type === "RUN") {
            // Fuzzy match: exact, starts with, or contains
            const job = this.jobs.find(j =>
              j.name === action.job ||
              j.name.startsWith(action.job + ":") ||
              j.name.toLowerCase().includes(action.job.toLowerCase())
            );
            if (job && job.status !== "running") {
              console.log(`[orchestrator] Starting ${job.name}`);
              job.briefing = action.briefing;
              await this.startWorker(job);
            } else if (!job) {
              console.log(`[orchestrator] Job not found: "${action.job}"`);
            }
          }
        }

        this.saveState();
      }
    } catch (e) {
      console.error("[orchestrator] Commander Agent failed:", e);
      // Fallback: run the first idle job
      const next = this.jobs.find(j => j.status === "idle" || j.status === "improved");
      if (next && this.workers.size < 2) {
        console.log(`[orchestrator] Fallback: running ${next.name}`);
        await this.startWorker(next);
      }
    }
  }

  private getExistingOutputs(): string {
    const outputs: string[] = [];

    // EVOLVE research
    const evolveResearch = join(EVOLVE_DIR, "research");
    if (existsSync(evolveResearch)) {
      try {
        const files = (readdirSync(evolveResearch) as string[]).filter(f => f.endsWith(".md"));
        if (files.length > 0) {
          outputs.push(`EVOLVE research docs: ${files.length} existing (${files.slice(0, 3).join(", ")}...)`);
        }
      } catch {}
    }

    // DOGFOOD results
    const dogfoodResults = join(DOGFOOD_DIR, "results");
    if (existsSync(dogfoodResults)) {
      try {
        const files = (readdirSync(dogfoodResults) as string[]).filter(f => f.endsWith(".json"));
        if (files.length > 0) {
          outputs.push(`DOGFOOD test results: ${files.length} existing`);
        }
      } catch {}
    }

    // DESIGN proposals
    const designProposals = join(DESIGN_DIR, "proposals");
    if (existsSync(designProposals)) {
      try {
        const files = (readdirSync(designProposals) as string[]).filter(f => f.endsWith(".md"));
        if (files.length > 0) {
          outputs.push(`DESIGN proposals: ${files.length} existing (${files.slice(0, 3).join(", ")}...)`);
        }
      } catch {}
    }

    return outputs.length > 0 ? outputs.join("\n") : "No existing outputs yet - all loops are fresh";
  }

  private abortWorker(jobName: string, reason: string) {
    const worker = this.workers.get(jobName);
    if (worker) {
      console.log(`[orchestrator] ABORTING ${jobName}: ${reason}`);
      worker.proc.kill("SIGTERM");
    }
  }

  private async startWorker(job: Job) {
    if (this.workers.has(job.name)) return;
    if (job.status === "blocked") {
      console.log(`[orchestrator] ${job.name} is blocked, skipping`);
      return;
    }

    job.iteration++;
    job.status = "running";
    job.lastRun = new Date().toISOString();
    console.log(`[orchestrator] Starting ${job.name} (iteration ${job.iteration})`);
    this.saveState();

    // Build the prompt with briefing and iteration context
    const iterationContext = job.history.length > 0
      ? `\n\n## Previous Iterations\n${job.history.slice(-2).map((h, i) =>
          `Iteration ${job.iteration - job.history.length + i + 1}:
- Exit Code: ${h.exitCode}
- Duration: ${h.duration}ms
- Learnings: ${h.learnings || "None documented"}`
        ).join("\n\n")}`
      : "";

    const fullPrompt = job.briefing
      ? `## Commander Briefing\n${job.briefing}\n\n## Mission\n${job.prompt}${iterationContext}`
      : `${job.prompt}${iterationContext}`;

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
      state.buffer += str;
    });

    proc.on("close", async (code) => {
      const duration = Date.now() - state.startedAt;
      console.log(`[orchestrator] ${job.name} exited with code ${code} (${duration}ms)`);
      this.workers.delete(job.name);

      // Extract learnings from the run
      const learnings = this.extractLearnings(state.buffer, code);

      job.history.push({
        timestamp: new Date().toISOString(),
        exitCode: code,
        duration,
        learnings
      });

      if (code === 0) {
        job.status = "improved";
        job.lastImproved = new Date().toISOString();

        // Attempt to distill skill
        try {
          const result = await distillJobToSkill(
            job.name,
            job.prompt,
            state.buffer,
            process.env.MEOW_CWD || "/app"
          );
          if (result.success) {
            console.log(`[orchestrator] 💎 Skill distilled: ${result.skillName}`);
          }
        } catch (e) {
          console.error("[orchestrator] Skill distillation failed:", e);
        }

        console.log(`[orchestrator] ${job.name} → IMPROVED (${learnings || "Learnings extracted"})`);
      } else {
        // Failed - check if it's worth retrying
        if (job.iteration >= 3) {
          job.status = "blocked";
          console.log(`[orchestrator] ${job.name} → BLOCKED (failed ${job.iteration} times)`);
        } else {
          job.status = "idle";
          console.log(`[orchestrator] ${job.name} → IDLE (will retry, iteration ${job.iteration})`);
        }
      }

      this.saveState();
    });
  }

  private extractLearnings(buffer: string, exitCode: number | null): string {
    // Try to extract key learnings from the output
    // Look for summary patterns, "Learned:", "Key insight:", etc.
    const patterns = [
      /(?:Learned|Key insight|Key finding|Summary)[:\s]+([^\n]+(?:\n(?![A-Z][a-z]+:)[\s\S]*)?)/gi,
      /(?:Created|Generated|Wrote)[:\s]+([^\n]+)/gi,
      /(?:Fixed|Resolved|Solved)[:\s]+([^\n]+)/gi,
    ];

    const learnings: string[] = [];

    for (const pattern of patterns) {
      const matches = buffer.matchAll(pattern);
      for (const match of matches) {
        const finding = match[1]?.trim().slice(0, 100);
        if (finding && !learnings.includes(finding)) {
          learnings.push(finding);
        }
      }
    }

    if (learnings.length > 0) {
      return learnings.slice(0, 3).join("; ");
    }

    if (exitCode === 0) {
      return "Completed successfully - no specific learnings extracted";
    }

    return "Run failed - check logs for details";
  }

  private handleInteractivePrompts(state: WorkerState, latestOutput: string) {
    const patterns = [/\[y\/n\]/i, /\(y\/n\)/i, /trust/i, /proceed\?/i];
    for (const pattern of patterns) {
      if (pattern.test(latestOutput)) {
        console.log(`[orchestrator] Auto-approving for ${state.jobName}`);
        state.proc.stdin?.write("y\n");
        state.buffer = "";
        break;
      }
    }
  }

  public async start() {
    console.log("[orchestrator] Continuous Improvement Engine starting...");
    console.log("[orchestrator] Three loops: EVOLVE | DOGFOOD | DESIGN");
    this.syncJobsFromMd();

    // Main loop - never stops
    while (true) {
      this.syncJobsFromMd();
      await this.plan();
      this.monitorWorkers();
      await new Promise(r => setTimeout(r, this.tickInterval));
    }
  }

  private monitorWorkers() {
    const now = Date.now();
    for (const [name, state] of this.workers) {
      const elapsed = now - state.lastOutput;
      if (elapsed > 180000) { // 3 min hang
        console.log(`[orchestrator] Hang detected for ${name} (${elapsed}ms no output)`);
        if (!state.isStalled) {
          state.isStalled = true;
          state.proc.kill("SIGUSR1");
        } else if (elapsed > 300000) { // 5 min flat-line
          console.log(`[orchestrator] Killing ${name} (stalled)`);
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
