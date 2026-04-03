/**
 * harvest.ts — Learn techniques from other projects
 *
 * Harvests minimal implementations of interesting techniques from competitor repos
 * and external sources. Clones repos to tmp/, reads key files, implements
 * minimal versions as sidecars or techniques.
 *
 * Reads from:
 *   docs/harvest/*.md          — Harvest instructions per technique
 *   docs/research/competitors/ — Already-researched competitor docs
 *
 * Writes to:
 *   tmp/harvest/<name>/        — Cloned repos (gitignored)
 *   dogfood/harvest/           — Harvest wisdom: what was learned, status
 *   src/techniques/            — Minimal implementations of harvested tricks
 *
 * Usage:
 *   bun run src/tools/harvest.ts              # Run harvest loop
 *   bun run src/tools/harvest.ts --once       # Harvest one technique then exit
 *   bun run src/tools/harvest.ts --list       # List available harvest instructions
 *   bun run src/tools/harvest.ts --report     # Full harvest wisdom report
 */

import {
  readFileSync, writeFileSync, existsSync, mkdirSync,
  appendFileSync, readdirSync, rmSync
} from "node:fs";
import { join, dirname, relative } from "node:path";
import { execSync, exec } from "node:child_process";
import { fileURLToPath } from "node:url";

// ============================================================================
// Paths
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const HARVEST_DOCS = join(ROOT, "docs/harvest");
const COMPETITOR_DOCS = join(ROOT, "docs/research/competitors");
const TMP_HARVEST = join(ROOT, "tmp/harvest");
const WISDOM_HARVEST = join(ROOT, "dogfood/harvest");
const TECHNIQUES_DIR = join(ROOT, "src/techniques");

// ============================================================================
// Types
// ============================================================================

interface HarvestInstruction {
  name: string;           // e.g., "rewind", "acp-mode", "checkpointing"
  source: {
    repo: string;         // e.g., "https://github.com/google/gemini-cli"
    branch?: string;
    path?: string;        // e.g., "docs/cli/rewind.md" or "packages/cli/src/acp/"
    docPath?: string;     // Path in docs/research/competitors/
  };
  why: string;             // Why this is worth harvesting
  minimalSlice: string;   // What exact feature to implement (be specific)
  fit: "sidecar" | "skill" | "technique" | "core";  // Where it best fits
  status: "pending" | "learning" | "implemented" | "skipped";
  complexity: 1 | 2 | 3 | 4 | 5;  // How complex the minimal implementation is
  notes?: string;
}

interface HarvestWisdom {
  techniques: Record<string, {
    name: string;
    status: "pending" | "learning" | "implemented" | "skipped";
    source: string;
    implementedAt?: string;
    implementationPath?: string;
    clonedAt?: string;
    learnedAt?: string;
    skippedReason?: string;
    notes: string;
  }>;
  lastHarvest: string;
  totalImplemented: number;
  totalSkipped: number;
  totalPending: number;
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
    const stdout = execSync(cmd, { cwd, encoding: "utf-8", timeout: 60000, maxBuffer: 50 * 1024 * 1024 });
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

async function claudeTask(prompt: string, description: string): Promise<string> {
  const safePrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  const cmd = `claude --dangerously-skip-permissions "${safePrompt}"`;
  console.log(`  🤖 [${description}]`);
  const result = await runCmdAsync(cmd, ROOT);
  return result.stdout + result.stderr;
}

function readDirFiles(dir: string, extensions: string[] = []): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readDirFiles(full, extensions));
    } else if (entry.isFile()) {
      if (extensions.length === 0 || extensions.some((ext) => entry.name.endsWith(ext))) {
        files.push(full);
      }
    }
  }
  return files;
}

// ============================================================================
// Harvest Instructions
// ============================================================================

function getHarvestInstructions(): HarvestInstruction[] {
  const instructions: HarvestInstruction[] = [];

  // Read explicit docs/harvest/*.md files
  if (existsSync(HARVEST_DOCS)) {
    for (const file of readdirSync(HARVEST_DOCS)) {
      if (file.endsWith(".md")) {
        const content = readFileSync(join(HARVEST_DOCS, file), "utf-8");
        const parsed = parseHarvestDoc(content, file.replace(".md", ""));
        if (parsed) instructions.push(parsed);
      }
    }
  }

  // Auto-detect from competitor docs (scan for things not yet implemented)
  const wisdom = loadHarvestWisdom();
  const competitorDirs = existsSync(COMPETITOR_DOCS)
    ? readdirSync(COMPETITOR_DOCS)
    : [];

  for (const competitor of competitorDirs) {
    const docsDir = join(COMPETITOR_DOCS, competitor, "docs");
    if (!existsSync(docsDir)) continue;

    const docFiles = readDirFiles(docsDir, [".md"]);
    for (const docFile of docFiles) {
      const rel = relative(docsDir, docFile);
      const name = rel.replace(/\.md$/, "").replace(/\\/g, "/");

      // Skip if already have instruction for this
      if (instructions.some((i) => i.name === name)) continue;

      // Check if wisdom says this is already done
      if (wisdom.techniques[name]?.status === "implemented") continue;

      // Auto-create a pending instruction for interesting docs
      const content = readFileSync(docFile, "utf-8");
      const title = extractTitle(content) || name;
      const why = extractWhyInteresting(content, name);

      if (why) {
        instructions.push({
          name,
          source: {
            repo: inferRepoUrl(competitor),
            docPath: rel,
          },
          why,
          minimalSlice: `Minimal slice of "${title}" from ${competitor}`,
          fit: inferFit(name),
          status: "pending",
          complexity: 2,
        });
      }
    }
  }

  return instructions;
}

function parseHarvestDoc(content: string, filename: string): HarvestInstruction | null {
  // Parse frontmatter: --- ... ---
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) {
    // No frontmatter — treat entire file as why paragraph
    return {
      name: filename,
      source: { repo: "" },
      why: content.slice(0, 300).trim(),
      minimalSlice: `Implement: ${filename}`,
      fit: "technique",
      status: "pending",
      complexity: 2,
    };
  }

  const fm: Record<string, string> = {};
  for (const line of fmMatch[1].split("\n")) {
    const [key, ...valueParts] = line.split(":");
    if (key && valueParts.length) {
      fm[key.trim()] = valueParts.join(":").trim();
    }
  }

  const body = content.slice(fmMatch[0].length).trim();

  return {
    name: fm.name || filename,
    source: {
      repo: fm.repo || "",
      branch: fm.branch,
      path: fm.path,
      docPath: fm.docPath,
    },
    why: fm.why || body.slice(0, 200),
    minimalSlice: fm.minimalSlice || body.slice(0, 300),
    fit: (fm.fit as HarvestInstruction["fit"]) || "technique",
    status: (fm.status as HarvestInstruction["status"]) || "pending",
    complexity: parseInt(fm.complexity || "2") as 1 | 2 | 3 | 4 | 5,
    notes: fm.notes,
  };
}

function extractTitle(content: string): string {
  const h1 = content.match(/^#\s+(.+)/m);
  return h1 ? h1[1].trim() : "";
}

function extractWhyInteresting(content: string, name: string): string {
  // Look for the "why interesting" patterns
  const patterns = [
    /lets?\s+you\s+(.+?)\.\s*(?=\n\n|\n#|$)/i,
    /allows?\s+you\s+to\s+(.+?)\.\s*(?=\n\n|\n#|$)/i,
    /provides?\s+(?:a\s+)?(.+?)\.\s*(?=\n\n|\n#|$)/i,
    /enables?\s+(.+?)\.\s*(?=\n\n|\n#|$)/i,
  ];
  for (const p of patterns) {
    const m = content.match(p);
    if (m && m[1].length > 10 && m[1].length < 200) {
      return m[1].trim();
    }
  }
  return ""; // Empty = skip (not interesting enough to auto-harvest)
}

function inferFit(name: string): HarvestInstruction["fit"] {
  if (name.includes("mode") || name.includes("protocol")) return "sidecar";
  if (name.includes("review") || name.includes("simplify")) return "skill";
  if (name.includes("checkpoint") || name.includes("rewind")) return "technique";
  return "sidecar";
}

function inferRepoUrl(competitor: string): string {
  const map: Record<string, string> = {
    "gemini-cli": "https://github.com/google-gemini/gemini-cli",
    "claude-code-source-code": "https://github.com/anthropics/claude-code",
    "aider": "https://github.com/aider-aider/aider",
    "open-interpreter": "https://github.com/OpenInterpreter/open-interpreter",
    "goose": "https://github.com/goose-team/goose",
    "cline": "https://github.comcline-team/cline",
    "OpenHands": "https://github.com/All-Hands-AI/OpenHands",
  };
  return map[competitor] || `https://github.com/unknown/${competitor}`;
}

// ============================================================================
// Wisdom Persistence
// ============================================================================

function loadHarvestWisdom(): HarvestWisdom {
  const path = join(WISDOM_HARVEST, "wisdom.json");
  const fallback: HarvestWisdom = {
    techniques: {},
    lastHarvest: timestamp(),
    totalImplemented: 0,
    totalSkipped: 0,
    totalPending: 0,
  };
  return readJson<HarvestWisdom>(path, fallback);
}

function saveHarvestWisdom(wisdom: HarvestWisdom): void {
  ensureDir(WISDOM_HARVEST);
  wisdom.lastHarvest = timestamp();
  writeJson(join(WISDOM_HARVEST, "wisdom.json"), wisdom);
}

function updateTechniqueStatus(
  name: string,
  status: HarvestWisdom["techniques"][string]["status"],
  extra: Partial<HarvestWisdom["techniques"][string]> = {}
): void {
  const wisdom = loadHarvestWisdom();
  if (!wisdom.techniques[name]) {
    wisdom.techniques[name] = {
      name,
      status,
      source: "",
      notes: "",
    };
  }
  wisdom.techniques[name].status = status;
  Object.assign(wisdom.techniques[name], extra);
  wisdom.totalImplemented = Object.values(wisdom.techniques).filter((t) => t.status === "implemented").length;
  wisdom.totalSkipped = Object.values(wisdom.techniques).filter((t) => t.status === "skipped").length;
  wisdom.totalPending = Object.values(wisdom.techniques).filter((t) => t.status === "pending").length;
  saveHarvestWisdom(wisdom);
}

// ============================================================================
// Core Harvest Steps
// ============================================================================

async function learnFromRepo(
  instruction: HarvestInstruction
): Promise<{ success: boolean; implemented?: boolean; reason?: string }> {
  const { name, source, minimalSlice, fit } = instruction;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🌾 HARVEST — ${name}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  Source: ${source.repo}`);
  if (source.path) console.log(`  Path: ${source.path}`);
  if (source.docPath) console.log(`  Doc: ${source.docPath}`);
  console.log(`  Why: ${instruction.why.slice(0, 80)}`);
  console.log(`  Fit: ${fit}`);
  console.log(`  Minimal slice: ${minimalSlice.slice(0, 80)}...`);

  // Step 1: Clone repo to tmp/harvest/<name>/
  console.log(`\n[1/6] Cloning ${source.repo}...`);
  ensureDir(TMP_HARVEST);
  const cloneDir = join(TMP_HARVEST, name.replace(/[^a-z0-9_-]/gi, "_"));

  // Only clone if not already present
  if (!existsSync(cloneDir)) {
    const branchFlag = source.branch ? `--branch ${source.branch}` : "";
    const { code } = runCmd(`git clone --depth 1 ${branchFlag} ${source.repo} "${cloneDir}" 2>&1`);
    if (code !== 0) {
      console.log(`  ⚠️  Clone failed, will use local docs`);
    } else {
      console.log(`  ✅ Cloned to ${relative(ROOT, cloneDir)}`);
      updateTechniqueStatus(name, "learning", { clonedAt: timestamp() });
    }
  } else {
    console.log(`  📁 Already cloned: ${relative(ROOT, cloneDir)}`);
    updateTechniqueStatus(name, "learning", { clonedAt: timestamp() });
  }

  // Step 2: Find the relevant source files
  let sourceContent = "";
  let sourceFiles: string[] = [];

  if (source.path && existsSync(cloneDir)) {
    const sourcePath = join(cloneDir, source.path);
    if (existsSync(sourcePath)) {
      if ((await import("node:fs")).statSync(sourcePath).isDirectory()) {
        sourceFiles = readDirFiles(sourcePath, [".ts", ".js", ".py", ".rs"]);
      } else {
        sourceFiles = [sourcePath];
      }
    }
  } else if (source.docPath) {
    // Find in competitor docs (already have these)
    const competitorDoc = join(COMPETITOR_DOCS, source.docPath);
    if (existsSync(competitorDoc)) {
      sourceContent = readFileSync(competitorDoc, "utf-8");
    }
  }

  // Read source files
  for (const f of sourceFiles.slice(0, 5)) {
    try {
      sourceContent += `\n\n--- ${relative(cloneDir, f)} ---\n`;
      sourceContent += readFileSync(f, "utf-8").slice(0, 2000);
    } catch {}
  }

  // Step 3: Decide where to implement
  let targetDir: string;
  let targetFile: string;

  if (fit === "sidecar") {
    targetDir = join(ROOT, "src/sidecars");
    targetFile = join(targetDir, `${name.replace(/-/g, "_")}.ts`);
  } else if (fit === "skill") {
    targetDir = join(ROOT, "src/skills");
    targetFile = join(targetDir, `${name.replace(/-/g, "_")}.ts`);
  } else if (fit === "technique") {
    targetDir = TECHNIQUES_DIR;
    ensureDir(TECHNIQUES_DIR);
    targetFile = join(targetDir, `${name.replace(/-/g, "_")}.ts`);
  } else {
    targetDir = join(ROOT, "src");
    targetFile = join(targetDir, `${name.replace(/-/g, "_")}.ts`);
  }

  console.log(`\n[2/6] Source analysis complete (${sourceFiles.length} files)`);
  console.log(`\n[3/6] Implementation target: ${relative(ROOT, targetFile)}`);

  // Step 4: Ask Claude to implement the minimal slice
  console.log(`\n[4/6] Claude Code implementing minimal slice...`);
  const existingExists = existsSync(targetFile);
  const existingCode = existingExists ? `\n\nExisting code:\n${readFileSync(targetFile, "utf-8").slice(0, 1000)}` : "";

  const implPrompt = `You are harvesting the "${name}" technique.

Context:
- Source repo: ${source.repo}
- Source path: ${source.path || "N/A"}
- Why interesting: ${instruction.why}
- Minimal slice to implement: ${minimalSlice}
- Implementation should go to: ${relative(ROOT, targetFile)}
- Fit category: ${fit} (sidecar=optional module, skill=preset prompt, technique=novel standalone trick)${existingCode}

First read the competitor docs at docs/research/competitors/ to understand the full context.
Then read the source code from tmp/harvest/ if available.

Implement the MINIMAL version of this technique for Meow:
- Keep it under 50-100 lines if possible
- Only implement the core trick, not the full feature
- It should integrate with Meow's existing architecture (sidecars, skills, techniques)
- Follow Meow's existing code patterns (check src/sidecars/ and src/skills/)

Write the implementation to: ${relative(ROOT, targetFile)}
Also create or update a doc comment at the top explaining what was harvested and from where.

Report:
IMPLEMENTED: <file path> if you wrote a file
SKIPPED: <reason> if it doesn't fit or is too complex
FAIL: <reason> if you tried but failed`;

  const implResult = await claudeTask(implPrompt, `harvest-${name}`);

  // Step 5: Verify and record
  console.log(`\n[5/6] Verifying implementation...`);
  const implemented = existsSync(targetFile);
  const newContent = implemented ? readFileSync(targetFile, "utf-8") : "";

  if (implemented && newContent.length > 50) {
    console.log(`  ✅ Implemented: ${relative(ROOT, targetFile)} (${newContent.length} chars)`);
    updateTechniqueStatus(name, "implemented", {
      implementedAt: timestamp(),
      implementationPath: relative(ROOT, targetFile),
      learnedAt: timestamp(),
    });

    // Update docs/harvest/ with status
    const harvestDoc = join(HARVEST_DOCS, `${name}.md`);
    if (existsSync(harvestDoc)) {
      let content = readFileSync(harvestDoc, "utf-8");
      if (!content.includes("status: implemented")) {
        content = content.replace(/^status:.*/m, "status: implemented");
        content += `\n\nImplemented: ${relative(ROOT, targetFile)} (${timestamp()})`;
        writeFileSync(harvestDoc, content);
      }
    }
  } else if (implResult.includes("SKIPPED")) {
    const reason = implResult.match(/SKIPPED:\s*(.+)/)?.[1] || "Too complex or doesn't fit";
    console.log(`  ⏭️  Skipped: ${reason}`);
    updateTechniqueStatus(name, "skipped", { skippedReason: reason });
  } else {
    console.log(`  ⚠️  Implementation not found or too short`);
    updateTechniqueStatus(name, "pending", { notes: "Implementation attempt, needs review" });
  }

  // Step 6: Cleanup cloned repo (optional — keep for now for re-harvest)
  console.log(`\n[6/6] Keeping clone at ${relative(ROOT, cloneDir)} for potential re-harvest`);

  return { success: true, implemented };
}

// ============================================================================
// OODA Loop
// ============================================================================

async function runHarvest(options: { once?: boolean; list?: boolean; report?: boolean }): Promise<void> {
  ensureDir(ROOT);
  ensureDir(TMP_HARVEST);
  ensureDir(WISDOM_HARVEST);
  ensureDir(TECHNIQUES_DIR);

  const wisdom = loadHarvestWisdom();
  const instructions = getHarvestInstructions();

  if (options.list) {
    console.log(`\n🐾 HARVEST CANDIDATES (${instructions.length})\n`);
    for (const instr of instructions) {
      const w = wisdom.techniques[instr.name];
      const status = w?.status || "new";
      const icon = status === "implemented" ? "✅" : status === "skipped" ? "⏭️" : status === "learning" ? "🌱" : "📋";
      console.log(`  ${icon} ${instr.name} (${instr.fit})`);
      console.log(`      ${instr.why.slice(0, 70)}...`);
      console.log(`      Source: ${instr.source.repo}`);
      console.log();
    }
    return;
  }

  if (options.report) {
    printHarvestReport();
    return;
  }

  console.log(`
${"🐾".repeat(30)}
  MEOW HARVEST — Learning from the ecosystem
  ${instructions.length} techniques available
  ${wisdom.totalImplemented} implemented | ${wisdom.totalSkipped} skipped
${"🐾".repeat(30)}
`);

  // Pick next pending technique
  const pending = instructions.filter(
    (i) => !wisdom.techniques[i.name] || wisdom.techniques[i.name].status === "pending"
  );

  if (pending.length === 0) {
    console.log("  ✅ No pending techniques to harvest!");
    return;
  }

  // Pick by complexity (easiest first — antifragile: start small)
  pending.sort((a, b) => a.complexity - b.complexity);

  const chosen = pending[0];
  console.log(`\n  🎯 Selected: ${chosen.name} (complexity: ${chosen.complexity}/5)`);

  const result = await learnFromRepo(chosen);

  if (options.once) {
    console.log(`\n📊 Harvest iteration complete. Success: ${result.success}`);
    return;
  }

  // Brief pause then check for more
  await new Promise((r) => setTimeout(r, 2000));
}

// ============================================================================
// Report
// ============================================================================

function printHarvestReport(): void {
  const wisdom = loadHarvestWisdom();
  const techniques = Object.values(wisdom.techniques);
  const implemented = techniques.filter((t) => t.status === "implemented");
  const skipped = techniques.filter((t) => t.status === "skipped");
  const pending = techniques.filter((t) => t.status === "pending" || t.status === "learning");

  console.log(`
🐾 HARVEST REPORT
══════════════════════════════════════════════════════════════
  Last harvest: ${wisdom.lastHarvest}

  SUMMARY
  ────────────────────────────────────────────────────────────
  Implemented: ${implemented.length}
  Skipped: ${skipped.length}
  Pending: ${pending.length}
  `);

  if (implemented.length > 0) {
    console.log(`
  IMPLEMENTED
  ────────────────────────────────────────────────────────────`);
    for (const t of implemented) {
      console.log(`  ✅ ${t.name}`);
      console.log(`     → ${t.implementationPath}`);
      console.log(`     Source: ${t.source}`);
      console.log();
    }
  }

  if (skipped.length > 0) {
    console.log(`
  SKIPPED
  ────────────────────────────────────────────────────────────`);
    for (const t of skipped) {
      console.log(`  ⏭️  ${t.name}: ${t.skippedReason || "didn't fit"}`);
    }
    console.log();
  }

  console.log(`══════════════════════════════════════════════════════════════
`);
}

// ============================================================================
// CLI Entry
// ============================================================================

const args = process.argv.slice(2);

if (args.includes("--list")) {
  runHarvest({ list: true });
} else if (args.includes("--report")) {
  runHarvest({ report: true });
} else {
  const once = args.includes("--once");
  runHarvest({ once });
}
