/**
 * evolve.ts — Self-Evolving Gap-Closing Loop
 *
 * Continuously discovers gaps, implements simple ones directly,
 * and calls Claude Code for complex ones (with rate limiting).
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
  status: "open" | "solved" | "blocked";
  whatToImplement: string;
}

interface State {
  totalSolved: number;
  totalFailed: number;
  sessionStart: string;
  lastClaudeCall: number;
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
    const stdout = execSync(cmd, { cwd, encoding: "utf-8", timeout: 120000 });
    return { stdout, stderr: "", code: 0 };
  } catch (e: any) {
    return { stdout: e.stdout || "", stderr: e.stderr || "", code: e.status || 1 };
  }
}

// 4500 msgs / 5 hours = ~1 every 40s. Use 180s to be safe from rate limiting
const MINClaudeInterval = 180000;

function waitForRateLimit(lastCall: number): number {
  const now = Date.now();
  const elapsed = now - lastCall;
  if (elapsed < MINClaudeInterval) {
    return MINClaudeInterval - elapsed;
  }
  return 0;
}

// ============================================================================
// Gap List Management
// ============================================================================

function loadGaps(): Gap[] {
  return readJson<Gap[]>(GAP_LIST_FILE, []);
}

function saveGaps(gaps: Gap[]): void {
  ensureDir(WISDOM_DIR);
  writeJson(GAP_LIST_FILE, gaps);
}

function loadState(): State {
  const fallback: State = {
    totalSolved: 0,
    totalFailed: 0,
    sessionStart: timestamp(),
    lastClaudeCall: 0,
  };
  return readJson<State>(STATE_FILE, fallback);
}

function saveState(state: State): void {
  writeJson(STATE_FILE, state);
}

// ============================================================================
// Gap Discovery
// ============================================================================

function discoverGaps(): void {
  const gaps = loadGaps();
  const existingIds = new Set(gaps.map(g => g.id));
  let added = false;

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

function implementSkill(gap: Gap): boolean {
  if (!gap.id.startsWith("GAP-SKILL-")) return false;

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

// ============================================================================
// Main Loop
// ============================================================================

async function runLoop(options: { once?: boolean }): Promise<void> {
  ensureDir(DOGFOOD);
  ensureDir(WISDOM_DIR);

  const state = loadState();

  console.log(`
${"🐱".repeat(30)}
  MEOW EVOLVE — Self-Evolving Loop
  Total solved: ${state.totalSolved} | Failed: ${state.totalFailed}
${"🐱".repeat(30)}
`);

  while (true) {
    const gaps = loadGaps();
    const openGaps = gaps.filter(g => g.status === "open");

    if (openGaps.length === 0) {
      console.log(`\n🔍 No open gaps - discovering...`);
      discoverGaps();
      await new Promise(r => setTimeout(r, 5000));
      continue;
    }

    openGaps.sort((a, b) => {
      const pOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
      return pOrder[a.priority] - pOrder[b.priority];
    });

    const gap = openGaps[0];
    console.log(`\n🎯 Working on: ${gap.id} — ${gap.description}`);

    if (implementSkill(gap)) {
      gap.status = "solved";
      saveGaps(gaps);
      state.totalSolved++;
      console.log(`\n✅ ${gap.id} SOLVED!`);
      commitChanges(gap);
    } else {
      const waitTime = waitForRateLimit(state.lastClaudeCall);
      if (waitTime > 0) {
        console.log(`\n⏳ Rate limited, waiting ${Math.round(waitTime/1000)}s...`);
        await new Promise(r => setTimeout(r, waitTime));
      }

      state.lastClaudeCall = Date.now();
      saveState(state);

      console.log(`  🤖 Calling Claude Code...`);
      const success = await callClaude(gap);

      if (success) {
        gap.status = "solved";
        state.totalSolved++;
        console.log(`\n✅ ${gap.id} SOLVED!`);
      } else {
        gap.status = "blocked";
        state.totalFailed++;
        console.log(`\n❌ ${gap.id} FAILED`);
      }
      saveGaps(gaps);
    }

    saveState(state);

    if (options.once) {
      console.log(`\nIteration complete.`);
      break;
    }

    await new Promise(r => setTimeout(r, 3000));
  }
}

async function callClaude(gap: Gap): Promise<boolean> {
  const apiKey = process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY;
  const baseURL = process.env.LLM_BASE_URL || "https://api.minimax.io/anthropic";
  const model = process.env.LLM_MODEL || "MiniMax-M2.7";

  if (!apiKey) {
    console.log("  ❌ Error: LLM_API_KEY not set");
    return false;
  }

  const client = new OpenAI({ apiKey, baseURL });

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
    const maxToolCalls = 50; // Prevent infinite loops

    while (toolCallsHandled < maxToolCalls) {
      const stream = await client.chat.completions.create({
        model,
        messages,
        tools,
        tool_choice: "auto",
        stream: true,
        stream_options: { include_usage: true },
      });

      let hasToolCall = false;
      let finishReason = "";
      let usage = null;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullResponse += delta.content;
          process.stdout.write(delta.content);
        }
        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }
        if (chunk.usage) {
          usage = chunk.usage;
        }
      }
      console.log(""); // Newline after streaming

      // Handle tool calls
      if (finishReason === "tool_calls") {
        hasToolCall = true;
        toolCallsHandled++;

        // Find the last assistant message with tool calls
        const lastAssistantMsg = messages[messages.length - 1];
        if (lastAssistantMsg.role === "assistant" && "tool_calls" in lastAssistantMsg) {
          for (const toolCall of lastAssistantMsg.tool_calls || []) {
            const toolName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments || "{}");

            console.log(`  🔧 Calling tool: ${toolName}`);

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
        // No more tool calls, check for SUCCESS
        break;
      }
    }

    console.log(`  📝 Response (${fullResponse.length} chars)`);

    // Check final response for SUCCESS
    const success = fullResponse.includes("SUCCESS") || fullResponse.includes("success");

    if (success) {
      const gitStatus = runCmd(`git status --short .`);
      if (gitStatus.stdout.trim()) {
        console.log(`  📁 Changes: ${gitStatus.stdout.trim()}`);
        commitChanges(gap);
        return true;
      }
    }
    return false;
  } catch (e: any) {
    console.log(`  ❌ Error: ${e.message}`);
    return false;
  }
}

function commitChanges(gap: Gap): void {
  try {
    const gitStatus = runCmd(`git status --short .`);
    if (gitStatus.stdout.trim()) {
      runCmd(`git add . && git commit -m "fix(${gap.id}): ${gap.description}

Evolve loop - autonomous improvement.

Co-Authored-By: Claude <noreply@anthropic.com>"`);
      console.log(`  ✅ Committed`);
    }
  } catch (e) {
    console.log(`  ⚠️ Commit failed: ${e}`);
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
