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
import { getSkillContext } from "/app/src/sidecars/skill-manager.ts";
import { distillJobToSkill } from "/app/src/sidecars/skill-distiller.ts";
import { consolidateJobMemories } from "/app/src/sidecars/memory-consolidator.ts";
import { searchMemory, formatSearchResults, storeMemory } from "/app/agent-kernel/src/sidecars/memory-fts";

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
    error?: string; // Failure diagnostics
  }>;
  briefing?: string; // Strategic directions from the Commander
  iteration: number;
  lastError: string | null; // Captured from failure log
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
  private tickInterval: number = parseInt(process.env.ORCHESTRATOR_TICK_MS || "5000"); // Default 5 seconds between planning cycles

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
      // Directories are "1", "2", "10", "11" not "epoch-1", "epoch-2" etc
      const epochs = (readdirSync(evolveEpochDir) as string[])
        .filter(f => /^\d+$/.test(f))  // Only numeric directory names
        .map(f => parseInt(f, 10))
        .filter(n => !isNaN(n) && n > 0)
        .sort((a, b) => b - a);  // Descending numeric sort

      if (epochs.length > 0) {
        const latestEpochNum = epochs[0];
        const latestEpoch = String(latestEpochNum);
        const promiseFile = join(evolveEpochDir, latestEpoch, "promise.md");

        // Check for validation file for this epoch
        let validationStatus = "NOT_VALIDATED";
        if (existsSync(validationDir)) {
          const validations = (readdirSync(validationDir) as string[])
            .filter(f => f.startsWith(`epoch-${latestEpochNum}-`) || f === `epoch-${latestEpochNum}.json`);

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

  // Track consecutive planning cycles with no decisions
  private consecutiveNoDecisionCount = 0;

  /**
   * Build health metrics from job histories
   */
  private buildHealthMetrics(): string {
    const lines: string[] = ["## Health Metrics"];
    for (const job of this.jobs) {
      const total = job.history.length;
      if (total === 0) {
        lines.push(`- **${job.name}**: No history yet`);
        continue;
      }
      const failures = job.history.filter(h => h.exitCode !== 0).length;
      const successRate = total > 0 ? ((total - failures) / total * 100).toFixed(0) : 100;
      const avgDuration = total > 0
        ? Math.round(job.history.reduce((sum, h) => sum + h.duration, 0) / total)
        : 0;

      // Find recurring errors
      const errorCounts = new Map<string, number>();
      for (const h of job.history) {
        if (h.learnings && (h.learnings.includes("Error") || h.learnings.includes("Failed"))) {
          const words = h.learnings.split(" ").slice(0, 5).join(" ");
          errorCounts.set(words, (errorCounts.get(words) || 0) + 1);
        }
      }
      const recurringErrors = Array.from(errorCounts.entries())
        .filter(([_, count]) => count >= 2)
        .map(([err]) => err);

      lines.push(`- **${job.name}**: ${successRate}% success (${total} runs), avg ${avgDuration}ms${recurringErrors.length > 0 ? `, RECURRING: ${recurringErrors.slice(0, 2).join(", ")}` : ""}`);
    }
    return lines.join("\n");
  }

  /**
   * Check if output directories are producing fresh content
   */
  private checkOutputFreshness(): string {
    const now = Date.now();
    const staleThreshold = 3 * 60 * 60 * 1000; // 3 hours
    const lines: string[] = ["## Output Freshness"];

    const dirs: { path: string; name: string }[] = [
      { path: join(EVOLVE_DIR, "research"), name: "EVOLVE research" },
      { path: join(DOGFOOD_DIR, "validation"), name: "DOGFOOD validation" },
      { path: join(DESIGN_DIR, "proposals"), name: "DESIGN proposals" },
    ];

    for (const dir of dirs) {
      if (!existsSync(dir.path)) {
        lines.push(`- **${dir.name}**: Not present`);
        continue;
      }
      try {
        const files = (readdirSync(dir.path) as string[])
          .filter(f => !f.startsWith("."));

        // Get most recent file mtime
        let newest = 0;
        for (const entry of files) {
          try {
            const st = require("node:fs").statSync(join(dir.path, entry));
            newest = Math.max(newest, st.mtimeMs);
          } catch {}
        }

        const age = now - newest;
        const stale = age > staleThreshold;
        lines.push(`- **${dir.name}**: ${stale ? "⚠️ STALE" : "✓ Fresh"} (${files.length} files, last ${Math.round(age / 60000)}m ago)`);
      } catch (e) {
        lines.push(`- **${dir.name}**: Error checking - ${e}`);
      }
    }
    return lines.join("\n");
  }

  /**
   * Correlate errors across job histories to find root causes
   */
  private correlateErrors(): string {
    const errorPatterns = new Map<string, Set<string>>();

    for (const job of this.jobs) {
      for (const h of job.history) {
        if (h.learnings && h.learnings.includes("Error")) {
          // Extract error keywords
          const errors = ["ENOENT", "ReferenceError", "TypeError", "SyntaxError", "Module not found", "Cannot find", "timeout", "BLOCKED", "failed"];
          for (const err of errors) {
            if (h.learnings.includes(err)) {
              if (!errorPatterns.has(err)) errorPatterns.set(err, new Set());
              errorPatterns.get(err)!.add(job.name);
            }
          }
        }
      }
    }

    const lines: string[] = ["## Error Correlation (Root Causes)"];
    for (const [err, jobs] of errorPatterns) {
      if (jobs.size > 1) {
        lines.push(`- **${err}**: Affects ${Array.from(jobs).join(", ")}`);
      }
    }
    return lines.length > 1 ? lines.join("\n") : "";
  }

  /**
   * Get gap analysis from validation files
   */
  private getGapAnalysis(): string {
    const validationDir = join(DOGFOOD_DIR, "validation");
    if (!existsSync(validationDir)) return "";

    const lines: string[] = ["## Gap Analysis (from DOGFOOD validations)"];
    const notImplemented: Array<{file: string, verdict: string, exact_fix?: string, attempt_count?: number}> = [];

    try {
      const files = (readdirSync(validationDir) as string[]).filter(f => f.endsWith(".json") && !f.includes("RECONCILIATION"));
      for (const file of files.slice(-15)) {
        try {
          const content = readFileSync(join(validationDir, file), "utf-8");
          const val = JSON.parse(content);
          if (val.status === "NOT_IMPLEMENTED") {
            notImplemented.push({
              file,
              verdict: val.verdict?.slice(0, 100) || "see file",
              exact_fix: val.exact_fix,
              attempt_count: val.attempt_count || 0
            });
          }
        } catch {}
      }
    } catch {}

    if (notImplemented.length > 0) {
      lines.push("### NOT_IMPLEMENTED (EVOLVE must fix these)");
      for (const issue of notImplemented) {
        lines.push(`- ${issue.file}: ${issue.verdict}`);
        if (issue.exact_fix) {
          lines.push(`  EXACT FIX: ${issue.exact_fix}`);
        }
        if (issue.attempt_count > 0) {
          lines.push(`  Attempts: ${issue.attempt_count}`);
        }
      }
    } else {
      lines.push("- No NOT_IMPLEMENTED epochs found");
    }

    return lines.join("\n");
  }

  /**
   * Commander Agent - decides what to work on next
   */
  private async plan(): Promise<void> {
    console.log("[orchestrator] Commander Agent planning...");

    // Build enhanced context about current state
    const epochStatus = this.checkEpochGates();

    // Health metrics and gap analysis - wrap in try/catch to prevent cascading errors
    let healthMetrics = "";
    let outputFreshness = "";
    let errorCorrelation = "";
    let gapAnalysis = "";
    try {
      healthMetrics = this.buildHealthMetrics();
      outputFreshness = this.checkOutputFreshness();
      errorCorrelation = this.correlateErrors();
      gapAnalysis = this.getGapAnalysis();
    } catch (e) {
      console.error("[orchestrator] Error building context metrics:", e);
    }

    const jobsSummary = this.jobs.map(j => {
      const recentLearnings = j.history.slice(-2).map(h => h.learnings).filter(Boolean).join("; ") || "None yet";
      const errorContext = j.lastError ? `\nLAST ERROR: ${j.lastError}` : "";
      return `## ${j.name}
Status: ${j.status} (iteration ${j.iteration})
Last Run: ${j.lastRun || "Never"}
Recent Learnings: ${recentLearnings}${errorContext}`;
    }).join("\n\n---\n\n");

    const skillContext = getSkillContext(process.env.MEOW_CWD || "/app");

    // Recall recent memories related to current goals (may fail if memory store not initialized)
    let memoryContext = "";
    try {
      const relevantMemories = searchMemory("current goals architecture preferences", 5);
      memoryContext = relevantMemories.length > 0 ? "\n## RECALLED FROM PALACE\n" + formatSearchResults(relevantMemories) : "";
    } catch (e) {
      memoryContext = "";
    }

    const commanderSystemPrompt = `You are the Commander Agent (Embers). Your role is to orchestrate capability evolution with PROACTIVE IMPROVEMENT.

## Your Authority
You have SOLE AUTHORITY to decide which jobs run and in what priority.
You MUST respond with a JSON decision object - nothing else.

## EPOCH GATE STATUS
${epochStatus}

${memoryContext}

${healthMetrics}

${outputFreshness}

${errorCorrelation}

${gapAnalysis}

${skillContext}

## MISSION: 4-PHASE TEST-DRIVEN EVOLUTION

You are Embers, a strict orchestrator. Your loop is:
1. **DISCOVER**: Find ideas via MCP browsing (external) or reading internal error logs (internal).
2. **PLAN**: Choose ONE idea from DISCOVER, write architecture & validation tests (TDD). 
3. **BUILD**: Implement the code necessary to pass the tests generated in PLAN.
4. **DOGFOOD**: Run the tests. If they pass, loop to DISCOVER. If they fail, feed errors back to BUILD.

## Decision Rules

### CAUSAL SEQUENCE (STRICT TDD)
- Do not RUN **PLAN** unless **DISCOVER** has produced a backlog.
- Do not RUN **BUILD** unless **PLAN** has produced a `.test.ts` file and architecture spec.
- Do not RUN **DOGFOOD** unless **BUILD** has claimed implementation is complete.

### SELF-HEALING & QUALITY GATE
- If DOGFOOD reports a test failure, send the exact stack trace back to **BUILD** to fix it immediately.
- Max 2 concurrent jobs. Focus the agent.
- Fix broken internal systems (pain points) before researching external new features.

## Decision Format
Respond with JSON:
{
  "reasoning": "Why you made these decisions",
  "decisions": [
    { "type": "RUN", "job": "DISCOVER|PLAN|BUILD|DOGFOOD", "briefing": "Exact details of what to perform in this phase" },
    { "type": "IDLE", "job": "...", "reason": "Why waiting" }
  ]
}`;

    try {
      const result = await runLeanAgent("Analyze current status and decide next orchestration actions.", {
        maxIterations: 15,
        systemPrompt: commanderSystemPrompt,
        dangerous: true
      });
      console.log(`[orchestrator] Commander response (${result.content.length} chars): ${result.content.slice(0, 500)}`);
      // Strip markdown code fences if present
      const strippedContent = result.content.replace(/^```json\s*/m, "").replace(/\s*```$/m, "").trim();
      const jsonMatch = strippedContent.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[0]);
        console.log(`[orchestrator] Commander reasoning: ${plan.reasoning || "No reasoning provided"}`);

        // Extract decisions - support multiple formats
        let decisions = plan.decisions || plan.actions || plan.recommendations || [];

        // Handle nested decision format like { decision: { action: "START_EVOLVE", jobs: [...] } }
        if (!decisions || decisions.length === 0) {
          if (plan.decision?.action && plan.decision?.jobs) {
            decisions = plan.decision.jobs.map((j: any) => ({
              type: plan.decision.action.includes("RUN") || plan.decision.action.includes("START") ? "RUN" : "IDLE",
              job: j.name || j
            }));
            console.log(`[orchestrator] Detected decision.action format: ${plan.decision.action}`);
          }
        }

        // Fallback: if no structured decisions, scan raw content for job directives
        if (!decisions || decisions.length === 0) {
          const content = strippedContent;
          // Scan for patterns like "RUN: DOGFOOD", "EVOLVE should run", "Start EVOLVE", "DOGFOOD", "EVOLVE"
          const runPatterns = [
            /run[s]?\s+(EVOLVE|DOGFOOD|DESIGN)/gi,
            /start\s+(EVOLVE|DOGFOOD|DESIGN)/gi,
            /(EVOLVE|DOGFOOD|DESIGN)\s+should\s+run/gi,
            /(EVOLVE|DOGFOOD|DESIGN)\s+(next|now|now!)/gi,
          ];
          const idlePatterns = [
            /keep\s+(EVOLVE|DOGFOOD|DESIGN)\s+idle/gi,
            /(EVOLVE|DOGFOOD|DESIGN)\s+should\s+(wait|stay|idle)/gi,
          ];

          const runMatches = new Set<string>();
          for (const pattern of runPatterns) {
            const matches = content.matchAll(pattern);
            for (const match of matches) {
              const job = match[1]?.toUpperCase();
              if (job) runMatches.add(job);
            }
          }

          if (runMatches.size > 0) {
            decisions = Array.from(runMatches).map(job => ({ type: "RUN", job }));
            console.log(`[orchestrator] Fallback: detected RUN for ${Array.from(runMatches).join(", ")}`);
          }
        }

        // First, mark all jobs not in the RUN list as idle
        const runJobs = new Set((decisions).filter((d: any) => d.type === "RUN").map((d: any) => d.job));

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
        if (decisions.length === 0) {
          console.log(`[orchestrator] No RUN decisions found in Commander response - all jobs stay idle`);
          console.log(`[orchestrator] If this persists, check if Commander is making decisions or just reporting status`);
        }
        console.log(`[orchestrator] Commander decisions: ${JSON.stringify(decisions)}`);
        for (const action of decisions) {
          if (action.type === "RUN") {
            // Fuzzy match: exact, starts with, or contains
            const job = this.jobs.find(j =>
              j.name === action.job ||
              j.name.startsWith(action.job + ":") ||
              j.name.toLowerCase().includes(action.job.toLowerCase())
            );
            if (job && job.status !== "running") {
              console.log(`[orchestrator] Starting ${job.name}${action.type === "RUN" && action.briefing?.includes("FIX") ? " (FIX MODE)" : ""}`);
              
              if (action.type === "RUN" && action.briefing?.includes("FIX")) {
                job.status = "idle"; // Reset blocked status for fix attempts
                job.lastError = null; // Clear error to allow fix attempt
              }
              
              job.briefing = action.briefing;
              await this.startWorker(job);
            } else if (!job) {
              console.log(`[orchestrator] Job not found: "${action.job}"`);
            }
          }
        }

        // Track no-decision cycles
        if (decisions.length === 0) {
          this.consecutiveNoDecisionCount++;
          if (this.consecutiveNoDecisionCount >= 3) {
            console.log(`[orchestrator] ⚠️ ${this.consecutiveNoDecisionCount} cycles with no decisions - forcing DOGFOOD run`);
            const dogfood = this.jobs.find(j => j.name.includes("DOGFOOD") && j.status !== "running");
            if (dogfood && this.workers.size < 2) {
              console.log(`[orchestrator] Force-starting DOGFOOD after repeated no-decisions`);
              await this.startWorker(dogfood);
            }
          }
        } else {
          this.consecutiveNoDecisionCount = 0;
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
      env: { ...process.env, MEOW_TRUST_ALL: "1" },
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
      this.handleInteractivePrompts(state);
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      const str = chunk.toString();
      state.lastOutput = Date.now();
      console.error(`[${job.name}:err] ${str}`);
      state.buffer += str;
      this.handleInteractivePrompts(state);
    });

    proc.on("close", async (code) => {
      const duration = Date.now() - state.startedAt;
      console.log(`[orchestrator] ${job.name} exited with code ${code} (${duration}ms)`);
      this.workers.delete(job.name);

      // Extract learnings and errors
      const learnings = this.extractLearnings(state.buffer, code);
      const errorMsg = code !== 0 ? this.extractError(state.buffer) : null;

      job.history.push({
        timestamp: new Date().toISOString(),
        exitCode: code,
        duration,
        learnings,
        error: errorMsg || undefined
      });

      job.lastError = errorMsg;

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

      // 🧠 CROSS-SESSION MEMORY CONSOLIDATION
      try {
        const result = await consolidateJobMemories(
          job.name,
          job.prompt,
          state.buffer,
          code
        );
        if (result.success) {
          console.log(`[orchestrator] 🏰 Palace updated: ${result.message}`);
        }
      } catch (e) {
        console.error("[orchestrator] Memory consolidation failed:", e);
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

    return "Run failed - check logs for details";
  }

  private extractError(buffer: string): string {
    // Look for common error patterns
    const patterns = [
      /(?:Error|Exception|Fatal|Failure)[:\s]+([^\n]+(?:\n\s+at [^\n]+)*)/gi,
      /([A-Z][a-zA-Z]+Error: [^\n]+)/g,
      /TS\d+: [^\n]+/g, // TypeScript errors
      /Module not found: [^\n]+/gi,
      /ENOENT: [^\n]+/gi
    ];

    for (const pattern of patterns) {
      const match = buffer.match(pattern);
      if (match) return match[0].trim().slice(0, 500); // Capture first significant error chunk
    }

    // Fallback: last 3 lines
    const lines = buffer.trim().split("\n");
    return lines.slice(-3).join("\n").trim() || "Unknown runtime error";
  }

  private handleInteractivePrompts(state: WorkerState) {
    const patterns = [
      { regex: /\[y\/n\]/i, response: "y\n" },
      { regex: /\(y\/n\)/i, response: "y\n" },
      { regex: /trust\/deny\/continue/i, response: "trust\n" },
      { regex: /trust/i, response: "trust\n" },
      { regex: /proceed\?/i, response: "y\n" },
      { regex: /choice \(trust\/deny\/continue\)/i, response: "trust\n" },
      { regex: /continue\?/i, response: "y\n" },
      { regex: /allow the tool to/i, response: "y\n" },
      { regex: /run this command/i, response: "y\n" }
    ];

    for (const { regex, response } of patterns) {
      if (regex.test(state.buffer)) {
        console.log(`[orchestrator] Auto-approving for ${state.jobName} (pattern: ${regex.source})`);
        state.proc.stdin?.write(response);
        // Clear buffer so we don't double-trigger on the same prompt
        state.buffer = ""; 
        break;
      }
    }

    // 📖 VIRTUAL CONTEXT PAGING (Letta Style)
    // If buffer exceeds ~20k chars, summarize and compact to save context
    if (state.buffer.length > 20000) {
      console.log(`[orchestrator] 📟 Context Pressure detected for ${state.jobName} (${state.buffer.length} chars). Compacting...`);
      // We don't clear the whole buffer because the subprocess needs its history,
      // but we can "page" the high-level summary into long-term memory mid-run.
      storeMemory(`${state.jobName}: Context Page`, state.buffer.slice(0, 10000), {
        source: "session",
        tags: ["context-paging"],
        importance: 2
      });
      // Slide the window
      state.buffer = state.buffer.slice(10000);
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
