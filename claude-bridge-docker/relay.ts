#!/usr/bin/env bun
/**
 * relay.ts - Claude Bridge Docker Relay
 *
 * Docker-ready version of claude-bridge relay.
 * Bridges Discord → Claude Code → Discord reply.
 *
 * Features:
 * - Real-time streaming output to Discord (updates status as it runs)
 * - Smart background task detection
 * - Long-running task support (git clone, build, etc.)
 * - Human-like memory system (remembers users, goals, relationships)
 */

import { Client, GatewayIntentBits, ChannelType, type TextChannel, type Message } from "discord.js";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { MemoryStore } from "./memory.js";
import { getSkillContext } from "./skill-manager.js";

// ============================================================================
// Config
// ============================================================================

function loadEnv() {
  const envPath = join(process.cwd(), ".env");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[key]) process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();

// Parse CLI args
const cliArgs = process.argv.slice(2);
let argChannels: string[] = [];
let argPrefix = "";
let argMentionOnly = false;

for (let i = 0; i < cliArgs.length; i++) {
  if (cliArgs[i] === "--channel" && cliArgs[i + 1]) {
    argChannels.push(cliArgs[++i]);
  } else if (cliArgs[i] === "--prefix" && cliArgs[i + 1]) {
    argPrefix = cliArgs[++i];
  } else if (cliArgs[i] === "--mention-only") {
    argMentionOnly = true;
  }
}

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
if (!DISCORD_TOKEN) {
  console.error("[relay] DISCORD_TOKEN is required");
  process.exit(1);
}

const CLAUDE_CWD = process.env.CLAUDE_CWD || process.cwd();
const RELAY_CHANNELS = [
  ...argChannels,
  ...(process.env.RELAY_CHANNELS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
];
const RELAY_PREFIX = argPrefix || process.env.RELAY_PREFIX || "";
const RELAY_MENTION_ONLY = argMentionOnly || process.env.RELAY_MENTION_ONLY === "1";
const RELAY_TYPING = process.env.RELAY_TYPING !== "0";
const CLAUDE_TIMEOUT_MS = parseInt(process.env.CLAUDE_TIMEOUT_MS || "3600000");

// ============================================================================
// Memory Store - Human-like memory system
// ============================================================================

const MEMORY_DATA_DIR = join(CLAUDE_CWD, "data");
if (!existsSync(MEMORY_DATA_DIR)) {
  mkdirSync(MEMORY_DATA_DIR, { recursive: true });
}
const memory = new MemoryStore(MEMORY_DATA_DIR);

// Save memory periodically
setInterval(() => memory.save(), 30000);
process.on("SIGINT", () => { memory.save(); process.exit(0); });
process.on("SIGTERM", () => { memory.save(); process.exit(0); });

// ============================================================================
// Background task detection
// ============================================================================

// Only long-running operations that genuinely need progress feedback
const BG_KEYWORDS = [
  "git clone", "clone repository", "clone repo",
  "npm install", "pip install", "pip3 install", "cargo build", "cargo install",
  "apt install", "apk add", "yum install", "brew install",
  "make build", "make compile", "gradle build", "mvn build",
  "download ", "wget ", "curl -O", "curl -L",
  "deploy ", "scp ", "rsync",
  "archive ", "extract ", "unzip", "tar -",
];

function needsBackgroundProcessing(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return BG_KEYWORDS.some(k => lower.includes(k));
}

// ============================================================================
// Rate limiter
// ============================================================================

const lastReplyTime = new Map<string, number>();
const RATE_LIMIT_MS = 1000;

function isRateLimited(channelId: string): boolean {
  const last = lastReplyTime.get(channelId) ?? 0;
  return Date.now() - last < RATE_LIMIT_MS;
}

function markReplied(channelId: string) {
  lastReplyTime.set(channelId, Date.now());
}

// ============================================================================
// Conversation history (persistent)
// ============================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const CONVERSATION_HISTORY_LIMIT = 10;
const HISTORY_FILE = join(CLAUDE_CWD, "data", ".relay_history.json");

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// Per-channel conversation history
const channelHistory = new Map<string, ChatMessage[]>();

// Load history from disk on startup
function loadHistory() {
  try {
    // Ensure data directory exists
    const dataDir = join(CLAUDE_CWD, "data");
    if (!existsSync(dataDir)) {
      // Will be created when saving
      return;
    }
    if (existsSync(HISTORY_FILE)) {
      const data = JSON.parse(readFileSync(HISTORY_FILE, "utf-8"));
      for (const [channelId, messages] of Object.entries(data)) {
        channelHistory.set(channelId, messages);
      }
      console.log(`[relay] Loaded history for ${channelHistory.size} channels`);
    }
  } catch (e) {
    console.warn("[relay] Could not load history:", e);
  }
}

// Save history to disk
function saveHistory() {
  try {
    const dataDir = join(CLAUDE_CWD, "data");
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    const data: Record<string, ChatMessage[]> = {};
    for (const [channelId, messages] of channelHistory) {
      data[channelId] = messages;
    }
    writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn("[relay] Could not save history:", e);
  }
}

// Load history on startup
loadHistory();

// Save history periodically and on shutdown
setInterval(saveHistory, 30000); // Save every 30 seconds
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    saveHistory();
    process.exit(0);
  });
}

function addToHistory(channelId: string, role: "user" | "assistant", content: string) {
  let history = channelHistory.get(channelId) ?? [];
  history.push({ role, content, timestamp: Date.now() });
  // Keep only last N messages
  if (history.length > CONVERSATION_HISTORY_LIMIT) {
    history = history.slice(-CONVERSATION_HISTORY_LIMIT);
  }
  channelHistory.set(channelId, history);
  saveHistory(); // Persist after each change
}

// Load system prompt
let SYSTEM_PROMPT = "";
try {
  SYSTEM_PROMPT = readFileSync(join(process.cwd(), "SYSTEM_PROMPT.md"), "utf-8");
} catch {
  SYSTEM_PROMPT = "You are Meow, a helpful Discord relay bot.";
}

function buildContextPrompt(channelId: string, currentPrompt: string, username: string, userId: string): string {
  let contextPrompt = SYSTEM_PROMPT + "\n\n";

  // Add bond tone guidance
  const bondTone = memory.getBondTone(userId);
  contextPrompt += `## Your Relationship with This User\n`;
  contextPrompt += `Bond strength: ${Math.round(memory.getBondStrength(userId) * 100)}%\n`;
  contextPrompt += `Your tone should be: ${bondTone}\n`;
  const greeting = memory.getBondGreeting(userId, username);
  if (greeting) {
    contextPrompt += `Greeting to use: "${greeting}" (use naturally if appropriate)\n`;
  }
  contextPrompt += "\n";

  // Add human-like memory context (profile facts, goals, relationships)
  const userContext = memory.buildUserContext(userId, username);
  if (userContext) {
    contextPrompt += "## Memory of This Person\n";
    contextPrompt += userContext + "\n";
  }

  // Use hierarchical memory: compressed summaries + recent messages
  const threadContext = memory.getThreadContext(channelId, username);
  if (threadContext) {
    contextPrompt += threadContext;
  }

  // Add skill management context
  const skillContext = getSkillContext(CLAUDE_CWD);
  contextPrompt += skillContext + "\n";

  contextPrompt += `User Message: ${currentPrompt}\n\n(Sent by ${username} in Discord.)`;

  return contextPrompt;
}

// ============================================================================
// Message chunker
// ============================================================================

function chunkMessage(text: string, maxLen = 1900): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    let cut = maxLen;
    const nl = remaining.lastIndexOf("\n", maxLen);
    if (nl > maxLen * 0.5) cut = nl + 1;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  return chunks;
}

// ============================================================================
// Permission bloat filter
// ============================================================================

function isPermissionBloat(text: string): boolean {
  const lower = text.toLowerCase();
  const permissionPhrases = [
    "don't have discord", "don't have permission", "don't have discord reply",
    "hasn't been approved", "needs to be approved", "plugin needs to be approved",
    "plugin needs approval", "haven't approved", "haven't granted",
    "hasn't been granted", "permission to reply", "reply tool is pending",
    "reply tool needs", "mcp plugin needs", "discord plugin needs",
    "run /discord", "grant it so i can", "want me to reply",
    "want to grant", "you can approve", "approve it with", "can i reply",
  ];
  const isShort = text.length < 200;
  const hasPermissionPhrase = permissionPhrases.some(p => lower.includes(p));
  const hasSelfReference = lower.includes("i tried") || lower.includes("i'm unable") || lower.includes("i don't have");
  return isShort && hasPermissionPhrase && hasSelfReference;
}

// ============================================================================
// Skill installation executor
// ============================================================================

interface SkillInstallResult {
  success: boolean;
  output: string;
}

function execCommand(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { shell: true });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("close", (code) => resolve({ stdout, stderr, code: code ?? 0 }));
    proc.on("error", (err) => resolve({ stdout, stderr: err.message, code: 1 }));
    setTimeout(() => { proc.kill(); resolve({ stdout, stderr: "timeout", code: 124 }); }, 60000);
  });
}

async function executeSkillInstallCommands(claudeReply: string): Promise<SkillInstallResult | null> {
  const lower = claudeReply.toLowerCase();

  // Check if this reply is about skill installation
  if (!lower.includes("git clone") && !lower.includes("mkdir") && !lower.includes(".claude/skills")) {
    return null;
  }

  // Extract git clone URL
  const cloneMatch = claudeReply.match(/git clone\s+(https?:\/\/[^\s]+)/i);
  // Extract skill name from path
  const skillPathMatch = claudeReply.match(/\.claude\/skills\/([^\/\s]+)/i);

  if (!cloneMatch || !skillPathMatch) {
    return null;
  }

  const repoUrl = cloneMatch[1];
  const skillName = skillPathMatch[1];

  console.log(`[relay] Installing skill "${skillName}" from ${repoUrl}`);

  // Clone to temp directory
  const tmpPath = `/tmp/skill-repo-${Date.now()}`;
  const cloneResult = await execCommand("git", ["clone", "--depth", "1", repoUrl, tmpPath]);

  if (cloneResult.code !== 0) {
    return { success: false, output: `Clone failed: ${cloneResult.stderr}` };
  }

  // Check if SKILL.md exists
  const sourceSkillPath = `${tmpPath}/.claude/skills/${skillName}/SKILL.md`;
  const checkResult = await execCommand("test", ["-f", sourceSkillPath]);

  if (checkResult.code !== 0) {
    // Try alternate location
    const altPath = `${tmpPath}/SKILL.md`;
    const altResult = await execCommand("test", ["-f", altPath]);
    if (altResult.code !== 0) {
      await execCommand("rm", ["-rf", tmpPath]);
      return { success: false, output: `SKILL.md not found for skill "${skillName}"` };
    }
    // Install from alternate path using bash with sg appgroup for correct group
    const installCmd = `sg appgroup -c "mkdir -p /app/.claude/skills/${skillName} && cp ${tmpPath}/SKILL.md /app/.claude/skills/${skillName}/ && rm -rf ${tmpPath}"`;
    const installResult = await execCommand("bash", ["-c", installCmd]);
    return {
      success: installResult.code === 0,
      output: installResult.code === 0 ? `Skill "${skillName}" installed successfully!` : `Install failed: ${installResult.stderr}`
    };
  }

  // Install using bash with sg appgroup for correct group ownership
  try {
    const installCmd = `sg appgroup -c "mkdir -p /app/.claude/skills/${skillName} && cp ${tmpPath}/.claude/skills/${skillName}/SKILL.md /app/.claude/skills/${skillName}/ && rm -rf ${tmpPath}"`;
    const installResult = await execCommand("bash", ["-c", installCmd]);
    return {
      success: installResult.code === 0,
      output: installResult.code === 0 ? `Skill "${skillName}" installed successfully!` : `Install failed: ${installResult.stderr}`
    };
  } catch (e: any) {
    await execCommand("rm", ["-rf", tmpPath]);
    return { success: false, output: `Install error: ${e.message}` };
  }
}

// ============================================================================
// Claude Code Client
// ============================================================================

class ClaudeCodeClient {
  private claudeArgs = [
    "--output-format", "text",
    "--dangerously-skip-permissions",
    "--strict-mcp-config",
    "--mcp-config", join(CLAUDE_CWD, "mcp-null.json")
  ];

  async prompt(text: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const cliPath = process.env.CLAUDE_CLI_PATH ||
        (process.platform === "win32"
          ? "C:\\Users\\stanc\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js"
          : "/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js");

      const execPath = "node";
      const execArgs = [cliPath, ...this.claudeArgs, "-p", text];

      const proc = spawn(execPath, execArgs, {
        cwd: CLAUDE_CWD,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
        shell: false,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on("error", reject);

      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          if (stderr.trim()) console.warn(`[claude] Warning: ${stderr.trim()}`);
          resolve(stdout.trim());
        } else {
          const errMsg = stderr.trim() || `claude exited with code ${code}`;
          const clean = errMsg.replace(/\x1b\[[0-9;]*m/g, "");
          reject(new Error(clean));
        }
      });

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error(`Claude timed out after ${CLAUDE_TIMEOUT_MS/1000}s`));
      }, CLAUDE_TIMEOUT_MS);
    });
  }

  isAlive(): boolean {
    return true;
  }

  stop(): void {
    // Nothing to stop
  }
}

// ============================================================================
// Main Relay Loop
// ============================================================================

async function main() {
  console.log("[relay] Starting Claude Bridge Docker Relay...");
  console.log(`[relay] CWD: ${CLAUDE_CWD}`);
  console.log(`[relay] Watching channels: ${RELAY_CHANNELS.length > 0 ? RELAY_CHANNELS.join(", ") : "ALL"}`);
  if (RELAY_PREFIX) console.log(`[relay] Prefix filter: "${RELAY_PREFIX}"`);
  if (RELAY_MENTION_ONLY) console.log("[relay] Mode: mention-only");

  const claude = new ClaudeCodeClient();

  const discord = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
  });

  discord.once("clientReady", (client) => {
    console.log(`[relay] Discord connected as ${client.user.tag}`);
    console.log(`[relay] Ready! Listening for messages...`);
  });

  const processing = new Set<string>();

  discord.on("messageCreate", async (message: Message) => {
    if (message.author.bot) return;

    if (RELAY_CHANNELS.length > 0 && !RELAY_CHANNELS.includes(message.channelId)) return;
    if (RELAY_MENTION_ONLY && !message.mentions.has(discord.user!)) return;
    if (RELAY_PREFIX && !message.content.startsWith(RELAY_PREFIX)) return;
    if (isRateLimited(message.channelId)) return;
    if (processing.has(message.id)) return;
    processing.add(message.id);

    let promptText = message.content;

    if (discord.user) {
      promptText = promptText
        .replace(new RegExp(`^<@!?${discord.user.id}>\\s*`), "")
        .trim();
    }

    if (RELAY_PREFIX && promptText.startsWith(RELAY_PREFIX)) {
      promptText = promptText.slice(RELAY_PREFIX.length).trim();
    }

    if (!promptText) {
      processing.delete(message.id);
      return;
    }

    // Update memory: track user
    const userId = message.author.id;
    memory.updateLastSeen(userId, message.author.username);
    memory.incrementInteractions(userId);
    memory.updateSoulRelationship(userId, message.author.username, "");

    const fullPrompt = buildContextPrompt(message.channelId, promptText, message.author.username, userId);

    console.log(`[relay] → ${message.author.username}: ${promptText.slice(0, 80)}${promptText.length > 80 ? "..." : ""}`);

    try {
      // Start typing indicator interval for long responses
      let typingInterval: ReturnType<typeof setInterval> | null = null;
      if (RELAY_TYPING && message.channel.type === ChannelType.GuildText) {
        await (message.channel as TextChannel).sendTyping();
        typingInterval = setInterval(() => {
          (message.channel as TextChannel).sendTyping().catch(() => {
            if (typingInterval) clearInterval(typingInterval);
          });
        }, 4000);
      }

      // Add user message to history and memory before prompt
      addToHistory(message.channelId, "user", promptText);
      memory.addMessageToThread(message.channelId, userId, "user", promptText);
      memory.processConversationForFacts(userId, message.author.username, promptText, "");

      // Sync processing - typing indicator keeps user updated
      let reply = await claude.prompt(fullPrompt);
      if (typingInterval) clearInterval(typingInterval);
      markReplied(message.channelId);

      if (!reply) {
        console.log("[relay] ! Empty reply, skipping");
        processing.delete(message.id);
        return;
      }

      if (isPermissionBloat(reply)) {
        console.log("[relay] ! Permission error in reply, skipping");
        processing.delete(message.id);
        return;
      }

      // Try to execute skill installation commands from Claude's reply
      const installResult = await executeSkillInstallCommands(reply);
      if (installResult) {
        console.log(`[relay] Skill install: ${installResult.output}`);
        reply = reply.trim() + "\n\n✅ " + installResult.output;
      }

      // Add assistant reply to history and memory
      addToHistory(message.channelId, "assistant", reply);
      memory.addMessageToThread(message.channelId, userId, "meow", reply);

      console.log(`[relay] ← ${reply.slice(0, 80)}${reply.length > 80 ? "..." : ""}`);

      const chunks = chunkMessage(reply);
      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    } catch (e: any) {
      console.error(`[relay] Error processing ${message.id}:`, e.message);
      try {
        await message.reply(`❌ Error: ${e.message}`);
      } catch {
        // ignore
      }
    } finally {
      processing.delete(message.id);
    }
  });

  await discord.login(DISCORD_TOKEN);

  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      console.log("\n[relay] Shutting down...");
      claude.stop();
      discord.destroy();
      process.exit(0);
    });
  }
}

main().catch((e) => {
  console.error("[relay] Fatal:", e);
  process.exit(1);
});