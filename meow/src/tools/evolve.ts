/**
 * evolve.ts — Antifragile Self-Evolving Gap-Closing Loop
 *
 * An OODA loop that continuously closes gaps between Meow CLI and Claude Code.
 * Every failure is learned from. Every success compounds.
 *
 * Reads from:
 *   docs/research/competitors/ — competitor research for gap context
 *   CLAUDE.md — project identity and architecture
 *   meow/TODO.md — current roadmap and priorities
 *   meow/tests/gaps.test.ts — gap identification
 *   meow/tests/gap-impl.test.ts — gap implementation tests
 *
 * Writes to (wisdom accumulation):
 *   dogfood/wisdom/failure-modes.jsonl — every failure, root cause, timestamp
 *   dogfood/wisdom/gap-difficulty.json — attempts-to-solve per gap
 *   dogfood/wisdom/solved-gaps.json — what worked, implementation notes
 *   dogfood/wisdom/attempt-log.jsonl — every attempt with gap, outcome, duration
 *   dogfood/blocked/ — permanently blocked gaps with reason
 *
 * Usage:
 *   bun run meow/src/tools/evolve.ts              # Run the full loop
 *   bun run meow/src/tools/evolve.ts --once      # Single iteration then exit
 *   bun run meow/src/tools/evolve.ts --status    # Print current state, no changes
 *   bun run meow/src/tools/evolve.ts --report     # Full wisdom report
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { execSync, exec } from "node:child_process";
import { fileURLToPath } from "node:url";

// ============================================================================
// Paths
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const DOGFOOD = join(ROOT, "dogfood");
const WISDOM_DIR = join(DOGFOOD, "wisdom");
const BLOCKED_DIR = join(DOGFOOD, "blocked");
const LOGS_DIR = join(DOGFOOD, "logs");
const TESTS_DIR = join(DOGFOOD, "tests");

const GAP_ANALYSIS_FILE = join(WISDOM_DIR, "gap-analysis.json");
const FAILURE_MODES_FILE = join(WISDOM_DIR, "failure-modes.jsonl");
const GAP_DIFFICULTY_FILE = join(WISDOM_DIR, "gap-difficulty.json");
const SOLVED_GAPS_FILE = join(WISDOM_DIR, "solved-gaps.json");
const ATTEMPT_LOG_FILE = join(WISDOM_DIR, "attempt-log.jsonl");
const BLOCKED_GAPS_FILE = join(BLOCKED_DIR, "blocked-gaps.jsonl");
const STATE_FILE = join(WISDOM_DIR, "state.json");

// ============================================================================
// Types
// ============================================================================

interface GapInfo {
  id: string;
  priority: string;
  category: string;
  description: string;
  status: "open" | "solving" | "solved" | "blocked";
  attempts: number;
  difficulty: number; // 1 = easy, 10 = hard
  lastAttempt?: string; // ISO timestamp
  rootCauses: string[]; // known failure patterns
  solutionNotes?: string;
}

interface WisdomState {
  iteration: number;
  currentGap: string | null;
  totalAttempts: number;
  totalFailures: number;
  totalSuccesses: number;
  sessionStart: string;
  lastIteration: string;
}

interface GapDifficultyMap {
  [gapId: string]: {
    score: number;
    attempts: number;
    status: "open" | "solving" | "solved" | "blocked";
    rootCauses: string[];
  };
}

interface SolvedGapsMap {
  [gapId: string]: {
    solvedAt: string;
    iteration: number;
    notes: string;
    approach: string;
  };
}

interface AttemptLog {
  gapId: string;
  iteration: number;
  attempt: number;
  outcome: "success" | "failure" | "blocked";
  rootCause?: string;
  timestamp: string;
  durationMs: number;
  dogfoodOutput?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function readJson<T>(path: string, fallback: T): T {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8"));
    }
  } catch {}
  return fallback;
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function appendJsonl(path: string, record: unknown): void {
  appendFileSync(path, JSON.stringify(record) + "\n");
}

function timestamp(): string {
  return new Date().toISOString();
}

function runCmd(cmd: string, cwd: string = ROOT): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execSync(cmd, { cwd, encoding: "utf-8", timeout: 120000, maxBuffer: 50 * 1024 * 1024 });
    return { stdout, stderr: "", code: 0 };
  } catch (e: any) {
    return { stdout: e.stdout || "", stderr: e.stderr || "", code: e.status || 1 };
  }
}

async function runCmdAsync(cmd: string, cwd: string = ROOT): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    exec(cmd, { cwd, encoding: "utf-8", timeout: 120000, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ stdout: stdout || "", stderr: stderr || "", code: err?.status || 0 });
    });
  });
}

// Invoke Claude Code CLI for a task
async function claudeTask(prompt: string, description: string, cwd: string = ROOT): Promise<string> {
  const safePrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  const cmd = `claude --dangerously-skip-permissions "${safePrompt}"`;
  console.log(`  🤖 [${description}]`);
  const result = await runCmdAsync(cmd, cwd);
  return result.stdout + result.stderr;
}

// ============================================================================
// Wisdom Persistence
// ============================================================================

function loadGapDifficulty(): GapDifficultyMap {
  return readJson<GapDifficultyMap>(GAP_DIFFICULTY_FILE, {});
}

function saveGapDifficulty(map: GapDifficultyMap): void {
  writeJson(GAP_DIFFICULTY_FILE, map);
}

function loadSolvedGaps(): SolvedGapsMap {
  return readJson<SolvedGapsMap>(SOLVED_GAPS_FILE, {});
}

function saveSolvedGaps(map: SolvedGapsMap): void {
  writeJson(SOLVED_GAPS_FILE, map);
}

function loadState(): WisdomState {
  const fallback: WisdomState = {
    iteration: 0,
    currentGap: null,
    totalAttempts: 0,
    totalFailures: 0,
    totalSuccesses: 0,
    sessionStart: timestamp(),
    lastIteration: timestamp(),
  };
  return readJson<WisdomState>(STATE_FILE, fallback);
}

function saveState(state: WisdomState): void {
  state.lastIteration = timestamp();
  writeJson(STATE_FILE, state);
}

function loadBlockedGaps(): Array<{ gapId: string; blockedAt: string; reason: string }> {
  const lines = existsSync(BLOCKED_GAPS_FILE)
    ? readFileSync(BLOCKED_GAPS_FILE, "utf-8").trim().split("\n").filter(Boolean)
    : [];
  return lines.map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function getOpenGaps(): Array<{ id: string; priority: string; category: string; description: string }> {
  // Run gaps.test.ts and parse output to find currently failing/unimplemented gaps
  const result = runCmd(`bun test tests/gaps.test.ts 2>&1`, ROOT);

  // Extract gap IDs from test output - look for test names with GAP- prefix
  const gapPattern = /GAP-[A-Z]+-\d+/g;
  const foundGaps = new Set<string>();
  const matches = result.stdout.match(gapPattern) || [];
  matches.forEach((m: string) => foundGaps.add(m));

  // Also read gaps.test.ts to get descriptions
  const gapsTestContent = existsSync(join(ROOT, "tests/gaps.test.ts"))
    ? readFileSync(join(ROOT, "tests/gaps.test.ts"), "utf-8")
    : "";

  const gaps: Array<{ id: string; priority: string; category: string; description: string }> = [];
  for (const gapId of foundGaps) {
    // Try to find description from gaps.test.ts
    const descPattern = new RegExp(`(${gapId}[^\\n]*desc:\\s*"([^"]+)")`);
    const descMatch = gapsTestContent.match(descPattern);
    const desc = descMatch ? descMatch[2] : gapId;

    // Determine priority from context
    let priority = "P2";
    if (gapId.includes("CORE") || gapId.includes("PERM") || gapId.includes("SESS")) priority = "P0-P1";
    else if (gapId.includes("TOOL") || gapId.includes("SLASH") || gapId.includes("ABORT")) priority = "P1";

    gaps.push({ id: gapId, priority, category: gapId.split("-")[1], description: desc });
  }

  return gaps;
}

// ============================================================================
// Gap Selection (Orient phase)
// ============================================================================

function pickBestGap(openGaps: Array<{ id: string; priority: string; category: string; description: string }>): string | null {
  const difficulty = loadGapDifficulty();
  const solved = loadSolvedGaps();
  const blocked = loadBlockedGaps();
  const blockedIds = new Set(blocked.map((b) => b.gapId));

  // Filter out solved and blocked
  const available = openGaps.filter((g) => !solved[g.id] && !blockedIds.has(g.id));

  if (available.length === 0) {
    return null; // All gaps solved or blocked
  }

  // Score each gap: lower difficulty + higher priority = picked first
  // Also factor in how many attempts historically (more attempts = harder = deprioritize)
  const scored = available.map((gap) => {
    const d = difficulty[gap.id] || { score: 5, attempts: 0, rootCauses: [] };
    const priorityScore = gap.priority === "P0" ? 0 : gap.priority === "P1" ? 1 : 2;
    // Penalize gaps with many failed attempts (they might be blocked or hard)
    const attemptPenalty = Math.min(d.attempts * 0.5, 5);
    const score = d.score + priorityScore + attemptPenalty;
    return { ...gap, computedScore: score };
  });

  // Sort by computed score (lower = pick first)
  scored.sort((a, b) => a.computedScore - b.computedScore);

  return scored[0]?.id || null;
}

// ============================================================================
// Core OODA Steps
// ============================================================================

async function observe(state: WisdomState): Promise<string> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🐱 OBSERVE — Iteration ${state.iteration + 1}`);
  console.log(`${"=".repeat(60)}`);

  ensureDir(WISDOM_DIR);
  ensureDir(LOGS_DIR);
  ensureDir(TESTS_DIR);

  // Run gap analysis
  const ts = Date.now();
  const gapOutputFile = join(TESTS_DIR, `gap-analysis-${ts}.txt`);
  const result = runCmd(`bun test tests/gaps.test.ts 2>&1`, ROOT);
  writeFileSync(gapOutputFile, result.stdout);
  console.log(`  📊 Gap analysis saved to ${relative(ROOT, gapOutputFile)}`);

  // Also run gap-impl tests to see what's already implemented
  const implResult = runCmd(`bun test tests/gap-impl.test.ts 2>&1`, ROOT);
  const implOutputFile = join(TESTS_DIR, `gap-impl-${ts}.txt`);
  writeFileSync(implOutputFile, implResult.stdout);
  console.log(`  🧪 Gap impl tests: ${implResult.stdout.includes("pass") || implResult.stdout.includes("✓") ? "✅ some passing" : "⚠️ check output"}`);

  // Return the gap analysis content for orient phase
  return result.stdout;
}

async function orient(state: WisdomState, gapAnalysis: string): Promise<{ gapId: string; why: string } | null> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🧠 ORIENT — Picking highest-leverage gap`);
  console.log(`${"=".repeat(60)}`);

  const openGaps = getOpenGaps();
  if (openGaps.length === 0) {
    console.log("  ✅ All gaps are solved or blocked!");
    return null;
  }

  console.log(`  📋 Found ${openGaps.length} open gaps`);
  for (const g of openGaps.slice(0, 5)) {
    console.log(`     - ${g.id}: ${g.description.slice(0, 60)}`);
  }

  // Use wisdom to pick the best gap
  const picked = pickBestGap(openGaps);
  if (!picked) {
    console.log("  ⚠️ No suitable gap found (all may be blocked/solved)");
    return null;
  }

  // Cross-reference with failure history
  const difficulty = loadGapDifficulty();
  const gapData = difficulty[picked];
  const priorAttempts = gapData?.attempts || 0;
  const knownFailures = gapData?.rootCauses || [];

  console.log(`  🎯 Selected: ${picked} (priority: ${openGaps.find(g => g.id === picked)?.priority})`);
  if (priorAttempts > 0) {
    console.log(`     Prior attempts: ${priorAttempts}`);
    if (knownFailures.length > 0) {
      console.log(`     Known failure patterns: ${knownFailures.slice(0, 3).join(", ")}`);
    }
  }

  return {
    gapId: picked,
    why: `Picked ${picked} based on difficulty score ${gapData?.score || 5}, ${priorAttempts} prior attempts`,
  };
}

async function decide(state: WisdomState, gapId: string | null): Promise<{ action: "implement" | "skip" | "done"; reason: string }> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`⚡ DECIDE — What to do`);
  console.log(`${"=".repeat(60)}`);

  if (!gapId) {
    return { action: "done", reason: "No open gaps remaining" };
  }

  const difficulty = loadGapDifficulty();
  const gapData = difficulty[gapId] || { attempts: 0, rootCauses: [] };

  // Check if blocked
  const blocked = loadBlockedGaps();
  if (blocked.some((b) => b.gapId === gapId)) {
    return { action: "skip", reason: `${gapId} is permanently blocked` };
  }

  // Check if too many attempts
  if (gapData.attempts >= 10) {
    return { action: "skip", reason: `${gapId} has ${gapData.attempts} attempts — marking blocked` };
  }

  console.log(`  ➡️  Will attempt to solve: ${gapId}`);
  return { action: "implement", reason: `${gapData.attempts} prior attempts, difficulty ${gapData.score || 5}` };
}

// Cleanup: move stray untracked files to .trash before committing
function cleanupTrash(): { trashed: string[] } {
  const trashed: string[] = [];
  try {
    ensureDir(join(ROOT, ".trash"));
    const status = runCmd("git status --porcelain", ROOT);
    for (const line of status.stdout.split("\n")) {
      if (!line.startsWith("?? ")) continue;
      const file = line.slice(3).trim();
      if (!file) continue;
      // Skip intentional root files
      const intentional = ["CLAUDE.md", "TODO.md", "README.md", "package.json", "tsconfig.json",
        "cook.sh", "train.sh", "bun.lock", "package-lock.json", ".env", ".env.example",
        ".gitignore", ".gitattributes"];
      if (intentional.includes(file)) continue;
      // Skip intentional dirs
      const intentionalDirs = ["meow", "meowclaw", "docs", "dogfood", "node_modules",
        "packages", "scripts", ".github", ".claude", ".meow", "tmp"];
      if (intentionalDirs.some((d) => file === d || file.startsWith(d + "/"))) continue;
      // Skip .trash itself
      if (file.startsWith(".trash")) continue;
      // Skip dogfood subdirs
      if (file.startsWith("dogfood/")) continue;

      const dest = `.trash/${file}-${Date.now()}`;
      runCmd(`mv "${file}" "${dest}"`, ROOT);
      trashed.push(file);
    }
  } catch {}
  return { trashed };
}

async function act(state: WisdomState, gapId: string): Promise<{ success: boolean; rootCause?: string }> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🔨 ACT — Implementing ${gapId}`);
  console.log(`${"=".repeat(60)}`);

  const startTime = Date.now();
  const ts = Date.now();
  const difficulty = loadGapDifficulty();
  const gapData = difficulty[gapId] || { attempts: 0, rootCauses: [], status: "open" };
  const attemptNumber = gapData.attempts + 1;

  difficulty[gapId] = { ...gapData, attempts: attemptNumber, status: "solving" };
  saveGapDifficulty(difficulty);

  let success = false;
  let rootCause = "";

  try {
    // Step 1: Claude Code implements the gap
    console.log(`\n[1/6] Claude Code implementing ${gapId}...`);
    const priorFailures = gapData.rootCauses.length > 0
      ? `Prior failure patterns to avoid: ${gapData.rootCauses.join("; ")}`
      : "No prior failures.";

    const implPrompt = `You are fixing gap ${gapId}.

${priorFailures}

First read tests/gap-impl.test.ts to understand the test format for this gap.
Then read tests/gaps.test.ts to find the ${gapId} test description.
Read docs/research/competitors/ for relevant competitor implementation patterns.
Read TODO.md and CLAUDE.md for project context.

Implement the fix:
1. Write a test in tests/gap-impl.test.ts for ${gapId}
2. Implement the code to make it pass
3. Run: bun test tests/gap-impl.test.ts
4. Dogfood: bun run cli/index.ts --dangerous "test the feature you just implemented for ${gapId}"

Report: PASS if all tests pass, FAIL with root cause if anything fails.`;

    const implResult = await claudeTask(implPrompt, `implement-${gapId}`);
    const implLogFile = join(LOGS_DIR, `implementation-${gapId}-${ts}.txt`);
    writeFileSync(implLogFile, implResult);
    console.log(`  📝 Implementation log saved`);

    // Step 2: INDEPENDENT test run — parse actual output, no self-report
    console.log(`\n[2/6] Running tests independently...`);
    const testResult = runCmd(`bun test tests/gap-impl.test.ts 2>&1`, ROOT);
    const testOutputFile = join(TESTS_DIR, `test-verify-${gapId}-${ts}.txt`);
    writeFileSync(testOutputFile, testResult.stdout + testResult.stderr);
    const output = testResult.stdout + testResult.stderr;
    const passMatch = output.match(/(\d+)\s+pass/);
    const failMatch = output.match(/(\d+)\s+fail/);
    const passCount = passMatch ? parseInt(passMatch[1]) : 0;
    const failCount = failMatch ? parseInt(failMatch[1]) : output.includes("fail") && !output.includes("0 fail") ? 1 : 0;
    const testPass = passCount > 0 && failCount === 0;
    console.log(`  🧪 Tests: ${passCount} pass, ${failCount} fail — ${testPass ? "✅" : "❌"}`);
    if (!testPass) rootCause = extractRootCause(output);

    // Step 3: INDEPENDENT smoke test — exercise the actual feature via CLI
    console.log(`\n[3/6] Running independent CLI smoke test...`);
    const smokePrompt = `Exercise the ${gapId} feature you just implemented.
Run: bun run cli/index.ts --dangerous "help" to see if the CLI starts and the feature is accessible.
Report EXACTLY: what command you ran, what output you got, whether the feature works.`;

    const smokeResult = await claudeTask(smokePrompt, `smoke-${gapId}`);
    const smokeOutputFile = join(TESTS_DIR, `smoke-${gapId}-${ts}.txt`);
    writeFileSync(smokeOutputFile, smokeResult);
    const smokePass = smokeResult.length > 50 && !smokeResult.toLowerCase().includes("could not");
    console.log(`  🐕 Smoke: ${smokePass ? "✅" : "⚠️ check output"}`);

    // Step 4: Verify gaps.test.ts no longer flags this as missing
    console.log(`\n[4/6] Verifying gaps.test.ts认可...`);
    const gapsResult = runCmd(`bun test tests/gaps.test.ts 2>&1`, ROOT);
    const gapsOutputFile = join(TESTS_DIR, `gaps-verify-${gapId}-${ts}.txt`);
    writeFileSync(gapsOutputFile, gapsResult.stdout + gapsResult.stderr);
    const gapsOutput = gapsResult.stdout + gapsResult.stderr;
    // Check if this specific gap ID appears in a failure context
    const gapIdEscaped = gapId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const gapFailsNow = new RegExp(`\\bfail\\b[^\\n]*${gapIdEscaped}|${gapIdEscaped}[^\\n]*\\bfail\\b`, "i").test(gapsOutput);
    const gapsTestPass = !gapFailsNow;
    console.log(`  📊 gaps.test.ts: ${gapsTestPass ? "✅ gap resolved" : "⚠️ still flagged"}`);

    const allPass = testPass && smokePass && gapsTestPass;

    if (allPass) {
      success = true;
      console.log(`\n✅ ${gapId} PASSED all rigorous checks!`);

      // Step 5: Cleanup trash before commit
      console.log(`\n[5/6] Cleaning up stray files...`);
      const { trashed } = cleanupTrash();
      if (trashed.length > 0) console.log(`  🚮 Trashed: ${trashed.join(", ")}`);
      else console.log(`  ✅ Nothing to trash`);

      // Step 6: Update docs
      console.log(`\n[6/6] Updating docs...`);
      const docPrompt = `Edit TODO.md and CLAUDE.md to reflect the ${gapId} implementation:
1. Mark ${gapId} as done in TODO.md
2. Add a dogfood note in CLAUDE.md under RECENT CHANGES

Be brief - 2-3 lines.`;

      const docResult = await claudeTask(docPrompt, `docs-${gapId}`);
      const docLogFile = join(LOGS_DIR, `doc-update-${gapId}-${ts}.txt`);
      writeFileSync(docLogFile, docResult);

      // Commit
      const gitStatus = runCmd("git status --short", ROOT);
      if (gitStatus.stdout.trim()) {
        runCmd(`git add . && git commit -m "fix(${gapId}): ${gapId} implementation

Co-Authored-By: Claude <noreply@anthropic.com>"`, ROOT);
        console.log(`  ✅ Committed`);
      }

      const solved = loadSolvedGaps();
      solved[gapId] = {
        solvedAt: timestamp(),
        iteration: state.iteration,
        notes: `Solved attempt ${attemptNumber}. Tests:${passCount}pass Smoke:${smokePass} Gaps:${gapsTestPass}`,
        approach: implResult.slice(0, 500),
      };
      saveSolvedGaps(solved);
      difficulty[gapId] = { ...difficulty[gapId], status: "solved" };
      saveGapDifficulty(difficulty);

    } else {
      success = false;
      if (!rootCause) rootCause = "test/smoke/gaps verification failed";
      console.log(`\n❌ ${gapId} FAILED:\n  Tests:${testPass ? "✅" : "❌"} Smoke:${smokePass ? "✅" : "❌"} Gaps:${gapsTestPass ? "✅" : "❌"}`);

      appendJsonl(FAILURE_MODES_FILE, {
        gapId,
        iteration: state.iteration,
        attempt: attemptNumber,
        cause: rootCause,
        timestamp: timestamp(),
        testPass, smokePass, gapsTestPass,
      });

      const existingCauses = difficulty[gapId]?.rootCauses || [];
      if (rootCause && !existingCauses.includes(rootCause)) existingCauses.push(rootCause);
      const newScore = Math.min((difficulty[gapId]?.score || 5) + 1, 10);
      difficulty[gapId] = {
        ...difficulty[gapId],
        attempts: attemptNumber,
        rootCauses: existingCauses,
        score: newScore,
        status: newScore >= 8 ? "blocked" : "solving",
      };
      saveGapDifficulty(difficulty);

      if (newScore >= 8) {
        console.log(`  🚫 ${gapId} blocked (difficulty: ${newScore})`);
        appendJsonl(BLOCKED_GAPS_FILE, { gapId, blockedAt: timestamp(), reason: rootCause, score: newScore });
      }
    }

    const attemptLog: AttemptLog = {
      gapId,
      iteration: state.iteration,
      attempt: attemptNumber,
      outcome: success ? "success" : (difficulty[gapId]?.status === "blocked" ? "blocked" : "failure"),
      rootCause: success ? undefined : rootCause,
      timestamp: timestamp(),
      durationMs: Date.now() - startTime,
    };
    appendJsonl(ATTEMPT_LOG_FILE, attemptLog);
    console.log(`\n[6/6] Attempt logged (${attemptLog.durationMs}ms)`);

  } catch (e: any) {
    success = false;
    rootCause = e.message || "Unknown error";
    console.log(`  💥 Exception: ${rootCause}`);
  }

  return { success, rootCause };
}

// ============================================================================
// Utilities
// ============================================================================

function extractRootCause(output: string): string {
  // Try to extract root cause from failure output
  const failMatch = output.match(/FAIL[:\s]*(.+)/i);
  if (failMatch) return failMatch[1].slice(0, 200).trim();

  const errorMatch = output.match(/error[:\s]*(.+)/i);
  if (errorMatch) return errorMatch[1].slice(0, 200).trim();

  const lines = output.split("\n").filter((l) => l.includes("FAIL") || l.includes("Error") || l.includes("error"));
  if (lines[0]) return lines[0].slice(0, 200).trim();

  return "Unknown failure";
}

// ============================================================================
// Main OODA Loop
// ============================================================================

async function runEvolve(options: { once?: boolean; status?: boolean; report?: boolean }): Promise<void> {
  ensureDir(DOGFOOD);
  ensureDir(WISDOM_DIR);
  ensureDir(BLOCKED_DIR);
  ensureDir(LOGS_DIR);
  ensureDir(TESTS_DIR);

  // Initialize wisdom files if they don't exist
  if (!existsSync(GAP_DIFFICULTY_FILE)) saveGapDifficulty({});
  if (!existsSync(SOLVED_GAPS_FILE)) saveSolvedGaps({});
  if (!existsSync(STATE_FILE)) saveState({
    iteration: 0,
    currentGap: null,
    totalAttempts: 0,
    totalFailures: 0,
    totalSuccesses: 0,
    sessionStart: timestamp(),
    lastIteration: timestamp(),
  });

  if (options.status) {
    printStatus();
    return;
  }

  if (options.report) {
    printReport();
    return;
  }

  const state = loadState();

  console.log(`
${"🐱".repeat(30)}
  MEOW EVOLVE — Antifragile Self-Evolving Loop
  Session: ${state.iteration} iterations | ${state.totalSuccesses} ✅ | ${state.totalFailures} ❌
${"🐱".repeat(30)}
`);

  // OODA Loop
  const gapAnalysis = await observe(state);
  const orientResult = await orient(state, gapAnalysis);

  if (!orientResult) {
    console.log("\n🛑 No gaps to work on. All done!");
    return;
  }

  const { gapId, why } = orientResult;
  const decideResult = await decide(state, gapId);

  if (decideResult.action === "done" || decideResult.action === "skip") {
    console.log(`\n🛑 ${decideResult.reason}`);
    if (options.once) return;
    // If all done, wait and loop to check again
    console.log("  (waiting 60s before re-checking...)");
    await new Promise((r) => setTimeout(r, 60000));
    return;
  }

  // Update state
  state.iteration++;
  state.totalAttempts++;
  state.currentGap = gapId;
  saveState(state);

  // Act!
  const actResult = await act(state, gapId);

  if (actResult.success) {
    state.totalSuccesses++;
  } else {
    state.totalFailures++;
  }
  saveState(state);

  if (options.once) {
    console.log(`\n📊 Single iteration complete. Success: ${actResult.success}`);
    return;
  }

  // Brief pause then loop
  console.log("  (brief pause before next iteration...)");
  await new Promise((r) => setTimeout(r, 2000));
}

// ============================================================================
// Status & Report
// ============================================================================

function printStatus(): void {
  const state = loadState();
  const difficulty = loadGapDifficulty();
  const solved = loadSolvedGaps();
  const blocked = loadBlockedGaps();

  const openCount = Object.values(difficulty).filter((d) => d.status === "open" || d.status === "solving").length;
  const solvingCount = Object.values(difficulty).filter((d) => d.status === "solving").length;

  console.log(`
🐱 EVOLVE STATUS
═══════════════════════════════════════════════
  Session start: ${state.sessionStart}
  Total iterations: ${state.iteration}
  Attempts: ${state.totalAttempts} | ✅ ${state.totalSuccesses} | ❌ ${state.totalFailures}
  Open gaps: ${openCount} (${solvingCount} in progress)
  Solved: ${Object.keys(solved).length}
  Blocked: ${blocked.length}
═══════════════════════════════════════════════`);

  if (state.currentGap) {
    console.log(`  Current gap: ${state.currentGap}`);
  }

  const topDifficult = Object.entries(difficulty)
    .filter(([, d]) => d.status !== "solved" && d.status !== "blocked")
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 5);

  if (topDifficult.length > 0) {
    console.log("\n  Hardest open gaps:");
    for (const [id, d] of topDifficult) {
      console.log(`    ${id}: difficulty ${d.score}, ${d.attempts} attempts`);
    }
  }
}

function printReport(): void {
  const state = loadState();
  const difficulty = loadGapDifficulty();
  const solved = loadSolvedGaps();
  const blocked = loadBlockedGaps();

  // Read attempt log for statistics
  const attempts: AttemptLog[] = [];
  if (existsSync(ATTEMPT_LOG_FILE)) {
    const lines = readFileSync(ATTEMPT_LOG_FILE, "utf-8").trim().split("\n").filter(Boolean);
    for (const line of lines) {
      try { attempts.push(JSON.parse(line)); } catch {}
    }
  }

  const failures: AttemptLog[] = attempts.filter((a) => a.outcome === "failure");
  const avgDuration = attempts.length > 0
    ? Math.round(attempts.reduce((sum, a) => sum + a.durationMs, 0) / attempts.length / 1000)
    : 0;

  console.log(`
🐱 EVOLVE FULL REPORT
══════════════════════════════════════════════════════════════
  SESSION STATS
  ────────────────────────────────────────────────────────────
  Started: ${state.sessionStart}
  Iterations: ${state.iteration}
  Total attempts: ${state.totalAttempts}
  Success rate: ${state.totalAttempts > 0 ? Math.round(state.totalSuccesses / state.totalAttempts * 100) : 0}%
  Avg iteration duration: ${avgDuration}s

  GAP STATUS
  ────────────────────────────────────────────────────────────
  Solved: ${Object.keys(solved).length}
  Blocked: ${blocked.length}
  In progress: ${Object.values(difficulty).filter(d => d.status === "solving").length}
  Open: ${Object.values(difficulty).filter(d => d.status === "open").length}

  SOLVED GAPS
  ────────────────────────────────────────────────────────────`);
  for (const [id, info] of Object.entries(solved)) {
    console.log(`  ✅ ${id} (iter ${info.iteration}, ${info.notes})`);
  }

  if (blocked.length > 0) {
    console.log(`
  BLOCKED GAPS
  ────────────────────────────────────────────────────────────`);
    for (const b of blocked.slice(-10)) {
      console.log(`  🚫 ${b.gapId}: ${b.reason.slice(0, 80)}`);
    }
  }

  if (failures.length > 0) {
    console.log(`
  TOP FAILURE PATTERNS
  ────────────────────────────────────────────────────────────`);
    const causeCounts: Record<string, number> = {};
    for (const f of failures) {
      if (f.rootCause) {
        causeCounts[f.rootCause] = (causeCounts[f.rootCause] || 0) + 1;
      }
    }
    const topCauses = Object.entries(causeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    for (const [cause, count] of topCauses) {
      console.log(`  ❌ "${cause.slice(0, 60)}" — ${count}x`);
    }
  }

  console.log(`
══════════════════════════════════════════════════════════════
`);
}

// ============================================================================
// CLI Entry
// ============================================================================

const args = process.argv.slice(2);

if (args.includes("--status")) {
  printStatus();
} else if (args.includes("--report")) {
  printReport();
} else {
  const once = args.includes("--once");
  runEvolve({ once });
}
