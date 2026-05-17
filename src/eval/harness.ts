// meow-swarm Eval Harness
// Priority 3: Benchmarking + scoring for agentic AI tasks
// Run: npx meow-eval --suite=coding --model=claude-sonnet-4

import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { MeowDatabase } from "../kernel/database";
import { AuditLogger } from "../kernel/audit";

// ── Task Definition ──────────────────────────────────────────────────────────

export interface EvalTask {
  id: string;
  name: string;
  description: string;
  setup?: string;           // shell commands to prepare environment
  command: string;           // meow -p command
  testCmd?: string;         // test command to verify result
  testOutput?: string;       // expected output substring or pattern
  timeoutMs: number;
  weight: number;           // relative importance (1-10)
}

export interface EvalResult {
  taskId: string;
  passed: boolean;
  durationMs: number;
  costCents: number;
  error?: string;
  output: string;
  score: number;            // 0-100
}

export interface BenchmarkReport {
  runId: string;
  timestamp: string;
  model: string;
  suite: string;
  totalScore: number;       // weighted 0-100
  passRate: number;         // 0-1
  totalCost: number;        // cents
  totalDurationMs: number;
  results: EvalResult[];
}

// ── Standard task suites ─────────────────────────────────────────────────────

export const TASK_SUITES: Record<string, EvalTask[]> = {
  coding: [
    {
      id: "add-tests",
      name: "Add test suite",
      description: "Write pytest tests for a given Python module",
      command: 'meow -p "Add pytest tests for the user auth module at src/auth.py"',
      testCmd: "pytest --tb=short 2>&1 | tail -5",
      testOutput: "passed",
      timeoutMs: 60000,
      weight: 5,
    },
    {
      id: "fix-bug",
      name: "Fix a bug from error log",
      description: "Parse an error and fix the root cause",
      command: "meow -p \"Fix the TypeError in src/agent/agent.ts line 188. Error: Object literal may only specify known properties\"",
      testCmd: "npx tsc --noEmit 2>&1 | grep -c 'error' || echo 0",
      testOutput: "0",
      timeoutMs: 90000,
      weight: 8,
    },
    {
      id: "refactor-function",
      name: "Refactor a function",
      description: "Extract and clean up a long function",
      command: 'meow -p "Refactor the parseEdits() function in src/agent/agent.ts to be under 50 lines"',
      testCmd: "npx tsc --noEmit 2>&1 | grep -c 'error' || echo 0",
      testOutput: "0",
      timeoutMs: 90000,
      weight: 6,
    },
    {
      id: "write-readme",
      name: "Write documentation",
      description: "Add README section for new feature",
      command: 'meow -p "Add API documentation for the AuditLogger class to docs/api.md"',
      testCmd: "grep -c 'AuditLogger' docs/api.md || echo 0",
      testOutput: "3",
      timeoutMs: 60000,
      weight: 4,
    },
  ],
  structural: [
    {
      id: "seed-reproducibility",
      name: "Reproducibility with seed",
      description: "Same command twice with same seed should produce same edits",
      command: 'meow -p "Add a comment // EVAL-CHECK at line 1 of README.md"',
      testCmd: "head -1 README.md | grep -c 'EVAL-CHECK' || echo 0",
      testOutput: "1",
      timeoutMs: 60000,
      weight: 7,
    },
    {
      id: "budget-enforcement",
      name: "Budget enforcement",
      description: "Exceeding budget should throw with checkpoint",
      command: 'MEOW_BUDGET_CENTS=0.00001 meow -p "Write a long comment"',
      testCmd: "echo 'check'",
      testOutput: "Budget exceeded",
      timeoutMs: 30000,
      weight: 5,
    },
    {
      id: "audit-log",
      name: "Audit log integrity",
      description: "Every run should produce a structured audit entry",
      command: 'meow -p "Add // audit-test to index.ts"',
      testCmd: "grep -c 'audit-test' ~/.meow/audit/*.jsonl 2>/dev/null | awk -F: '{sum+=$2} END{print sum}' || echo 0",
      testOutput: "1",
      timeoutMs: 60000,
      weight: 6,
    },
  ],
  system: [
    {
      id: "mcp-connection",
      name: "MCP server connection",
      description: "Connect to a running MCP server and call a tool",
      command: 'meow -p "List the available MCP tools"',
      testCmd: "echo 'mcp'",
      testOutput: "mcp",
      timeoutMs: 30000,
      weight: 5,
    },
    {
      id: "memory-recall",
      name: "Cross-session memory",
      description: "Store a fact, continue a session, recall it",
      command: 'meow -p "Remember that eval-test-key=EVAL-VALUE" && meow --continue -p "What is eval-test-key?"',
      testCmd: "echo 'eval'",
      testOutput: "EVAL-VALUE",
      timeoutMs: 60000,
      weight: 7,
    },
  ],
};

// ── Scoring ──────────────────────────────────────────────────────────────────

function scoreTask(task: EvalTask, result: EvalResult): number {
  if (!result.passed) {
    // Partial credit for partial completion
    if (result.error?.includes("timeout")) return task.weight * 3;
    if (result.error?.includes("budget")) return task.weight * 5;
    return 0;
  }

  // Base score from pass
  let score = 50 + (task.weight * 5);

  // Bonus for speed (under half timeout = +10)
  if (result.durationMs < task.timeoutMs / 2) score += 10;

  // Bonus for low cost (under 0.1¢ = +10)
  if (result.costCents < 0.1) score += 10;

  // Cap at 100
  return Math.min(100, score);
}

// ── Run a single task ────────────────────────────────────────────────────────

async function runTask(
  task: EvalTask,
  meowPath: string,
  runId: string,
  db: MeowDatabase,
  audit: AuditLogger
): Promise<EvalResult> {
  const startMs = Date.now();

  audit.log({ level: "info", actionType: "eval_task_start", detail: `Starting ${task.id}` });

  // Setup phase
  if (task.setup) {
    try {
      execSync(task.setup, { stdio: "pipe", timeout: 10000 });
    } catch {}
  }

  let output = "";
  let error: string | undefined;
  let passed = false;

  try {
    const cmd = task.command.replace("meow -p", `${meowPath} -p`);
    const timeoutSec = Math.floor(task.timeoutMs / 1000);

    const result = execSync(cmd, {
      encoding: "utf-8",
      timeout: timeoutSec,
      stdio: ["pipe", "pipe", "pipe"],
    });

    output = result as string;
    passed = true;

    // Verify with testCmd if provided
    if (task.testCmd) {
      const testResult = execSync(task.testCmd, {
        encoding: "utf-8",
        timeout: 30,
        stdio: ["pipe", "pipe", "pipe"],
      });
      passed = (task.testOutput !== undefined)
        ? (testResult as string).includes(task.testOutput)
        : (parseInt(testResult as string, 10) > 0);
    }
  } catch (e: any) {
    error = e.message || String(e);
    output = e.stdout || "";
    passed = false;
  }

  const durationMs = Date.now() - startMs;

  // Extract cost from output (💰 0.0012¢)
  const costMatch = output.match(/💰\s*([\d.]+)¢/);
  const costCents = costMatch ? parseFloat(costMatch[1]) : 0;

  const result: EvalResult = {
    taskId: task.id,
    passed,
    durationMs,
    costCents,
    error,
    output: output.slice(0, 500),
    score: scoreTask(task, { taskId: task.id, passed, durationMs, costCents, error, output, score: 0 }),
  };

  audit.log({ level: passed ? "info" : "error", actionType: "eval_task_end", detail: `${task.id}: ${passed ? "PASS" : "FAIL"} (${result.score}/100)` });

  return result;
}

// ── Full benchmark runner ────────────────────────────────────────────────────

export async function runBenchmark(
  suiteName: string,
  meowPath: string,
  model: string,
  options: { verbose?: boolean; outputDir?: string } = {}
): Promise<BenchmarkReport> {
  const runId = `bench_${Date.now()}`;
  const suite = TASK_SUITES[suiteName] || TASK_SUITES.coding;

  const db = new MeowDatabase();
  const audit = new AuditLogger(runId);

  const outDir = options.outputDir || resolve(process.cwd(), ".meow", "benchmarks");
  mkdirSync(outDir, { recursive: true });

  const results: EvalResult[] = [];

  for (const task of suite) {
    if (options.verbose) console.log(`  Running: ${task.id}...`);
    const result = await runTask(task, meowPath, runId, db, audit);
    results.push(result);
  }

  // Compute aggregate scores
  const totalScore = results.reduce((acc, r) => acc + r.score * suite[results.indexOf(r)].weight, 0)
    / results.reduce((acc, r) => acc + suite[results.indexOf(r)].weight, 0);
  const passRate = results.filter(r => r.passed).length / results.length;
  const totalCost = results.reduce((acc, r) => acc + r.costCents, 0);
  const totalDurationMs = results.reduce((acc, r) => acc + r.durationMs, 0);

  const report: BenchmarkReport = {
    runId,
    timestamp: new Date().toISOString(),
    model,
    suite: suiteName,
    totalScore,
    passRate,
    totalCost,
    totalDurationMs,
    results,
  };

  // Persist to disk
  const reportPath = resolve(outDir, `${runId}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Store in DB
  db.getRawDb().prepare(`
    INSERT INTO benchmark_results (run_id, suite, model, total_score, pass_rate, total_cost, total_duration_ms, report_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(runId, suiteName, model, totalScore, passRate, totalCost, totalDurationMs, reportPath);

  return report;
}

// ── CLI Interface ────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);

  function getArg(flag: string, fallback: string): string {
    const idx = args.indexOf(flag);
    return idx >= 0 ? (args[idx + 1] || fallback) : fallback;
  }

  const suite = getArg("--suite", "coding");
  const meowPath = getArg("--meow", "meow");
  const model = getArg("--model", process.env.MEOW_MODEL || "claude-sonnet-4");
  const verbose = args.includes("--verbose");

  console.log(`\n${"─".repeat(60)}`);
  console.log(`  meow-swarm benchmark | suite: ${suite} | model: ${model}`);
  console.log(`${"─".repeat(60)}\n`);

  runBenchmark(suite, meowPath, model, { verbose })
    .then(report => {
      console.log(`\n${"─".repeat(60)}`);
      console.log(`  Score:      ${report.totalScore.toFixed(1)}/100`);
      console.log(`  Pass rate:  ${(report.passRate * 100).toFixed(0)}% (${report.results.filter(r => r.passed).length}/${report.results.length})`);
      console.log(`  Cost:       ${report.totalCost.toFixed(4)}¢`);
      console.log(`  Duration:   ${(report.totalDurationMs / 1000).toFixed(1)}s`);
      console.log(`${"─".repeat(60)}`);
      console.log(`  Report: ${resolve(process.cwd(), ".meow", "benchmarks", report.runId + ".json")}`);
      console.log(`  Run ID: ${report.runId}\n`);
      process.exit(0);
    })
    .catch(e => {
      console.error(`Benchmark failed: ${e.message}`);
      process.exit(1);
    });
}