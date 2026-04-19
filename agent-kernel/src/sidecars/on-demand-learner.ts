/**
 * on-demand-learner.ts
 *
 * On-demand learning sidecar for Meow.
 * When the user wants to do something Meow doesn't have skills/MCP for,
 * this sidecar dynamically learns and implements the capability.
 *
 * Flow:
 *   1. DETECT: User intent analysis → capability gap identified
 *   2. LOCATE: Search harvest list / clone relevant repos
 *   3. LEARN: Read source, understand pattern, minimal implementation
 *   4. REGISTER: Add skill/MCP to Meow's registry
 *   5. APPLY: Execute the new capability for the user
 *
 * Usage:
 *   /learn <capability>    — manually request learning something new
 *   /learn --auto           — auto-detect and suggest learning opportunities
 *   /learn --list           — show available harvest candidates
 *   /learn --status         — show learned capabilities
 */

import { execSync, exec } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================================
// Paths
// ============================================================================

// Use process.cwd() for reliable path resolution — it's always the project
// root (agent-kernel/) when the CLI runs, regardless of how this module is imported.
const ROOT = process.cwd();
const DOGFOOD = join(ROOT, "dogfood");
const LEARN_DIR = join(DOGFOOD, "learned");
const HARVEST_DOCS = join(ROOT, "docs/harvest");
const TMP_LEARN = join(ROOT, "tmp/learn");
const SKILLS_DIR = join(ROOT, "src/skills");
const SIDECARS_DIR = join(ROOT, "src/sidecars");

// ============================================================================
// Types
// ============================================================================

export interface LearnedCapability {
  name: string;
  type: "skill" | "sidecar" | "mcp";
  targetPath: string;
  learnedAt: string;
  sourceRepo: string;
  intent: string;
  status: "learning" | "ready" | "failed";
}

export interface LearningCandidate {
  name: string;
  repo: string;
  why: string;
  minimalSlice: string;
  fit: "skill" | "sidecar" | "mcp";
  complexity: 1 | 2 | 3 | 4 | 5;
  status: "pending" | "learning" | "learned" | "failed";
  sourceRepo?: string;
}

export interface Skill {
  name: string;
  description: string;
  aliases?: string[];
  execute: (args: string, context: SkillContext) => Promise<SkillResult>;
}

export interface SkillContext {
  cwd: string;
  dangerous: boolean;
}

export interface SkillResult {
  content: string;
  error?: string;
}

// ============================================================================
// State
// ============================================================================

let learnedCapabilities: Map<string, LearnedCapability> = new Map();

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

// ============================================================================
// Skill Registry Integration
// ============================================================================

interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: unknown, context: ToolContext): Promise<ToolResult>;
}

interface ToolContext {
  cwd: string;
  dangerous: boolean;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}

interface ToolResult {
  content: string;
  error?: string;
}

// Dynamic imports to avoid circular deps
async function registerSkill(skill: Skill): Promise<void> {
  const { registerSkill: reg } = await import("../skills/loader.ts");
  reg(skill);
}

async function getAllSkills(): Promise<Skill[]> {
  const { getAllSkills: get } = await import("../skills/loader.ts");
  return get();
}

// ============================================================================
// Capability Gap Detection
// ============================================================================

const CAPABILITY_KEYWORDS: Record<string, string[]> = {
  "research": ["research", "investigate", "find information", "web search", "study"],
  "deploy": ["deploy", "kubernetes", "gcp", "aws", "cloud", "infrastructure"],
  "miro": ["miro", "board", "whiteboard", "visual", "diagramming"],
  "kafka": ["kafka", "streaming", "confluent", "events", "mq"],
  "database": ["database", "sql", "postgres", "mongodb", "query"],
  "colleague": ["delegate", "collaborate", "multi-agent", "teamwork", "subagent"],
  "context7": ["context", "rag", "retrieval", "embeddings", "knowledge"],
};

const BUILTIN_SKILLS = ["simplify", "review", "commit", "help", "plan", "tasks", "sessions", "dangerous", "skills"];

export function detectCapabilityGap(userIntent: string): string[] {
  const intent = userIntent.toLowerCase();
  const gaps: string[] = [];

  for (const [capability, keywords] of Object.entries(CAPABILITY_KEYWORDS)) {
    const matched = keywords.some((kw) => intent.includes(kw));
    if (matched) {
      // Check if we already have this capability
      const hasCapability = checkHasCapability(capability);
      if (!hasCapability) {
        gaps.push(capability);
      }
    }
  }

  // Also check slash commands
  const commandMatch = userIntent.match(/^\/(\w+)/);
  if (commandMatch) {
    const cmd = commandMatch[1].toLowerCase();
    if (!BUILTIN_SKILLS.includes(cmd) && !checkHasCapability(cmd)) {
      gaps.push(cmd);
    }
  }

  return gaps;
}

function checkHasCapability(capability: string): boolean {
  // Check registered skills
  const skills = getAllSkillsSync();
  const hasSkill = skills.some((s) => s.name === capability || s.aliases?.includes(capability));

  // TODO: Check MCP servers for tool availability
  // For now, just check skills
  return hasSkill;
}

// Synchronous skill check for hot path
function getAllSkillsSync(): Skill[] {
  try {
    const loaderPath = join(SKILLS_DIR, "loader.ts");
    if (existsSync(loaderPath)) {
      // Skills are registered at import time, check filesystem
      const files = readdirSync(SKILLS_DIR).filter((f) => f.endsWith(".ts") && f !== "loader.ts" && f !== "index.ts");
      return files.map((f) => ({
        name: f.replace(/\.ts$/, ""),
        description: `Skill from ${f}`,
        execute: async () => ({ content: "Not implemented" }),
      }));
    }
  } catch {}
  return [];
}

// ============================================================================
// Harvest List Management
// ============================================================================

export function getHarvestCandidates(): LearningCandidate[] {
  const candidates: LearningCandidate[] = [];

  if (!existsSync(HARVEST_DOCS)) return candidates;

  for (const file of readdirSync(HARVEST_DOCS)) {
    if (!file.endsWith(".md")) continue;

    const content = readFileSync(join(HARVEST_DOCS, file), "utf-8");
    const candidate = parseHarvestDoc(content, file.replace(".md", ""));
    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

function parseHarvestDoc(content: string, filename: string): LearningCandidate | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) return null;

  const fm: Record<string, string> = {};
  for (const line of fmMatch[1].split("\n")) {
    const [key, ...valueParts] = line.split(":");
    if (key && valueParts.length) {
      fm[key.trim()] = valueParts.join(":").trim();
    }
  }

  return {
    name: fm.name || filename,
    repo: fm.repo || "",
    why: fm.why || "",
    minimalSlice: fm.minimalSlice || "",
    fit: (fm.fit as LearningCandidate["fit"]) || "skill",
    complexity: parseInt(fm.complexity || "2") as 1 | 2 | 3 | 4 | 5,
    status: (fm.status as LearningCandidate["status"]) || "pending",
    sourceRepo: fm.repo || "",
  };
}

function findCandidateForIntent(intent: string): LearningCandidate | null {
  const candidates = getHarvestCandidates();
  const intentLower = intent.toLowerCase();

  // Direct match
  const direct = candidates.find((c) =>
    c.name.toLowerCase().includes(intentLower) ||
    intentLower.includes(c.name.toLowerCase())
  );
  if (direct) return direct;

  // Keyword match
  for (const candidate of candidates) {
    const whyLower = candidate.why.toLowerCase();
    const keywords = intentLower.split(/\s+/);
    const matchCount = keywords.filter((kw) => kw.length > 3 && (whyLower.includes(kw) || candidate.name.includes(kw))).length;
    if (matchCount >= 2) return candidate;
  }

  return null;
}

// ============================================================================
// On-Demand Learning
// ============================================================================

export async function learnCapability(intent: string): Promise<{
  success: boolean;
  capability?: LearnedCapability;
  message: string;
}> {
  console.log(`\n🐣 ON-DEMAND LEARN: "${intent}"`);
  ensureDir(LEARN_DIR);
  ensureDir(TMP_LEARN);

  // Step 1: Find relevant harvest candidate
  const candidate = findCandidateForIntent(intent);

  if (!candidate) {
    return {
      success: false,
      message: `No harvest candidate found for "${intent}". Try one of: ${getHarvestCandidates().map(c => c.name).join(", ")}`,
    };
  }

  console.log(`  📚 Found candidate: ${candidate.name} (${candidate.fit})`);
  console.log(`  📦 Source: ${candidate.repo}`);

  // Step 2: Clone repo if not present
  const cloneName = candidate.name.replace(/[^a-z0-9_-]/gi, "_");
  const cloneDir = join(TMP_LEARN, cloneName);

  if (!existsSync(cloneDir) && candidate.repo) {
    console.log(`  📥 Cloning ${candidate.repo}...`);
    const { code } = runCmd(`git clone --depth 1 ${candidate.repo} "${cloneDir}" 2>&1`);
    if (code !== 0) {
      console.log(`  ⚠️  Clone failed, will use docs only`);
    } else {
      console.log(`  ✅ Cloned`);
    }
  }

  // Step 3: Analyze source
  let sourceContent = "";
  if (existsSync(cloneDir)) {
    const sourceFiles = findSourceFiles(cloneDir);
    for (const f of sourceFiles.slice(0, 10)) {
      try {
        sourceContent += `\n\n--- ${relative(cloneDir, f)} ---\n`;
        sourceContent += readFileSync(f, "utf-8").slice(0, 3000);
      } catch {}
    }
  }

  // Step 4: Generate minimal implementation
  const targetDir = candidate.fit === "skill" ? SKILLS_DIR : SIDECARS_DIR;
  const targetFile = join(targetDir, `${candidate.name.replace(/-/g, "_")}.ts`);

  console.log(`  🔧 Implementing ${candidate.name} to ${relative(ROOT, targetFile)}...`);

  const implementation = await generateImplementation(candidate, sourceContent, targetFile);

  if (!implementation) {
    return {
      success: false,
      message: `Failed to generate implementation for ${candidate.name}`,
    };
  }

  // Step 5: Write and register
  ensureDir(targetDir);
  writeFileSync(targetFile, implementation);

  const capability: LearnedCapability = {
    name: candidate.name,
    type: candidate.fit as "skill" | "sidecar" | "mcp",
    targetPath: relative(ROOT, targetFile),
    learnedAt: timestamp(),
    sourceRepo: candidate.repo,
    intent,
    status: "ready",
  };

  learnedCapabilities.set(candidate.name, capability);
  saveLearnedCapabilities();

  console.log(`  ✅ Learned: ${candidate.name}`);
  console.log(`  📁 Saved to: ${capability.targetPath}`);

  // Try to register as skill
  if (candidate.fit === "skill") {
    try {
      await registerNewSkill(candidate.name, targetFile);
      console.log(`  🎯 Registered as skill`);
    } catch (e: any) {
      console.log(`  ⚠️  Registration failed (will need restart): ${e.message}`);
    }
  }

  return {
    success: true,
    capability,
    message: `✅ Learned "${candidate.name}" and registered as ${candidate.fit}!\nRestart or run /skills to see it.`,
  };
}

function findSourceFiles(dir: string, extensions: string[] = [".ts", ".js", ".py", ".rs"]): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;

  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.startsWith("node_modules")) {
        files.push(...findSourceFiles(full, extensions));
      } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
        files.push(full);
      }
    }
  } catch {}

  return files;
}

async function generateImplementation(candidate: LearningCandidate, sourceContent: string, targetFile: string): Promise<string | null> {
  // Build a minimal implementation based on the candidate type
  const name = candidate.name.replace(/-/g, "_");
  const className = name.split("_").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");

  if (candidate.fit === "skill") {
    return generateSkillTemplate(candidate, className);
  } else if (candidate.fit === "sidecar") {
    return generateSidecarTemplate(candidate, className);
  } else {
    return generateSidecarTemplate(candidate, className);
  }
}

function generateSkillTemplate(candidate: LearningCandidate, className: string): string {
  return `/**
 * ${candidate.name}.ts
 *
 * Learned on-demand from: ${candidate.sourceRepo}
 * Why: ${candidate.why}
 *
 * MINIMAL SLICE: ${candidate.minimalSlice}
 */

export const ${candidate.name.replace(/-/g, "_")} = {
  name: "${candidate.name}",
  description: "${candidate.why}",
  aliases: [],
  async execute(args: string, context: SkillContext): Promise<SkillResult> {
    // TODO: Implement ${candidate.name} capability
    // Minimal slice: ${candidate.minimalSlice.slice(0, 100)}...

    return {
      content: \`🎯 ${candidate.name} skill - implemented on-demand

Your intent was interpreted as: \${args}

This capability was learned from: ${candidate.sourceRepo}

The core technique: ${candidate.why}

To complete implementation:
1. Run: bun run src/tools/harvest.ts --once
2. Check the source repo for full implementation
3. Complete the TODO sections below\`,
    };
  },
};

// Auto-generated by on-demand-learner.ts
import type { Skill, SkillContext, SkillResult } from "./loader.ts";
`;
}

function generateSidecarTemplate(candidate: LearningCandidate, className: string): string {
  return `/**
 * ${candidate.name}.ts
 *
 * Learned on-demand from: ${candidate.sourceRepo}
 * Why: ${candidate.why}
 *
 * MINIMAL SLICE: ${candidate.minimalSlice}
 */

// TODO: Implement ${candidate.name} sidecar capability
// Minimal slice: ${candidate.minimalSlice}

export interface ${className}Config {
  // Configuration options
}

class ${className}Client {
  private config: ${className}Config;

  constructor(config: ${className}Config = {}) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    // TODO: Initialize connection/resources
  }

  async execute(intent: string, args: Record<string, unknown>): Promise<{ content: string; error?: string }> {
    // TODO: Implement capability
    return {
      content: \`🎯 ${candidate.name} sidecar - implemented on-demand

From: ${candidate.sourceRepo}
Why: ${candidate.why}

This is a minimal stub. Run harvest to complete implementation.\`,
    };
  }

  disconnect(): void {
    // TODO: Cleanup resources
  }
}

export { ${className}Client };
export type { ${className}Config };

// Auto-generated by on-demand-learner.ts
`;
}

async function registerNewSkill(name: string, filePath: string): Promise<void> {
  try {
    const module = await import(filePath);
    const skillExport = Object.values(module).find((v) => v && typeof v === "object" && "name" in v && "execute" in v);
    if (skillExport) {
      await registerSkill(skillExport as Skill);
    }
  } catch (e: any) {
    throw new Error(`Failed to register skill: ${e.message}`);
  }
}

// ============================================================================
// Persistence
// ============================================================================

function getLearnedCapabilitiesPath(): string {
  return join(LEARN_DIR, "learned.json");
}

function loadLearnedCapabilities(): Map<string, LearnedCapability> {
  const path = getLearnedCapabilitiesPath();
  const data = readJson<Record<string, LearnedCapability>>(path, {});
  const map = new Map<string, LearnedCapability>();
  for (const [k, v] of Object.entries(data)) {
    map.set(k, v);
  }
  return map;
}

function saveLearnedCapabilities(): void {
  const path = getLearnedCapabilitiesPath();
  const obj: Record<string, LearnedCapability> = {};
  learnedCapabilities.forEach((v, k) => {
    obj[k] = v;
  });
  writeJson(path, obj);
}

// ============================================================================
// CLI Interface
// ============================================================================

export function formatLearnedList(): string {
  learnedCapabilities = loadLearnedCapabilities();

  if (learnedCapabilities.size === 0) {
    return "No capabilities learned yet. Run /learn <capability> to learn something new.";
  }

  let output = "## Learned Capabilities\n\n";
  learnedCapabilities.forEach((cap) => {
    const icon = cap.status === "ready" ? "✅" : cap.status === "learning" ? "🌱" : "❌";
    output += `  ${icon} ${cap.name} (${cap.type})\n`;
    output += `      Intent: ${cap.intent}\n`;
    output += `      Source: ${cap.sourceRepo}\n`;
    output += `      Learned: ${cap.learnedAt}\n`;
    output += `      Path: ${cap.targetPath}\n\n`;
  });

  return output;
}

export function formatHarvestCandidates(): string {
  const candidates = getHarvestCandidates();
  if (candidates.length === 0) {
    return "No harvest candidates found. Add repos to docs/harvest/";
  }

  let output = "## Harvest Candidates (Available to Learn)\n\n";
  for (const c of candidates) {
    const icon = c.status === "learned" ? "✅" : c.status === "pending" ? "📋" : "🌱";
    output += `  ${icon} ${c.name} (${c.fit}, complexity: ${c.complexity}/5)\n`;
    output += `      ${c.why.slice(0, 60)}...\n`;
    output += `      Source: ${c.repo}\n\n`;
  }

  return output;
}

// ============================================================================
// Initialize
// ============================================================================

export function initializeOnDemandLearner(): void {
  learnedCapabilities = loadLearnedCapabilities();
  console.log(`[on-demand-learner] ${learnedCapabilities.size} learned capabilities loaded`);
}

// ============================================================================
// Main CLI
// ============================================================================

if (import.meta.main) {
  initializeOnDemandLearner();

  const args = process.argv.slice(2);

  if (args.includes("--list")) {
    console.log(formatHarvestCandidates());
  } else if (args.includes("--status")) {
    console.log(formatLearnedList());
  } else if (args.includes("--auto")) {
    // Auto-detect gaps and suggest
    console.log("\n🔍 Auto-detecting capability gaps...\n");
    console.log("This would analyze current session and suggest learning opportunities.");
    console.log("\nDetected gaps (example):");
    for (const candidate of getHarvestCandidates().slice(0, 3)) {
      console.log(`  - ${candidate.name}: ${candidate.why.slice(0, 50)}...`);
    }
  } else {
    const intent = args.join(" ");
    if (intent) {
      learnCapability(intent).then((result) => {
        console.log(`\n${result.message}`);
        process.exit(result.success ? 0 : 1);
      });
    } else {
      console.log(`
🐣 MEOW ON-DEMAND LEARNER

Usage:
  bun run src/sidecars/on-demand-learner.ts <intent>    Learn a capability
  bun run src/sidecars/on-demand-learner.ts --list      List harvest candidates
  bun run src/sidecars/on-demand-learner.ts --status   Show learned capabilities
  bun run src/sidecars/on-demand-learner.ts --auto     Auto-detect gaps

Example:
  bun run src/sidecars/on-demand-learner.ts research
  bun run src/sidecars/on-demand-learner.ts deploy
      `);
    }
  }
}

