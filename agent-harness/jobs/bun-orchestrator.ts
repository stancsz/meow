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
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, watch, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runLeanAgent } from "../agent-kernel/src/core/lean-agent.ts";
import { getSkillContext } from "../src/sidecars/skill-manager.ts";
import { distillJobToSkill } from "../src/sidecars/skill-distiller.ts";
import { consolidateJobMemories } from "../src/sidecars/memory-consolidator.ts";
import { searchMemory, formatSearchResults, storeMemory } from "../agent-kernel/src/sidecars/memory-fts";
import { GovernanceEngine } from "../src/sidecars/governance-engine.ts";

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
const HUMAN_MD = join(__dirname, "..", "HUMAN.md");
const JOBS_FILE = join(__dirname, "..", "data", "orchestrator.json");
const EVOLVE_DIR = join(__dirname, "..", "evolve");
const DOGFOOD_DIR = join(__dirname, "..", "dogfood");
const DESIGN_DIR = join(__dirname, "..", "design");
const SCRATCH_DIR = join(__dirname, "..", "scratch");

// Meow CLI entry point
const MEOW_CLI = join(__dirname, "..", "agent-kernel", "cli", "index.ts");

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
  lastActiveTime: number;       // Timestamp of last real (non-thinking) output
  consecutiveThinkingCount: number;  // Count of consecutive thinking spinner lines
  buffer: string;
  isStalled: boolean;
}

// ============================================================================
// Orchestrator Engine
// ============================================================================

class Orchestrator {
  private jobs: Job[] = [];
  private workers = new Map<string, WorkerState>();
  private tickInterval: number = parseInt(process.env.ORCHESTRATOR_TICK_MS || "5000");
  private gov: GovernanceEngine;

  constructor() {
    this.gov = new GovernanceEngine(join(__dirname, "..", ".."));
    this.ensureDataDir();
    this.loadState();
    this.watchForHumanSignal();
  }

  /**
   * Watch for changes in HUMAN.md and JOB.md.
   * This is our "Broadcasting" system to the agents.
   */
  private watchForHumanSignal() {
    const filesToWatch = [JOB_MD, HUMAN_MD];
    for (const file of filesToWatch) {
      if (existsSync(file)) {
        console.log(`[orchestrator] 👂 Listening for human pulse on ${file}`);
        watch(file, (event) => {
          if (event === "change") {
            console.log(`[orchestrator] 💓 Signal detected in ${file}. Pulsing planning cycle...`);
            this.syncJobsFromMd();
            this.plan(); // Immediate trigger
          }
        });
      }
    }
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

  private async broadcast(event: string, data: any) {
    try {
      await fetch("http://localhost:3001/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, data })
      });
    } catch (e) {
      // Server might not be running
    }
  }

  // Track consecutive planning cycles with no decisions
  private consecutiveNoDecisionCount = 0;

  /**
   * Build a dense summary of the system state for the Commander
   */
  private buildSystemSnapshot(): string {
    const snapshot: string[] = ["## SYSTEM SNAPSHOT"];
    
    // 1. Health Summary (Only show at-risk jobs)
    const healthyJobs: string[] = [];
    const atRiskJobs: string[] = [];
    for (const job of this.jobs) {
      if (job.history.length === 0) continue;
      const failures = job.history.filter(h => h.exitCode !== 0).length;
      const successRate = ((job.history.length - failures) / job.history.length * 100);
      if (successRate < 70) atRiskJobs.push(`${job.name} (${successRate.toFixed(0)}%)`);
      else healthyJobs.push(job.name);
    }
    snapshot.push(`- **Health**: ${atRiskJobs.length > 0 ? `⚠️ At Risk: ${atRiskJobs.join(", ")}` : "✅ All jobs healthy"}`);

    // 2. Freshness Summary (One-liner)
    const now = Date.now();
    const staleThreshold = 3 * 60 * 60 * 1000;
    const dirs = [
      { path: join(EVOLVE_DIR, "research"), name: "EVOLVE" },
      { path: join(DOGFOOD_DIR, "validation"), name: "DOGFOOD" }
    ];
    const staleList = dirs.filter(d => {
      try {
        const files = readdirSync(d.path).filter(f => !f.startsWith("."));
        const newest = files.reduce((max, f) => Math.max(max, statSync(join(d.path, f)).mtimeMs), 0);
        return (now - newest) > staleThreshold;
      } catch { return true; }
    }).map(d => d.name);
    snapshot.push(`- **Freshness**: ${staleList.length > 0 ? `⚠️ Stale: ${staleList.join(", ")}` : "✅ Output directories fresh"}`);

    // 3. Gap Analysis (Top 3 only)
    const gaps = this.getGapAnalysis();
    if (gaps) snapshot.push(gaps);

    return snapshot.join("\n");
  }

  /**
   * Get gap analysis from validation files (concise)
   */
  private getGapAnalysis(): string {
    const validationDir = join(DOGFOOD_DIR, "validation");
    if (!existsSync(validationDir)) return "";

    const gaps: string[] = [];
    try {
      const files = (readdirSync(validationDir) as string[]).filter(f => f.endsWith(".json")).sort().reverse();
      for (const file of files.slice(0, 3)) { // Only top 3 latest failures
        const val = JSON.parse(readFileSync(join(validationDir, file), "utf-8"));
        if (val.status === "NOT_IMPLEMENTED" || val.status === "FAIL") {
          gaps.push(`- ${file}: ${val.verdict?.slice(0, 60)}... (Fix: ${val.exact_fix?.slice(0, 50)})`);
        }
      }
    } catch {}

    return gaps.length > 0 ? `### Active Gaps\n${gaps.join("\n")}` : "";
  }

  /**
   * Commander Agent - decides what to work on next
   */
  private async plan(): Promise<void> {
    console.log("[orchestrator] Commander Agent planning...");

    // Build enhanced context about current state - all wrapped to prevent cascading errors
    let epochStatus = "";
    let systemSnapshot = "";
    let skillContext = "";
    let memoryContext = "";

    try {
      epochStatus = this.checkEpochGates();
      systemSnapshot = this.buildSystemSnapshot();
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

    try {
      skillContext = getSkillContext(process.env.MEOW_CWD || "/app");
    } catch (e) {
      console.error("[orchestrator] Error getting skill context:", e);
    }

    // Load human feedback
    let humanFeedback = "";
    try {
      if (existsSync(HUMAN_MD)) {
        humanFeedback = "\n## HUMAN FEEDBACK\n" + readFileSync(HUMAN_MD, "utf-8");
      }
    } catch (e) {
      console.error("[orchestrator] Error reading HUMAN.md:", e);
    }

    // Recall recent memories related to current goals (may fail if memory store not initialized)
    try {
      const relevantMemories = searchMemory("current goals architecture preferences", 5);
      memoryContext = relevantMemories.length > 0 ? "\n## RECALLED FROM PALACE\n" + formatSearchResults(relevantMemories) : "";
    } catch (e) {
      memoryContext = "";
    }

    const safeEpochStatus = epochStatus || "";
    const safeMemoryContext = memoryContext || "";
    const safeSystemSnapshot = systemSnapshot || "";
    const safeSkillContext = skillContext || "";
    const safeHumanFeedback = humanFeedback || "";

    const commanderSystemPrompt = [
      "You are Embers, the Orchestrator. Maintain the 4-phase DISCOVER->PLAN->BUILD->DOGFOOD loop.",
      "",
      "## CRITICAL: HUMAN FEEDBACK (P0 OVERRIDE) - FOLLOW THIS FIRST",
      "You MUST prioritize the instructions in HUMAN FEEDBACK over any autonomous goal.",
      "If the human wants a pivot, ABORT current autonomous missions and execute the pivot.",
      safeHumanFeedback,
      "",
      "## SYSTEM STATUS",
      safeEpochStatus,
      safeMemoryContext,
      safeSystemSnapshot,
      safeSkillContext,
      "",
      "## SACRED CORE (PROTECTED FILES)",
      "- DO NOT BUILD files in 'The Sacred Core' (JOB.md, bun-orchestrator.ts, relay.ts) without isolated simulation tests in the PLAN.",
      "",
      "## MISSION RULES",
      "1. DISCOVER: Find ideas (browsing/logs).",
      "2. PLAN: Choose ONE idea, write architecture.md & validation.test.ts.",
      "3. BUILD: Implement code to pass validation.test.ts.",
      "4. DOGFOOD: Run tests. If pass -> loop. If fail -> FIX.",
      "",
      "Strictly ONE goal per mission. Prioritize local fix goals over new research.",
      "",
      "## Decision Format",
      'Respond with JSON:',
      '{',
      '  "reasoning": "...",',
      '  "decisions": [',
      '    { "type": "RUN", "job": "DISCOVER|PLAN|BUILD|DOGFOOD", "briefing": "..." },',
      '    { "type": "IDLE", "job": "...", "reason": "..." }',
      '  ]',
      '}'
    ].join("\n");

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
      lastActiveTime: Date.now(),
      consecutiveThinkingCount: 0,
      buffer: "",
      isStalled: false
    };

    this.workers.set(job.name, state);

    proc.stdout?.on("data", async (chunk: Buffer) => {
      const str = chunk.toString();
      state.buffer += str;
      state.lastOutput = Date.now();

      // Broadcast to Dashboard
      this.broadcast("mission_log", { 
        job: job.name, 
        msg: str, 
        type: str.includes(">>>") ? "system" : "info" 
      });

      // Count spinner characters
      const spinnerCount = (str.match(/[⠏⠼⠴⠦⠧⠇⠙⠸⠹⠷]/g) || []).length;
      const hasSpinner = spinnerCount > 0;

      // Strip ANSI and spinners to check for real content
      const stripped = str.replace(/\x1b\[[0-9;]*m/g, "").replace(/[⠏⠼⠴⠦⠧⠇⠙⠸⠹⠷]/g, "").trim();
      const hasRealContent = stripped.length > 0;

      // Only count thinking if it's ONLY spinner characters (no real content)
      if (hasSpinner && !hasRealContent) {
        state.consecutiveThinkingCount += spinnerCount;
      } else if (hasRealContent) {
        state.consecutiveThinkingCount = 0;
        state.lastActiveTime = Date.now();
      }

      process.stdout.write(`[${job.name}] ${str}`);
      this.handleInteractivePrompts(state);
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      const str = chunk.toString();
      state.lastOutput = Date.now();
      // stderr is meaningful output - reset thinking counter
      state.consecutiveThinkingCount = 0;
      state.lastActiveTime = Date.now();
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

  private async handleInteractivePrompts(state: WorkerState) {
    const patterns = [
      { regex: /\[y\/n\]/i, tool: "generic_approval" },
      { regex: /\(y\/n\)/i, tool: "generic_approval" },
      { regex: /trust\/deny\/continue/i, tool: "shell_command" },
      { regex: /allow the tool to/i, tool: "filesystem_write" },
    ];

    for (const p of patterns) {
      if (p.regex.test(state.buffer.slice(-200))) {
        console.log(`[orchestrator] 🛡️ Governance Gate: checking permission for ${p.tool}...`);
        const approved = await this.gov.checkPermission(p.tool);
        
        if (approved) {
          console.log(`[orchestrator] ✅ Permission granted by human.`);
          state.proc.stdin?.write("y\n");
        } else {
          console.log(`[orchestrator] ❌ Permission denied by governance policy.`);
          state.proc.stdin?.write("n\n");
        }
        
        // Clear buffer so we don't repeat-match
        state.buffer = state.buffer.slice(0, -200);
      }
    }

    // 📖 VIRTUAL CONTEXT PAGING (Letta Style)
    // If buffer exceeds ~20k chars, summarize and compact to save context
    if (state.buffer.length > 20000) {
      console.log(`[orchestrator] 📟 Context Pressure detected for ${state.jobName} (${state.buffer.length} chars). Compacting...`);
      storeMemory(`${state.jobName}: Context Page`, state.buffer.slice(0, 10000), {
        source: "session",
        tags: ["context-paging"],
        importance: 2
      });
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
    const INACTIVITY_TIMEOUT = 300000;     // 5 min without real output = stuck
    const THINKING_THRESHOLD = 30;         // 30+ thinking spinners = reasoning exhaustion
    const THOUGHTFUL_OUTPUT_PATTERNS = [
      /\[\d+m/,           // ANSI color codes (real output)
      /^\s*(Reading|Compiling|Running|Executing|Tool call|Error|Result|Wrote|Created|Deleted|Modified)/m,
      /^(ok|FAIL|✓|✗|pass|fail)/m,
      /\btimestamp\b/i,
      /\bprocess\b|\bexit\b|\bsignal\b/i,
    ];
    const THINKING_PATTERNS = [/⠏|⠼|⠴|⠦|⠧|⠇|⠙|⠸|⠹|⠷|⠦|⠧|⠇|thinking\.\.\.|^thinking$/im];

    for (const [name, state] of this.workers) {
      const elapsed = now - state.lastOutput;
      const inactiveElapsed = now - state.lastActiveTime;

      // Check for reasoning exhaustion (too many thinking spinners)
      if (state.consecutiveThinkingCount >= THINKING_THRESHOLD) {
        console.log(`[orchestrator] Reasoning exhaustion detected for ${name} (${state.consecutiveThinkingCount} thinking spinners). Killing...`);
        state.proc.kill("SIGKILL");
        continue;
      }

      // Check for inactivity (no real output in 5 minutes)
      if (inactiveElapsed > INACTIVITY_TIMEOUT) {
        console.log(`[orchestrator] Inactivity timeout for ${name} (${inactiveElapsed}ms without real output). Killing...`);
        state.proc.kill("SIGKILL");
        continue;
      }

      // Original hang detection (3 min no output at all)
      if (elapsed > 180000) {
        console.log(`[orchestrator] Hang detected for ${name} (${elapsed}ms no output)`);
        if (!state.isStalled) {
          state.isStalled = true;
          state.proc.kill("SIGUSR1");
        } else if (elapsed > 300000) {
          console.log(`[orchestrator] Killing ${name} (stalled)`);
          state.proc.kill("SIGKILL");
        }
      }
    }
  }

  /**
   * Check if output line is "thinking" (spinner) vs real work
   */
  private isThinkingOutput(line: string): boolean {
    // Lines with spinner characters are thinking (even if mixed with ANSI codes)
    if (/[⠏⠼⠴⠦⠧⠇⠙⠸⠹⠷]/.test(line)) {
      // If line has spinner BUT also has meaningful content (non-ANSI, non-spinner text), it's mixed output
      // Strip ANSI codes and check if there's actual text beyond the spinner
      const stripped = line.replace(/\x1b\[[0-9;]*m/g, "").replace(/[⠏⠼⠴⠦⠧⠇⠙⠸⠹⠷]/g, "");
      if (stripped.trim().length > 0) {
        // Has meaningful text - this is NOT pure thinking, it's thinking + real output
        return false;
      }
      return true; // Spinner only or spinner + ANSI codes = pure thinking
    }
    // Pure "thinking..." lines without spinners
    if (/^\s*thinking[\.\.]*\s*$/i.test(line.trim())) return true;
    return false;
  }

  /**
   * Check if output line represents real work (not thinking)
   */
  private isRealWorkOutput(line: string): boolean {
    if (!line || !line.trim()) return false;
    // Strip ANSI and spinner characters to get to the actual text content
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, "").replace(/[⠏⠼⠴⠦⠧⠇⠙⠸⠹⠷]/g, "").trim();
    if (!stripped) return false;
    const patterns = [
      /\[\d+m/,           // ANSI color codes
      /^(Reading|Compiling|Running|Executing|Wrote|Created|Deleted|Modified|Error|Fatal)/,
      /^(ok|FAIL|✓|✗|pass|fail)/,
      /Tool call:/,
      /Result:/,
      /stdout|stderr/,
      /\$|<|>|\|/,        // Shell prompts/pipes that appear in real output
    ];
    return patterns.some(p => p.test(stripped));
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
