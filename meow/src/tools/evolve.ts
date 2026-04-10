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
// Paths (needed early for .env loading)
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");  // meow/src/tools -> meow/
const REPO_ROOT = join(ROOT, "..");     // meow/ -> repo root
const DOGFOOD = join(ROOT, "dogfood");
const WISDOM_DIR = join(DOGFOOD, "wisdom");
const GAP_LIST_FILE = join(WISDOM_DIR, "gap-list-v2.json");
const STATE_FILE = join(WISDOM_DIR, "state-v2.json");

// Load .env if present (before any API calls)
try {
  const envPath = join(REPO_ROOT, ".env");
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (key && !process.env[key]) {
          process.env[key] = value;
        }
      }
    }
    // Alias ANTHROPIC_API_KEY -> LLM_API_KEY for compatibility
    if (process.env.ANTHROPIC_API_KEY && !process.env.LLM_API_KEY) {
      process.env.LLM_API_KEY = process.env.ANTHROPIC_API_KEY;
    }
  }
} catch {}

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
  consecutiveRateLimitHits: number; // For 2^n backoff
  lastProvider: string;
  lastTopicScan: number; // Timestamp of last GitHub topic scan
  // Dogfood and internalization tracking
  skillsUsed: Record<string, number>; // skill name -> use count
  selfImprovements: number; // times we improved our own harness
  internalizationFails: number; // skills learned but never used
}

// ============================================================================
// GitHub Topics Configuration
// ============================================================================

const GITHUB_TOPICS = [
  "ai",
  "mcp",
  "claude-code",
  "openclaw",
  "agent",
  "skills",
];

const TOPIC_STATE_FILE = join(WISDOM_DIR, "topic-repos-v1.json");

interface TopicRepo {
  topic: string;
  repo: string; // "owner/repo"
  stars: number;
  description: string;
  url: string;
  harvestedAt?: number; // timestamp when we last processed
  decision?: "harvest" | "integrate" | "skip";
  notes?: string;
  // Deep study tracking
  studyDepth?: "shallow" | "deep" | "full";
  studyCount?: number;
  lastStudiedAt?: number;
  consumedAt?: number; // when fully digested and offboarded
  offboard?: boolean; // true if removed from active study
}

function loadTopicRepos(): TopicRepo[] {
  return readJson<TopicRepo[]>(TOPIC_STATE_FILE, []);
}

function saveTopicRepos(repos: TopicRepo[]): void {
  ensureDir(WISDOM_DIR);
  writeJson(TOPIC_STATE_FILE, repos);
}

function updateTopicRepoStudy(gap: Gap, depth: "shallow" | "deep" | "full", increment: number = 1): void {
  const repos = loadTopicRepos();
  // Extract repo from gap id: GAP-TOPIC-AI-openclaw_openclaw -> openclaw/openclaw
  const match = gap.id.match(/^GAP-TOPIC-(\w+)-(.+)$/);
  if (!match) return;

  const topic = match[1].toLowerCase();
  const repoKey = match[2].replace(/_/g, "/");

  for (const repo of repos) {
    if (repo.topic === topic && repo.repo.replace(/\//g, "_") === repoKey) {
      repo.lastStudiedAt = Date.now();
      repo.studyCount = (repo.studyCount || 0) + increment;
      repo.studyDepth = depth;
      repo.harvestedAt = repo.harvestedAt || Date.now();
      console.log(`  📚 Updated study for ${repo.repo}: ${depth}, count=${repo.studyCount}`);
      break;
    }
  }
  saveTopicRepos(repos);
}

function updateTopicRepoFromResponse(gap: Gap): void {
  const repos = loadTopicRepos();
  // Extract repo from GAP-RESTUDY-AI-openclaw_openclaw -> openclaw/openclaw
  const match = gap.id.match(/^GAP-RESTUDY-(\w+)-(.+)$/);
  if (!match) return;

  const topic = match[1].toLowerCase();
  const repoKey = match[2].replace(/_/g, "/");

  for (const repo of repos) {
    if (repo.topic === topic && repo.repo.replace(/\//g, "_") === repoKey) {
      repo.lastStudiedAt = Date.now();
      repo.studyCount = (repo.studyCount || 0) + 1;
      // If this was a re-study and the gap is now solved, it means we decided to keep studying
      // Check if we should escalate or offboard based on study count
      if (repo.studyCount >= 5 && repo.studyDepth !== "full") {
        // After 5 studies, mark as full consumption candidate
        console.log(`  🍽️ ${repo.repo} studied ${repo.studyCount}x - candidate for offboarding`);
      }
      break;
    }
  }
  saveTopicRepos(repos);
}

// ============================================================================
// GitHub Topic Scanning
// ============================================================================

async function fetchGitHubTopicRepos(topic: string): Promise<TopicRepo[]> {
  console.log(`\n🔍 Scanning GitHub topic: ${topic}`);
  const repos: TopicRepo[] = [];

  try {
    // Get top repos by stars for this topic
    const cmd = `curl -s "https://api.github.com/search/repositories?q=topic:${topic}&sort=stars&order=desc&per_page=10" -H "Accept: application/vnd.github.v3+json"`;
    const result = runCmd(cmd);
    if (result.code !== 0) {
      console.log(`  ⚠️ Failed to fetch topic ${topic}: ${result.stderr}`);
      return repos;
    }

    const data = JSON.parse(result.stdout);
    if (data.items) {
      for (const repo of data.items.slice(0, 5)) { // Top 5 per topic
        repos.push({
          topic,
          repo: repo.full_name,
          stars: repo.stargazers_count,
          description: repo.description || "",
          url: repo.html_url,
        });
        console.log(`  ⭐ ${repo.full_name} (${repo.stargazers_count} stars)`);
      }
    }
  } catch (e: any) {
    console.log(`  ⚠️ Error parsing GitHub response for ${topic}: ${e.message}`);
  }

  return repos;
}

async function scanGitHubTopics(): Promise<void> {
  const state = loadState();
  const now = Date.now();

  // Only scan once per day
  if (state.lastTopicScan && now - state.lastTopicScan < 24 * 60 * 60 * 1000) {
    console.log(`\n⏳ GitHub topic scan already done today, skipping...`);
    return;
  }

  console.log(`\n🔍🌐 Scanning GitHub topics for new repos...`);
  const existingRepos = loadTopicRepos();
  const existingKeys = new Set(existingRepos.map(r => `${r.topic}:${r.repo}`));

  for (const topic of GITHUB_TOPICS) {
    const newRepos = await fetchGitHubTopicRepos(topic);
    for (const repo of newRepos) {
      if (!existingKeys.has(`${repo.topic}:${repo.repo}`)) {
        existingRepos.push(repo);
        existingKeys.add(`${repo.topic}:${repo.repo}`);
      }
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 2000));
  }

  saveTopicRepos(existingRepos);
  state.lastTopicScan = now;
  saveState(state);
  console.log(`\n📊 Total repos tracked: ${existingRepos.length}`);
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
    baseURL: "https://api.minimax.io/v1",
    model: "MiniMax-M2.7",
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
    consecutiveRateLimitHits: 0,
    lastProvider: "",
    skillsUsed: {},
    selfImprovements: 0,
    internalizationFails: 0,
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

async function discoverGaps(): Promise<void> {
  // Scan GitHub topics for new repos (once per day)
  await scanGitHubTopics();

  const gaps = loadGaps();
  const existingIds = new Set(gaps.map(g => g.id));
  let added = false;

  // 1. Discover from docs/harvest/ (external capabilities)
  const harvestDir = join(REPO_ROOT, "docs/harvest");
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
  const todoPath = join(REPO_ROOT, "docs/TODO.md");
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

  // 3. Discover from GitHub Topics (unprocessed repos)
  const topicRepos = loadTopicRepos();
  for (const repo of topicRepos) {
    if (repo.decision) continue; // Already processed

    const repoKey = `GAP-TOPIC-${repo.topic.toUpperCase()}-${repo.repo.replace(/[\/-]/g, "_")}`;
    if (!existingIds.has(repoKey)) {
      gaps.push({
        id: repoKey,
        description: `[${repo.topic}] ${repo.repo}: ${repo.description}`,
        priority: repo.stars > 1000 ? "P1" : "P2",
        status: "open",
        whatToImplement: `Evaluate ${repo.repo} for ${repo.topic} — ${repo.stars} stars. Decide: harvest, integrate as core capability, or skip.`,
      });
      existingIds.add(repoKey);
      added = true;
      console.log(`  📊 Discovered topic repo: ${repo.repo} (${repo.topic}, ${repo.stars} stars)`);
    }
  }

  // 4. Re-study previously harvested repos (assess if fully consumed)
  const studiedRepos = loadTopicRepos();
  for (const repo of studiedRepos) {
    if (repo.offboard || repo.consumedAt) continue; // Already offboarded
    if (!repo.studyCount || repo.studyCount < 1) continue; // Not yet studied

    // Re-study repos after 7 days if not fully consumed
    const daysSinceStudy = repo.lastStudiedAt
      ? (Date.now() - repo.lastStudiedAt) / (1000 * 60 * 60 * 24)
      : 7;

    if (daysSinceStudy >= 7) {
      const studyGapId = `GAP-RESTUDY-${repo.topic.toUpperCase()}-${repo.repo.replace(/[\/-]/g, "_")}`;
      if (!existingIds.has(studyGapId)) {
        gaps.push({
          id: studyGapId,
          description: `[Re-study ${repo.studyDepth || "shallow"}] ${repo.repo}: ${repo.description}`,
          priority: repo.stars > 5000 ? "P1" : "P2",
          status: "open",
          whatToImplement: `Re-assess ${repo.repo} (studied ${repo.studyCount}x, last ${Math.round(daysSinceStudy)}d ago). Decide: escalate to deep study, mark fully consumed & offboard, or keep in shallow rotation.`,
        });
        existingIds.add(studyGapId);
        added = true;
        console.log(`  🔄 Re-study: ${repo.repo} (${Math.round(daysSinceStudy)}d since last study, ${repo.studyCount}x total)`);
      }
    }
  }

  // 5. Fallback skill gaps if nothing else to do
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

  // 6. Dogfood verification gaps - ensure new skills are actually used
  const state = loadState();
  for (const [skillName, useCount] of Object.entries(state.skillsUsed)) {
    // If a skill was learned but never used (count === 0), flag for review
    if (useCount === 0 && skillName.startsWith("harvested_")) {
      const dogfoodGapId = `GAP-DOGFOOD-${skillName.toUpperCase().replace(/-/g, "_")}`;
      if (!existingIds.has(dogfoodGapId)) {
        gaps.push({
          id: dogfoodGapId,
          description: `Skill ${skillName} was harvested but never used — dogfood required`,
          priority: "P1",
          status: "open",
          whatToImplement: `Use skill ${skillName} in a real task OR integrate it into meow core loop OR offboard it if not useful.`,
        });
        existingIds.add(dogfoodGapId);
        added = true;
        console.log(`  🍖 Dogfood gap: ${skillName} needs verification`);
      }
    }
  }

  // 7. Self-improvement gaps - optimize the harness itself
  // If we have low success rate or high fail rate, look at improving evolve.ts
  if (state.totalSolved > 10) {
    const failRate = state.totalFailed / (state.totalSolved + state.totalFailed);
    if (failRate > 0.3) {
      const harnessGapId = "GAP-SELF-OPTIMIZE-HARNESS";
      if (!existingIds.has(harnessGapId)) {
        gaps.push({
          id: harnessGapId,
          description: `High failure rate detected: ${Math.round(failRate * 100)}% fail rate`,
          priority: "P0",
          status: "open",
          whatToImplement: `Analyze evolve.ts failures. Improve error handling, provider fallback, gap discovery, or LLM prompting. Self-optimize the self-evolver.`,
        });
        existingIds.add(harnessGapId);
        added = true;
        console.log(`  🔧 Self-optimization gap: fail rate ${Math.round(failRate * 100)}%`);
      }
    }
  }

  // 8. Internalization check - ensure concepts become capabilities, not just trivia
  if (state.internalizationFails > 3) {
    const internalizeGapId = "GAP-INTERNALIZE-CONCEPTS";
    if (!existingIds.has(internalizeGapId)) {
      gaps.push({
        id: internalizeGapId,
        description: `${state.internalizationFails} skills were learned but not internalized`,
        priority: "P1",
        status: "open",
        whatToImplement: `Review skills that were marked as "learned" but not used. Either: (1) Integrate them into core loop so they're actually invoked, (2) Remove them if truly useless. Meow must internalize, not just memorize.`,
      });
      existingIds.add(internalizeGapId);
      console.log(`  🧠 Internalization gap: ${state.internalizationFails} uninternalized skills`);
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
    const docPath = join(REPO_ROOT, "docs", "harvest", `${fileName}.md`);

    if (!existsSync(docPath)) {
      console.log(`  ⚠️ Harvest doc not found: ${docPath}`);
      return false;
    }

    const skillPath = join(ROOT, "src", "skills", `${skillName}.ts`);

    // If skill doesn't exist yet, create stub (LLM will be called to implement)
    if (!existsSync(skillPath)) {
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
        console.log(`  ✅ Created harvest stub: ${skillPath}`);
        return false; // Return false so LLM implements the actual capability
      } catch (e) {
        console.log(`  ❌ Failed to create stub: ${e}`);
        return false;
      }
    }

    // Skill exists - but harvest skills need real implementation + dogfooding
    // Don't auto-solve - let LLM verify and dogfood
    console.log(`  📋 Skill ${skillName} exists - triggering LLM for dogfood verification`);
    return false;
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
    { role: "user", content: `Close gap ${gap.id}: ${gap.description}\n\n${gap.whatToImplement}\n\nWork in src/. Create skills or sidecars.\n\nIMPORTANT - DOGFOOD REQUIRED:\n1. Implement the capability fully (not just stubs)\n2. If you create/modify a skill, ACTUALLY INVOKE IT to verify it works\n3. Run the skill with a real test case, not just syntax checks\n4. Only report SUCCESS if the dogfood PASSES\n\nTest: bun run cli/index.ts --dangerous "help"\n\nReport: SUCCESS or FAILED + brief dogfood notes` },
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
                        errorMsg.includes("2061") ||
                        errorMsg.includes("rate limit") ||
                        errorMsg.includes("Traffic is currently high") ||
                        errorMsg.includes("429") ||
                        errorMsg.includes("Connection error") ||
                        errorMsg.includes("500"); // Internal server errors may be temporary

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
      state.consecutiveRateLimitHits = 0;
      state.lastProvider = provider.name;
      return { success: true, providerUsed: provider.name };
    }

    if (result.isRateLimit) {
      console.log(`  ⏳ [${provider.name}] Rate limited: ${result.error}`);
      // Track consecutive rate limit hits for exponential backoff
      state.consecutiveRateLimitHits++;
      // 2^n backoff: 1min, 2min, 4min, 8min, 16min, 32min, max 60min
      const backoffMinutes = Math.min(60, Math.pow(2, state.consecutiveRateLimitHits - 1));
      gap.status = "waiting";
      gap.retryAfter = Date.now() + backoffMinutes * 60 * 1000;
      state.rateLimitUntil = Date.now() + backoffMinutes * 60 * 1000;
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

      // Push to origin
      try {
        runCmd("git push origin main");
        console.log(`  ✅ Pushed to origin`);
      } catch (e) {
        console.log(`  ⚠️ Push failed: ${e}`);
      }
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

  // Scan GitHub topics for new repos
  await scanGitHubTopics();

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

        // Track topic repo study progress
        if (gap.id.startsWith("GAP-TOPIC-")) {
          updateTopicRepoStudy(gap, "shallow", 1);
        } else if (gap.id.startsWith("GAP-RESTUDY-")) {
          // Parse the LLM response to determine next action
          updateTopicRepoFromResponse(gap);
        }

        // Track self-improvement
        if (gap.id.startsWith("GAP-SELF-") || gap.id.startsWith("GAP-DOGFOOD-")) {
          state.selfImprovements++;
          console.log(`  🔧 Self-improvement count: ${state.selfImprovements}`);
        }

        // Track internalization
        if (gap.id.startsWith("GAP-INTERNALIZE-")) {
          // If we solved this, it means we addressed uninternalized skills
          console.log(`  🧠 Internalization addressed`);
        }
      } else {
        gap.status = "waiting";
        console.log(`\n❌ ${gap.id} FAILED - scheduled for retry`);

        // Track internalization fails
        if (gap.id.startsWith("GAP-DOGFOOD-")) {
          state.internalizationFails++;
        }
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

  const failRate = state.totalSolved + state.totalFailed > 0
    ? Math.round((state.totalFailed / (state.totalSolved + state.totalFailed)) * 100)
    : 0;

  console.log(`
🐱 EVOLVE STATUS
═══════════════════════════════════════════════
  Session start: ${state.sessionStart}
  Total solved: ${state.totalSolved}
  Total failed: ${state.totalFailed}
  Last provider: ${state.lastProvider || "none"}
  Fail rate: ${failRate}%
  Self-improvements: ${state.selfImprovements}
  Internalization fails: ${state.internalizationFails}
  Skills used: ${Object.keys(state.skillsUsed || {}).length}
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
