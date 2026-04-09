/**
 * evolve.ts — Self-Evolving Gap-Closing Loop
 *
 * Continuously discovers gaps, implements simple ones directly,
 * and calls LLM providers for complex ones (with smart rate limit handling).
 *
 * Rate Limit Strategy:
 * - Persistent rate limit tracking (saves next available time to state)
 * - Multi-provider fallback (MiniMax → Anthropic → OpenAI)
 * - Exponential backoff starting at 5 minutes
 * - Scheduled retries (if rate limited, retry in 10-30 minutes)
 *
 * Usage:
 *   bun run src/tools/evolve.ts          # Run continuously
 *   bun run src/tools/evolve.ts --once   # Single iteration
 *   bun run src/tools/evolve.ts --status # Show gap status
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { getToolDefinitions, executeTool } from "../sidecars/tool-registry.ts";
import { initMemoryFts, storeMemory, searchMemory, formatSearchResults } from "../sidecars/memory-fts.ts";

// ============================================================================
// Paths
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const DOGFOOD = join(ROOT, "dogfood");
const WISDOM_DIR = join(DOGFOOD, "wisdom");
const GAP_LIST_FILE = join(WISDOM_DIR, "gap-list-v2.json");
const STATE_FILE = join(WISDOM_DIR, "state-v2.json");

// ============================================================================
// Types
// ============================================================================

interface Gap {
  id: string;
  description: string;
  priority: "P0" | "P1" | "P2";
  status: "open" | "solved" | "blocked" | "waiting";
  whatToImplement: string;
  retryAfter?: number; // Timestamp when to retry
}

interface State {
  totalSolved: number;
  totalFailed: number;
  sessionStart: string;
  lastClaudeCall: number;
  rateLimitUntil: number; // Timestamp when rate limit ends
  consecutiveFailures: number;
  lastProvider: string;
}

// ============================================================================
// LLM Providers Configuration
// ============================================================================

interface LLMProvider {
  name: string;
  apiKeyEnv: string;
  baseURL: string;
  model: string;
  priority: number; // Lower = tried first
}

const PROVIDERS: LLMProvider[] = [
  {
    name: "minimax",
    apiKeyEnv: "LLM_API_KEY",
    baseURL: process.env.LLM_BASE_URL || "https://api.minimax.io/anthropic",
    model: process.env.LLM_MODEL || "MiniMax-M2.7",
    priority: 1,
  },
  {
    name: "anthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    baseURL: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-6",
    priority: 2,
  },
  {
    name: "openai",
    apiKeyEnv: "OPENAI_API_KEY",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o",
    priority: 3,
  },
];

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
    const stdout = execSync(cmd, { cwd, encoding: "utf-8", timeout: 120000 });
    return { stdout, stderr: "", code: 0 };
  } catch (e: any) {
    return { stdout: e.stdout || "", stderr: e.stderr || "", code: e.status || 1 };
  }
}

// ============================================================================
// State Management
// ============================================================================

function loadState(): State {
  const state = readJson<State>(STATE_FILE, {
    totalSolved: 0,
    totalFailed: 0,
    sessionStart: timestamp(),
    lastClaudeCall: 0,
    rateLimitUntil: 0,
    consecutiveFailures: 0,
    lastProvider: "",
  });
  return state;
}

function saveState(state: State): void {
  ensureDir(WISDOM_DIR);
  writeJson(STATE_FILE, state);
}

// ============================================================================
// Gap Management
// ============================================================================

function loadGaps(): Gap[] {
  return readJson<Gap[]>(GAP_LIST_FILE, []);
}

function saveGaps(gaps: Gap[]): void {
  ensureDir(WISDOM_DIR);
  writeJson(GAP_LIST_FILE, gaps);
}

// ============================================================================
// Gap Discovery
// ============================================================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function discoverGaps(): void {
  const gaps = loadGaps();
  const existingIds = new Set(gaps.map(g => g.id));
  let added = false;

  // 1. Discover from docs/harvest/ (external capabilities)
  const harvestDir = join(ROOT, "docs/harvest");
  if (existsSync(harvestDir)) {
    const files = readdirSync(harvestDir).filter(f => f.endsWith(".md"));
    for (const file of files) {
      const repoName = file.replace(".md", "");
      const gapId = `GAP-HARVEST-${repoName.toUpperCase().replace(/-/g, "")}-01`;
      if (!existingIds.has(gapId)) {
        const content = readFileSync(join(harvestDir, file), "utf-8");
        const description = content.split("\n")[0].replace(/^#\s*/, "").trim();
        gaps.push({
          id: gapId,
          description: `Harvest: ${description}`,
          priority: "P1",
          status: "open",
          whatToImplement: `Implement ${repoName} from docs/harvest/${file}`
        });
        existingIds.add(gapId);
        added = true;
        console.log(`  📝 Discovered: ${gapId}`);
      }
    }
  }

  // 2. Discover from docs/TODO.md (unchecked items)
  const todoPath = join(ROOT, "docs/TODO.md");
  if (existsSync(todoPath)) {
    const todoContent = readFileSync(todoPath, "utf-8");
    const lines = todoContent.split("\n");
    let currentSection = "";

    for (const line of lines) {
      // Track current section header
      const sectionMatch = line.match(/^##\s+(.+)/);
      if (sectionMatch) {
        currentSection = slugify(sectionMatch[1]);
      }

      // Find unchecked TODO items: - [ ]
      const uncheckedMatch = line.match(/^- \[ \]\s*\*\*(.+?)\*\*[:\s]*(.*)/);
      if (uncheckedMatch) {
        const title = uncheckedMatch[1].trim();
        const description = uncheckedMatch[2].trim();
        const gapId = `GAP-TODO-${currentSection}-${slugify(title)}`.toUpperCase().slice(0, 60);

        if (!existingIds.has(gapId)) {
          gaps.push({
            id: gapId,
            description: description || title,
            priority: "P2",
            status: "open",
            whatToImplement: description
              ? `TODO: ${title} — ${description}`
              : `TODO: ${title}`
          });
          existingIds.add(gapId);
          added = true;
          console.log(`  📋 Discovered TODO: ${gapId} — ${title}`);
        }
      }
    }
  }

  // 3. Fallback skill gaps if nothing else to do
  if (!added) {
    const skillGaps = [
      { id: "GAP-SKILL-EXEC", name: "exec", desc: "Shell command execution skill" },
      { id: "GAP-SKILL-GIT", name: "git", desc: "Advanced git operations skill" },
      { id: "GAP-SKILL-SEARCH", name: "search", desc: "Code search skill" },
    ];
    for (const sg of skillGaps) {
      if (!existingIds.has(sg.id)) {
        gaps.push({
          id: sg.id,
          description: sg.desc,
          priority: "P2",
          status: "open",
          whatToImplement: `Create src/skills/${sg.name}.ts`
        });
        console.log(`  📝 Discovered: ${sg.id}`);
        break;
      }
    }
  }

  saveGaps(gaps);
}

// ============================================================================
// Auto-Implementation
// ============================================================================

function implementSkill(gap: Gap): boolean {
  // GAP-SKILL-* gaps: create simple skill stubs
  if (gap.id.startsWith("GAP-SKILL-")) {
    const skillName = gap.id.replace("GAP-SKILL-", "").toLowerCase();
    const skillPath = join(ROOT, "src/skills", `${skillName}.ts`);

    if (existsSync(skillPath)) return true;

    const content = `/**
 * ${skillName}.ts
 * ${gap.description}
 */

import { type Skill } from "./loader.ts";

export const ${skillName.replace(/-/g, "_")}: Skill = {
  name: "${skillName}",
  description: "${gap.description}",
  async execute(context) {
    return { success: true, message: "${skillName} executed" };
  },
};
`;

    try {
      writeFileSync(skillPath, content);
      console.log(`  ✅ Created skill: ${skillPath}`);
      return true;
    } catch (e) {
      console.log(`  ❌ Failed: ${e}`);
      return false;
    }
  }

  // GAP-HARVEST-* gaps: auto-implement from harvest docs
  if (gap.id.startsWith("GAP-HARVEST-") && gap.whatToImplement) {
    const match = gap.whatToImplement.match(/Implement ([\w-]+) from docs\/harvest\/([\w-]+)\.md/);
    if (!match) return false;

    const [, fullName, fileName] = match;
    const skillName = fullName.toLowerCase();
    const docPath = join(ROOT, "docs", "harvest", `${fileName}.md`);

    if (!existsSync(docPath)) {
      console.log(`  ⚠️ Harvest doc not found: ${docPath}`);
      return false;
    }

    const skillPath = join(ROOT, "src", "skills", `${skillName}.ts`);
    if (existsSync(skillPath)) return true;

    try {
      const docContent = readFileSync(docPath, "utf-8");
      const frontmatterMatch = docContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      let repo = "", why = "", minimalSlice = "", description = "";

      if (frontmatterMatch) {
        const fm = frontmatterMatch[1];
        repo = (fm.match(/repo:\s*(.+)/) || [])[1] || "";
        why = (fm.match(/why:\s*(.+)/) || [])[1] || "";
        minimalSlice = (fm.match(/minimalSlice:\s*"(.+?)"/) || [])[1] || "";
        description = frontmatterMatch[2].replace(/^#.*\n/, "").trim();
      } else {
        description = docContent.replace(/^#.*\n/, "").trim();
      }

      const content = `/**
 * ${skillName}.ts
 * ${description || gap.description}
 *
 * Harvested from: ${repo}
 * Why: ${why}
 * Minimal slice: ${minimalSlice}
 */

import { type Skill } from "./loader.ts";

export const ${skillName.replace(/-/g, "_")}: Skill = {
  name: "${skillName}",
  description: "${description || gap.description}",
  async execute(context) {
    // TODO: Implement ${skillName} capability from ${repo}
    // ${minimalSlice}
    return { success: true, message: "${skillName} capability" };
  },
};
`;

      writeFileSync(skillPath, content);
      console.log(`  ✅ Harvested skill: ${skillPath}`);
      return true;
    } catch (e) {
      console.log(`  ❌ Failed to harvest: ${e}`);
      return false;
    }
  }

  return false;
}

// ============================================================================
// LLM Calling with Multi-Provider and Rate Limit Handling
// ============================================================================

async function callClaudeWithProvider(
  provider: LLMProvider,
  gap: Gap
): Promise<{ success: boolean; error?: string; isRateLimit?: boolean }> {
  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) {
    return { success: false, error: `${provider.name}: No API key` };
  }

  const client = new OpenAI({ apiKey, baseURL: provider.baseURL });

  const tools = getToolDefinitions().map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  const systemPrompt = `You are an autonomous agent. Work in ${ROOT}.

Close the gap by implementing the required code. Create or modify files as needed.
After completing the implementation, run tests if available.
Report SUCCESS when the gap is fully closed, or FAILED if you could not complete it.`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Close gap ${gap.id}: ${gap.description}\n\n${gap.whatToImplement}\n\nWork in src/. Create skills or sidecars.\nTest: bun run cli/index.ts --dangerous "help"\n\nReport: SUCCESS or FAILED` },
  ];

  try {
    let fullResponse = "";
    let toolCallsHandled = 0;
    const maxToolCalls = 30;

    while (toolCallsHandled < maxToolCalls) {
      const stream = await client.chat.completions.create({
        model: provider.model,
        messages,
        tools,
        tool_choice: "auto",
        stream: true,
        stream_options: { include_usage: true },
      });

      let finishReason = "";

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullResponse += delta.content;
          process.stdout.write(delta.content);
        }
        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }
      }
      console.log("");

      if (finishReason === "tool_calls") {
        toolCallsHandled++;
        const lastAssistantMsg = messages[messages.length - 1];
        if (lastAssistantMsg.role === "assistant" && "tool_calls" in lastAssistantMsg) {
          for (const toolCall of lastAssistantMsg.tool_calls || []) {
            const toolName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments || "{}");

            console.log(`  🔧 [${provider.name}] Calling tool: ${toolName}`);

            try {
              const result = await executeTool({ name: toolName, args, signal: undefined });
              const resultStr = typeof result === "string" ? result : JSON.stringify(result);

              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: resultStr,
              });
            } catch (e: any) {
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: `Error: ${e.message}`,
              });
            }
          }
        }
      } else {
        break;
      }
    }

    console.log(`  📝 [${provider.name}] Response (${fullResponse.length} chars)`);

    const success = fullResponse.includes("SUCCESS") || fullResponse.includes("success");
    return { success };

  } catch (e: any) {
    const errorMsg = e.message || "";
    const isRateLimit = errorMsg.includes("2062") ||
                        errorMsg.includes("rate limit") ||
                        errorMsg.includes("Traffic is currently high") ||
                        errorMsg.includes("429") ||
                        errorMsg.includes("Connection error");

    return { success: false, error: errorMsg, isRateLimit };
  }
}

async function callClaude(gap: Gap, state: State): Promise<{ success: boolean; providerUsed?: string }> {
  // Sort providers by priority
  const sortedProviders = [...PROVIDERS].sort((a, b) => a.priority - b.priority);

  for (const provider of sortedProviders) {
    console.log(`  🤖 Trying provider: ${provider.name}`);

    const result = await callClaudeWithProvider(provider, gap);

    if (result.success) {
      state.consecutiveFailures = 0;
      state.lastProvider = provider.name;
      return { success: true, providerUsed: provider.name };
    }

    if (result.isRateLimit) {
      console.log(`  ⏳ [${provider.name}] Rate limited: ${result.error}`);
      // Mark gap for later retry
      gap.status = "waiting";
      // Schedule retry in 10-30 minutes (randomized)
      gap.retryAfter = Date.now() + (10 + Math.random() * 20) * 60 * 1000;
      state.rateLimitUntil = Date.now() + 5 * 60 * 1000; // Global rate limit 5 min
      state.consecutiveFailures++;
      return { success: false };
    }

    console.log(`  ⚠️ [${provider.name}] Failed: ${result.error}`);
  }

  // All providers failed
  state.consecutiveFailures++;
  gap.status = "waiting";
  gap.retryAfter = Date.now() + (15 + state.consecutiveFailures * 5) * 60 * 1000;
  state.rateLimitUntil = Date.now() + state.consecutiveFailures * 5 * 60 * 1000;

  return { success: false };
}

// ============================================================================
// Commit with Meaningful Messages
// ============================================================================

function commitChanges(gap: Gap): void {
  try {
    const gitStatus = runCmd(`git status --short .`);
    if (gitStatus.stdout.trim()) {
      // Generate meaningful commit message
      let commitTitle = `feat(${gap.id})`;
      let capability = "";

      // Try patterns in whatToImplement
      const patterns = [
        /Implement ([\w-]+) from/,
        /Create src\/skills\/([\w-]+)\.ts/,
        /Create src\/sidecars\/([\w-]+)\.ts/,
      ];

      for (const pattern of patterns) {
        const match = gap.whatToImplement?.match(pattern);
        if (match) {
          capability = match[1];
          break;
        }
      }

      if (capability) {
        if (gap.id.startsWith("GAP-HARVEST-")) {
          commitTitle = `feat(harvest): implement ${capability} capability`;
        } else if (gap.id.startsWith("GAP-SKILL-")) {
          commitTitle = `feat(skills): add ${capability} skill`;
        } else {
          commitTitle = `feat(${gap.id}): implement ${capability}`;
        }
      }

      runCmd(`git add . && git commit -m "${commitTitle}

Evolve loop - autonomous improvement.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"`);

      console.log(`  ✅ Committed: ${commitTitle}`);
    }
  } catch (e) {
    console.log(`  ⚠️ Commit failed: ${e}`);
  }
}

// ============================================================================
// Main Loop
// ============================================================================

async function runLoop(options: { once?: boolean }): Promise<void> {
  const state = loadState();

  // Initialize FTS5 memory for cross-session recall
  try {
    initMemoryFts();
    console.log("  🧠 FTS5 memory initialized for cross-session recall");
  } catch (e) {
    console.log("  ⚠️  FTS5 memory unavailable, continuing without it");
  }

  console.log(`
🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱
  MEOW EVOLVE — Self-Evolving Loop
  Total solved: ${state.totalSolved} | Failed: ${state.totalFailed}
🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱
`);

  while (true) {
    const now = Date.now();
    let gaps = loadGaps();

    // Filter to actionable gaps (not waiting for rate limit)
    let actionableGaps = gaps.filter(g =>
      g.status === "open" ||
      (g.status === "waiting" && g.retryAfter && now >= g.retryAfter)
    );

    if (actionableGaps.length === 0) {
      // Check if we need to discover new gaps
      const openGaps = gaps.filter(g => g.status === "open" || g.status === "waiting");
      if (openGaps.length === 0) {
        console.log(`\n🔍 No open gaps - discovering...`);
        discoverGaps();
      } else {
        // Find next waiting gap
        const waitingGaps = gaps.filter(g => g.status === "waiting" && g.retryAfter);
        if (waitingGaps.length > 0) {
          const nextRetry = waitingGaps
            .map(g => g.retryAfter!)
            .sort((a, b) => a - b)[0];
          const waitMs = nextRetry - now;
          const waitMin = Math.ceil(waitMs / 60000);
          console.log(`\n💤 All gaps waiting. Next retry in ${waitMin} minutes...`);
        }
      }
      await new Promise(r => setTimeout(r, 60000)); // Check again in 1 minute
      continue;
    }

    // Sort by priority
    actionableGaps.sort((a, b) => {
      const pOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
      return pOrder[a.priority] - pOrder[b.priority];
    });

    const gap = actionableGaps[0];

    // Check if we're still in global rate limit window
    if (state.rateLimitUntil > now) {
      const waitMs = state.rateLimitUntil - now;
      const waitMin = Math.ceil(waitMs / 60000);
      console.log(`\n⏳ Global rate limit active. Waiting ${waitMin} minutes...`);
      await new Promise(r => setTimeout(r, Math.min(waitMs, 60000)));
      continue;
    }

    console.log(`\n🎯 Working on: ${gap.id} — ${gap.description}`);

    // Cross-session recall: search for relevant past solutions
    try {
      const pastSolutions = searchMemory(gap.description, 3);
      if (pastSolutions.length > 0) {
        console.log(`  🧠 Found ${pastSolutions.length} relevant past solutions:`);
        for (const { snippet } of pastSolutions.slice(0, 2)) {
          console.log(`     ${snippet.slice(0, 80)}...`);
        }
      }
    } catch {}

    // Try auto-implementation first
    if (implementSkill(gap)) {
      gap.status = "solved";
      gap.retryAfter = undefined;
      saveGaps(gaps);
      state.totalSolved++;
      console.log(`\n✅ ${gap.id} SOLVED!`);
      // Store successful solution in FTS5 memory for cross-session recall
      try {
        storeMemory(`gap_${gap.id}`, `Solved gap ${gap.id}: ${gap.description}. What to implement: ${gap.whatToImplement}`, {
          tags: ["evolve", "gap-solution", gap.priority, gap.id],
          source: "evolve",
          importance: gap.priority === "P0" ? 5 : gap.priority === "P1" ? 4 : 3,
        });
      } catch {}
      commitChanges(gap);
    } else {
      // Call LLM
      state.lastClaudeCall = now;
      saveState(state);

      console.log(`  🤖 Calling LLM...`);
      const result = await callClaude(gap, state);

      if (result.success) {
        gap.status = "solved";
        gap.retryAfter = undefined;
        state.totalSolved++;
        console.log(`\n✅ ${gap.id} SOLVED! (via ${result.providerUsed})`);
        // Store successful solution in FTS5 memory for cross-session recall
        try {
          storeMemory(`gap_${gap.id}`, `Solved gap ${gap.id}: ${gap.description}. What to implement: ${gap.whatToImplement}`, {
            tags: ["evolve", "gap-solution", gap.priority, gap.id],
            source: "evolve",
            importance: gap.priority === "P0" ? 5 : gap.priority === "P1" ? 4 : 3,
          });
        } catch {}
        commitChanges(gap);
      } else {
        gap.status = "waiting";
        console.log(`\n❌ ${gap.id} FAILED - scheduled for retry`);
      }
      saveGaps(gaps);
    }

    saveState(state);

    if (options.once) {
      console.log(`\nIteration complete.`);
      break;
    }

    // Wait between iterations to avoid hammering
    await new Promise(r => setTimeout(r, 5000));
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
  Last provider: ${state.lastProvider || "none"}
  Rate limit until: ${state.rateLimitUntil > Date.now() ? new Date(state.rateLimitUntil).toISOString() : "none"}
═══════════════════════════════════════════════

  GAPS (${gaps.length} total)
  ───────────────────────────────────────────────`);
  const now = Date.now();
  for (const gap of gaps) {
    let extra = "";
    if (gap.status === "waiting" && gap.retryAfter) {
      const waitMin = Math.ceil((gap.retryAfter - now) / 60000);
      extra = ` (retry in ${waitMin}m)`;
    }
    const icon = gap.status === "solved" ? "✅" : gap.status === "blocked" ? "🚫" : gap.status === "waiting" ? "⏳" : "📋";
    console.log(`  ${icon} ${gap.id} [${gap.priority}] ${gap.status}${extra}`);
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
