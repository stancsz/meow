/**
 * evolve.ts — Simple Gap-Closing Loop
 *
 * A simple, robust loop that closes gaps by delegating to Claude Code.
 *
 * IMPORTANT: This file is FROZEN. The loop never modifies it.
 * All wisdom/state goes to dogfood/wisdom/
 *
 * Usage:
 *   bun run src/tools/evolve.ts          # Run continuously
 *   bun run src/tools/evolve.ts --once   # Single gap
 *   bun run src/tools/evolve.ts --status # Show gap status
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// ============================================================================
// Paths
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const DOGFOOD = join(ROOT, "dogfood");
const WISDOM_DIR = join(DOGFOOD, "wisdom");
const GAP_LIST_FILE = join(WISDOM_DIR, "gap-list-v2.json");
const STATE_FILE = join(WISDOM_DIR, "state-v2.json");
const SOLVED_FILE = join(WISDOM_DIR, "solved-v2.json");

// ============================================================================
// Types
// ============================================================================

interface Gap {
  id: string;
  description: string;
  priority: "P0" | "P1" | "P2";
  status: "open" | "solved" | "blocked";
  whatToImplement: string;
}

interface State {
  currentGapIndex: number;
  totalSolved: number;
  totalFailed: number;
  sessionStart: string;
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

function timestamp(): string {
  return new Date().toISOString();
}

function runCmd(cmd: string, cwd: string = ROOT): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execSync(cmd, { cwd, encoding: "utf-8", timeout: 300000, maxBuffer: 50 * 1024 * 1024 });
    return { stdout, stderr: "", code: 0 };
  } catch (e: any) {
    return { stdout: e.stdout || "", stderr: e.stderr || "", code: e.status || 1 };
  }
}

async function runCmdAsync(cmd: string, cwd: string = ROOT): Promise<string> {
  return new Promise((resolve) => {
    const timeoutMs = 300000;
    // Use spawn in a child process to avoid stdin/stdout piping issues with claude --print
    const child = spawn("bash", ["-c", cmd], { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill("SIGKILL");
        resolve(stdout + stderr + "\n[TIMEOUT after " + timeoutMs + "ms]");
      }
    }, timeoutMs);

    child.stdout?.on("data", (data: string) => { stdout += data; process.stdout.write(data); });
    child.stderr?.on("data", (data: string) => { stderr += data; process.stderr.write(data); });
    child.on("close", (code: number | null) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(stdout + stderr);
      }
    });
    child.on("error", (err: Error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(stdout + stderr + "\n[ERROR: " + err.message + "]");
      }
    });
  });
}

// ============================================================================
// Gap List Management
// ============================================================================

function loadGaps(): Gap[] {
  const defaultGaps: Gap[] = [
    {
      id: "GAP-LEARN-01",
      description: "On-demand learning skill",
      priority: "P0",
      status: "open",
      whatToImplement: "Create a /learn command that lets users learn new capabilities. Should integrate with the harvest system in docs/harvest/.",
    },
    {
      id: "GAP-MCP-01",
      description: "MCP client integration",
      priority: "P1",
      status: "open",
      whatToImplement: "Ensure MCP client in src/sidecars/mcp-client.ts works. Test by connecting to a simple MCP server.",
    },
    {
      id: "GAP-PERM-01",
      description: "Pattern-matching permissions",
      priority: "P1",
      status: "open",
      whatToImplement: "Improve permissions.ts to support pattern-based allow/deny rules. Test with a simple permission check.",
    },
  ];
  return readJson<Gap[]>(GAP_LIST_FILE, defaultGaps);
}

function saveGaps(gaps: Gap[]): void {
  ensureDir(WISDOM_DIR);
  writeJson(GAP_LIST_FILE, gaps);
}

function loadState(): State {
  const fallback: State = {
    currentGapIndex: 0,
    totalSolved: 0,
    totalFailed: 0,
    sessionStart: timestamp(),
  };
  return readJson<State>(STATE_FILE, fallback);
}

function saveState(state: State): void {
  writeJson(STATE_FILE, state);
}

function loadSolved(): Record<string, { solvedAt: string; notes: string }> {
  return readJson<Record<string, { solvedAt: string; notes: string }>>(SOLVED_FILE, {});
}

function saveSolved(solved: Record<string, { solvedAt: string; notes: string }>): void {
  writeJson(SOLVED_FILE, solved);
}

// ============================================================================
// Core Loop
// ============================================================================

async function solveGap(gap: Gap): Promise<{ success: boolean; reason?: string }> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🎯 Solving: ${gap.id} — ${gap.description}`);
  console.log(`${"=".repeat(60)}`);

  const prompt = `You are closing gap ${gap.id} in the meow CLI project.

Gap description: ${gap.description}
What to implement: ${gap.whatToImplement}

IMPORTANT:
- Work in the src/ directory
- Implement the feature as a skill (skills/) or sidecar (sidecars/)
- After implementing, test it by running: bun run cli/index.ts --dangerous "help"
- If the CLI starts and shows help, the implementation works
- You MUST modify actual files - do not just describe what you would do

Steps:
1. Read relevant existing code in src/ to understand patterns
2. Implement the feature by creating/modifying files in src/
3. Test with: bun run cli/index.ts --dangerous "help"
4. Report what you did

Respond with:
  SUCCESS: <brief description of what you implemented>
  FAILED: <brief reason why it didn't work>
`;

  console.log(`  🤖 Calling Claude Code...`);
  // Write prompt to temp file and pipe to claude --print
  const tmpDir = join(ROOT, "tmp");
  ensureDir(tmpDir);
  const promptFile = join(tmpDir, `evolve-prompt-${Date.now()}.txt`);
  writeFileSync(promptFile, prompt);

  // Use execSync for reliable stdin piping to claude --print
  let result = "";
  try {
    const cmd = `cat "${promptFile}" | bash -c 'claude --dangerously-skip-permissions --bare --print'`;
    result = execSync(cmd, { cwd: ROOT, encoding: "utf-8", timeout: 300000, maxBuffer: 50 * 1024 * 1024 });
  } catch (e: any) {
    result = e.stdout || e.message || "";
  }
  console.log(`  [DEBUG] Raw result: "${result.slice(0, 100)}"`);
  console.log(`  📝 Response received (${result.length} chars)`);

  // Check if implementation worked (look for SUCCESS or FAILED markers)
  const hasSuccess = result.includes("SUCCESS") || result.includes("success");
  const hasFailure = result.includes("FAILED:") || result.includes("FAILED");

  if (hasSuccess || hasFailure) {
    // Check if files were actually modified
    console.log(`  📁 Checking for file changes...`);
    const gitStatus = runCmd(`git status --short .`, ROOT);
    const hasChanges = gitStatus.stdout.trim().length > 0;

    if (hasSuccess && !hasChanges) {
      console.log(`  ❌ LLM said SUCCESS but no files changed!`);
      return { success: false, reason: "No files modified" };
    }
    if (hasChanges) {
      console.log(`  📁 Changes detected:\n${gitStatus.stdout}`);
    }

    // Dogfood test
    console.log(`  🧪 Dogfooding...`);
    const dogfood = runCmd(`bun run cli/index.ts --dangerous "help" 2>&1`, ROOT);
    const works = dogfood.code === 0 && dogfood.stdout.length > 0;

    if (works) {
      console.log(`  ✅ Dogfood passed`);
    } else {
      console.log(`  ⚠️  Dogfood had issues but continuing`);
    }

    if (hasSuccess) {
      return { success: true };
    } else {
      const reason = result.match(/FAILED:\s*(.+)/)?.[1] || "Unknown";
      console.log(`  ❌ Failed: ${reason}`);
      return { success: false, reason };
    }
  } else {
    // No clear SUCCESS or FAILED - check if files actually changed anyway
    console.log(`  📁 Checking for file changes...`);
    const gitStatus = runCmd(`git status --short .`, ROOT);
    const hasChanges = gitStatus.stdout.trim().length > 0;

    if (hasChanges) {
      console.log(`  📁 Changes detected, counting as success:\n${gitStatus.stdout}`);
      return { success: true };
    }
    console.log(`  ❌ No SUCCESS/FAILED and no files changed`);
    return { success: false, reason: "No output and no files modified" };
  }
}

function markSolved(gapId: string): void {
  const gaps = loadGaps();
  const gap = gaps.find((g) => g.id === gapId);
  if (gap) {
    gap.status = "solved";
    saveGaps(gaps);
  }

  const solved = loadSolved();
  solved[gapId] = { solvedAt: timestamp(), notes: "" };
  saveSolved(solved);

  // Commit the changes
  console.log(`  📝 Committing changes...`);
  const gitStatus = runCmd(`git status --short .`, ROOT);
  if (gitStatus.stdout.trim()) {
    runCmd(`git add . && git commit -m "fix(${gapId}): ${gap?.description}

Evolve loop - gap closed via Claude Code.

Co-Authored-By: Claude <noreply@anthropic.com>"`, ROOT);
    console.log(`  ✅ Committed`);
  } else {
    console.log(`  (No changes to commit)`);
  }
}

function markFailed(gapId: string, reason: string): void {
  const gaps = loadGaps();
  const gap = gaps.find((g) => g.id === gapId);
  if (gap) {
    gap.status = "blocked";
    saveGaps(gaps);
  }
}

function getNextOpenGap(): Gap | null {
  const gaps = loadGaps();
  const openGaps = gaps.filter((g) => g.status === "open");

  if (openGaps.length === 0) {
    return null;
  }

  // Sort by priority
  openGaps.sort((a, b) => {
    const pOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
    return pOrder[a.priority] - pOrder[b.priority];
  });

  return openGaps[0];
}

// ============================================================================
// Main Loop
// ============================================================================

async function runLoop(options: { once?: boolean }): Promise<void> {
  ensureDir(DOGFOOD);
  ensureDir(WISDOM_DIR);

  const state = loadState();

  console.log(`
${"🐱".repeat(30)}
  MEOW EVOLVE — Simple Gap-Closing Loop
  Total solved: ${state.totalSolved} | Failed: ${state.totalFailed}
${"🐱".repeat(30)}
`);

  while (true) {
    const gap = getNextOpenGap();

    if (!gap) {
      // No open gaps - run autonomous discovery
      console.log(`\n🔍 No open gaps - running autonomous discovery...`);
      const discovered = await discoverAndCreateGap();

      if (!discovered) {
        // Nothing to do - dogfood test the system
        console.log(`\n🧪 No new gaps found - running dogfood test...`);
        await dogfoodTest();
      }

      if (options.once) {
        console.log(`\nSingle iteration complete.`);
        break;
      }

      // Brief pause before next check
      await new Promise((r) => setTimeout(r, 30000));
      continue;
    }

    const remaining = loadGaps().filter((g) => g.status === "open").length;
    console.log(`\n📋 Open gaps remaining: ${remaining}`);

    const result = await solveGap(gap);

    if (result.success) {
      markSolved(gap.id);
      state.totalSolved++;
      console.log(`\n✅ ${gap.id} SOLVED! (total: ${state.totalSolved})`);
    } else {
      markFailed(gap.id, result.reason || "Unknown");
      state.totalFailed++;
      console.log(`\n❌ ${gap.id} FAILED: ${result.reason} (total failed: ${state.totalFailed})`);
    }

    saveState(state);

    if (options.once) {
      console.log(`\nSingle iteration complete.`);
      break;
    }

    // Brief pause between gaps
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function discoverAndCreateGap(): Promise<boolean> {
  console.log(`\n🔍 Discovering new gaps...`);

  const gaps = loadGaps();
  const HARVEST_DIR = join(ROOT, "docs/harvest");
  const SRC_DIR = join(ROOT, "src");
  let newGapsFound = false;

  // 1. Check harvest directory for unimplemented candidates
  try {
    const harvestFiles = existsSync(HARVEST_DIR) ? readdirSync(HARVEST_DIR).filter(f => f.endsWith(".md")) : [];

    for (const file of harvestFiles) {
      const filePath = join(HARVEST_DIR, file);
      const content = readFileSync(filePath, "utf-8");
      const repoName = file.replace(".md", "");
      const gapId = `GAP-HARVEST-${repoName.toUpperCase().replace(/-/g, "")}-01`;

      // Check if already harvested (gap exists and is solved, or skill/sidecar exists)
      if (gaps.find(g => g.id === gapId && g.status === "solved")) {
        continue; // Already done
      }
      if (gaps.find(g => g.id === gapId)) {
        continue; // Already a gap
      }

      // Check if implementation exists
      const implExists =
        existsSync(join(SRC_DIR, "skills", `${repoName}.ts`)) ||
        existsSync(join(SRC_DIR, "sidecars", `${repoName}.ts`)) ||
        existsSync(join(SRC_DIR, "skills", `${repoName.replace(/-/g, "")}.ts`));

      if (!implExists) {
        // Extract first line as description
        const description = content.split("\n")[0].replace(/^#\s*/, "").trim();
        const newGap: Gap = {
          id: gapId,
          description: `Harvest: ${description}`,
          priority: "P1",
          status: "open",
          whatToImplement: `Implement the ${repoName} capability from docs/harvest/${file}. ${description}`
        };
        gaps.push(newGap);
        console.log(`  📝 Discovered: ${newGap.id} — ${newGap.description}`);
        newGapsFound = true;
      }
    }
  } catch (e) {
    console.log(`  Error checking harvest: ${e}`);
  }

  // 2. Check for TODO/FIXME comments in source
  try {
    const todos = runCmd(`grep -r "TODO\\|FIXME\\|XXX" src --include="*.ts" 2>/dev/null | head -20`, ROOT);
    const todoLines = todos.stdout.split("\n").filter(l => l.trim());
    if (todoLines.length > 0) {
      const gapId = "GAP-TODO-01";
      if (!gaps.find(g => g.id === gapId)) {
        const newGap: Gap = {
          id: gapId,
          description: "Address TODO/FIXME comments in source code",
          priority: "P2",
          status: "open",
          whatToImplement: `Fix these TODOs:\n${todoLines.slice(0, 5).join("\n")}`
        };
        gaps.push(newGap);
        console.log(`  📝 Discovered: ${newGap.id} — TODO comments found`);
        newGapsFound = true;
      }
    }
  } catch (e) {
    // Ignore
  }

  // 3. Check for missing test files
  try {
    const srcFiles = runCmd(`find src -name "*.ts" -type f 2>/dev/null | head -30`, ROOT);
    const testGapId = "GAP-TESTS-01";
    if (!gaps.find(g => g.id === testGapId)) {
      const srcCount = srcFiles.stdout.split("\n").filter(l => l.trim()).length;
      const testCount = runCmd(`find tests -name "*.ts" -type f 2>/dev/null | wc -l`, ROOT);
      const testNum = parseInt(testCount.stdout.trim() || "0");
      if (srcCount > testNum * 2) {
        const newGap: Gap = {
          id: testGapId,
          description: "Expand test coverage",
          priority: "P2",
          status: "open",
          whatToImplement: `Source has ${srcCount} files but only ${testNum} test files. Add tests for untested modules.`
        };
        gaps.push(newGap);
        console.log(`  📝 Discovered: ${newGap.id} — test coverage needed`);
        newGapsFound = true;
      }
    }
  } catch (e) {
    // Ignore
  }

  // 4. If nothing found, add a skill gap
  if (!newGapsFound) {
    const skillGaps = [
      { id: "GAP-SKILL-EXEC", description: "Add shell command execution skill", priority: "P1" as const, whatToImplement: "Create meow/src/skills/exec.ts for running shell commands with timeout support" },
      { id: "GAP-SKILL-GIT", description: "Add advanced git skill", priority: "P1" as const, whatToImplement: "Create meow/src/skills/git.ts with advanced git operations (rebase, bisect, stash)" },
      { id: "GAP-SKILL-SEARCH", description: "Add code search skill", priority: "P2" as const, whatToImplement: "Create meow/src/skills/search.ts for semantic code search" },
      { id: "GAP-SIDECAR-MONITOR", description: "Add system monitoring sidecar", priority: "P2" as const, whatToImplement: "Create meow/src/sidecars/monitor.ts for tracking system resources" },
    ];

    for (const sg of skillGaps) {
      if (!gaps.find(g => g.id === sg.id)) {
        gaps.push({ ...sg, status: "open" });
        console.log(`  📝 Discovered: ${sg.id} — ${sg.description}`);
        newGapsFound = true;
        break; // Just add one at a time
      }
    }
  }

  if (newGapsFound) {
    saveGaps(gaps);
    console.log(`✅ New gaps added to list`);
    return true;
  }

  return false;
}

async function dogfoodTest(): Promise<void> {
  console.log(`\n🧪 Running dogfood test...`);

  const result = runCmd(`bun run cli/index.ts --dangerous "help" 2>&1`, ROOT);

  if (result.code === 0 && result.stdout.includes("help")) {
    console.log(`  ✅ CLI help works`);
  } else {
    console.log(`  ❌ CLI help failed - may need fixing`);
    // Create a gap for this issue
    const gaps = loadGaps();
    const cliGap = {
      id: `GAP-CLI-${Date.now()}`,
      description: "CLI help command not working",
      priority: "P0",
      status: "open",
      whatToImplement: "Fix the CLI help command. Run 'bun run cli/index.ts --dangerous help' and ensure it outputs help text."
    };
    gaps.push(cliGap);
    saveGaps(gaps);
    console.log(`  📝 Created gap: ${cliGap.id}`);
  }
}

// ============================================================================
// Status
// ============================================================================

function showStatus(): void {
  const gaps = loadGaps();
  const state = loadState();

  console.log(`
🐱 EVOLVE STATUS
═══════════════════════════════════════════════
  Session start: ${state.sessionStart}
  Total solved: ${state.totalSolved}
  Total failed: ${state.totalFailed}
═══════════════════════════════════════════════

  GAPS (${gaps.length} total)
  ───────────────────────────────────────────────`);

  for (const gap of gaps) {
    const icon = gap.status === "solved" ? "✅" : gap.status === "blocked" ? "🚫" : "📋";
    console.log(`  ${icon} ${gap.id} [${gap.priority}] ${gap.description}`);
    if (gap.status === "open") {
      console.log(`      → ${gap.whatToImplement.slice(0, 60)}...`);
    }
  }

  console.log(`\n`);
}

// ============================================================================
// CLI
// ============================================================================

const args = process.argv.slice(2);

if (args.includes("--status")) {
  showStatus();
} else if (args.includes("--once")) {
  runLoop({ once: true });
} else {
  runLoop({ once: false });
}
