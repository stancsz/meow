#!/usr/bin/env bun
/**
 * relay.ts - Agent Harness Relay
 *
 * Docker-ready version of agent-harness relay.
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
import { MemoryStore } from "./core/memory";
import { getSkillContext } from "./sidecars/skill-manager";
import { MeowAgentClient } from "./core/meow-agent";
import { logFallback, type FallbackLogEntry } from "./sidecars/fallback-logger";
import { TokenBuffer } from "../../agent-kernel/src/sidecars/streaming";

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
const RELAY_STREAMING = process.env.RELAY_STREAMING === "1";  // Enable real-time streaming
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
      for (const [channelId, messages] of Object.entries(data) as [string, ChatMessage[]][]) {
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
    for (const [channelId, messages] of channelHistory.entries()) {
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
  SYSTEM_PROMPT = readFileSync(join(process.cwd(), "docs", "prompt", "SYSTEM_PROMPT.md"), "utf-8");
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
// Code fence aware chunking - prevents flash/freeze bug
// See: cursor.com/changelog Apr 15, 2026
// "Fixed bug where agent conversations with diffs or code blocks would flash and freeze"
// ============================================================================

const CODE_FENCE = "```";

/**
 * Split text into chunks, keeping code fences intact.
 * This prevents the flash/freeze bug where Discord markdown
 * gets confused by partial code fences like "```co" split mid-block.
 */
function chunkMessageCodeFenceAware(text: string, maxLen = 1900): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];

  // Split by code fences first to keep them intact
  const parts: { type: "text" | "fence"; content: string }[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const fenceIdx = remaining.indexOf(CODE_FENCE);
    if (fenceIdx === -1) {
      // No more fences - rest is plain text
      if (remaining.length > 0) {
        parts.push({ type: "text", content: remaining });
      }
      break;
    }

    // Text before fence
    if (fenceIdx > 0) {
      parts.push({ type: "text", content: remaining.slice(0, fenceIdx) });
    }

    // Find closing fence
    const afterOpenFence = remaining.slice(fenceIdx + CODE_FENCE.length);
    const closeIdx = afterOpenFence.indexOf(CODE_FENCE);

    if (closeIdx === -1) {
      // Unclosed fence - treat rest as text
      parts.push({ type: "text", content: remaining.slice(fenceIdx) });
    } else {
      // Complete code block - include opening fence, content, and closing fence
      const fenceContent = remaining.slice(fenceIdx, fenceIdx + CODE_FENCE.length + closeIdx + CODE_FENCE.length);
      parts.push({ type: "fence", content: fenceContent });
      remaining = afterOpenFence.slice(closeIdx + CODE_FENCE.length);
    }
  }

  // Now chunk each part, keeping fences as atomic units
  for (const part of parts) {
    if (part.type === "fence") {
      // Code fences stay intact even if > maxLen
      // Discord will still render them, just might warn
      if (part.content.length > maxLen) {
        // Split long code blocks at reasonable boundaries (but keep fences)
        const innerContent = part.content.slice(CODE_FENCE.length, -CODE_FENCE.length);
        const langEnd = innerContent.indexOf("\n");
        const langLine = langEnd > 0 && langEnd < 50 ? innerContent.slice(0, langEnd + 1) : "";

        // Chunk the inner content
        const innerRemaining = langLine ? innerContent.slice(langLine.length) : innerContent;
        const innerChunks = chunkTextPortion(innerRemaining, maxLen - CODE_FENCE.length * 2 - (langLine?.length || 0));

        // Rebuild with fences
        chunks.push(CODE_FENCE + langLine);
        for (let i = 0; i < innerChunks.length; i++) {
          chunks.push(innerChunks[i]);
        }
        chunks.push(CODE_FENCE);
      } else {
        chunks.push(part.content);
      }
    } else {
      // Regular text - chunk it
      const textChunks = chunkTextPortion(part.content, maxLen);
      chunks.push(...textChunks);
    }
  }

  return chunks;
}

/**
 * Chunk text portion (not code fences) using newline-aware splitting.
 */
function chunkTextPortion(text: string, maxLen: number): string[] {
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

/**
 * Send chunks with rate limiting to prevent Discord rate limits
 * and reduce flash/freeze by spacing out messages.
 */
const CHUNK_DELAY_MS = 100; // 100ms between chunks (Cursor pattern)

async function sendChunksWithRateLimit(message: Message, chunks: string[]): Promise<void> {
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    await message.reply(chunk);

    // Rate limit between chunks, but not after the last one
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY_MS));
    }
  }
}

/**
 * Send streaming message with real-time token display.
 * Uses TokenBuffer for code fence aware buffering and updates Discord message as tokens arrive.
 */
async function sendStreamingMessage(
  meow: MeowAgentClient,
  message: Message,
  prompt: string,
  onToken: (token: string) => void
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    // Create token buffer with code fence awareness
    const tokenBuffer = new TokenBuffer(
      (bufferedText) => {
        // Flush callback - could send intermediate updates here
        // For now we just accumulate for final display
        onToken(bufferedText);
      },
      {
        bufferSize: 20,
        flushIntervalMs: 50,
        codeFenceAware: true,
      }
    );

    // Start with thinking indicator
    let responseMessage: Message;
    try {
      responseMessage = await message.reply("🐱 thinking...");
    } catch (e) {
      // Fallback if we can't send initial message
      reject(e);
      return;
    }

    // Collect full content
    let fullContent = "";

    // Stream via meow's promptStreaming
    try {
      fullContent = await meow.promptStreaming(prompt, (token) => {
        tokenBuffer.add(token);
        fullContent += token;
      });
    } catch (e: any) {
      // Edit the thinking message to show error
      try {
        await responseMessage.edit(`❌ Error: ${e.message.slice(0, 1800)}`);
      } catch { /* ignore */ }
      reject(e);
      return;
    }

    // Flush remaining buffer
    tokenBuffer.flush();

    // Edit the thinking message to show final response
    const chunks = chunkMessage(fullContent);
    if (chunks.length === 1) {
      // Single chunk - just edit the thinking message
      try {
        await responseMessage.edit(chunks[0]);
      } catch (e) {
        // If edit fails (content too old, etc), reply fresh
        await message.reply(chunks[0]);
      }
    } else {
      // Multiple chunks - delete thinking and send fresh
      try {
        await responseMessage.delete();
      } catch { /* ignore */ }
      await sendChunksWithRateLimit(message, chunks);
    }

    resolve(fullContent);
  });
}

// ============================================================================
// Message chunker (legacy - kept for compatibility)
// ============================================================================

function chunkMessage(text: string, maxLen = 1900): string[] {
  // Use code fence aware chunking
  return chunkMessageCodeFenceAware(text, maxLen);
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
  const os = await import("node:os");
  const tmpPath = join(os.tmpdir(), `skill-repo-${Date.now()}`);
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
    // Install from alternate path
    const isWin = process.platform === "win32";
    const installCmd = isWin 
      ? `powershell -Command "New-Item -ItemType Directory -Force -Path '${join(CLAUDE_CWD, ".claude/skills", skillName)}'; Copy-Item -Path '${join(tmpPath, "SKILL.md")}' -Destination '${join(CLAUDE_CWD, ".claude/skills", skillName)}'; Remove-Item -Recurse -Force -Path '${tmpPath}'"`
      : `sg appgroup -c "mkdir -p ${CLAUDE_CWD}/.claude/skills/${skillName} && cp ${tmpPath}/SKILL.md ${CLAUDE_CWD}/.claude/skills/${skillName}/ && rm -rf ${tmpPath}"`;
    const installResult = await execCommand(isWin ? "powershell" : "bash", ["-c", installCmd]);
    return {
      success: installResult.code === 0,
      output: installResult.code === 0 ? `Skill "${skillName}" installed successfully!` : `Install failed: ${installResult.stderr}`
    };
  }

  // Install using bash with sg appgroup for correct group ownership
  try {
    const isWin = process.platform === "win32";
    const installCmd = isWin
      ? `powershell -Command "New-Item -ItemType Directory -Force -Path '${join(CLAUDE_CWD, ".claude/skills", skillName)}'; Copy-Item -Path '${join(tmpPath, ".claude/skills", skillName, "SKILL.md")}' -Destination '${join(CLAUDE_CWD, ".claude/skills", skillName)}'; Remove-Item -Recurse -Force -Path '${tmpPath}'"`
      : `sg appgroup -c "mkdir -p ${CLAUDE_CWD}/.claude/skills/${skillName} && cp ${tmpPath}/.claude/skills/${skillName}/SKILL.md ${CLAUDE_CWD}/.claude/skills/${skillName}/ && rm -rf ${tmpPath}"`;
    const installResult = await execCommand(isWin ? "powershell" : "bash", ["-c", installCmd]);
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
// Backup command executor
// ============================================================================

interface BackupResult {
  success: boolean;
  output: string;
}

const SETTINGS_FILE = join(CLAUDE_CWD, "data", "settings.json");

function loadSettings(): Record<string, string> {
  try {
    if (existsSync(SETTINGS_FILE)) {
      return JSON.parse(readFileSync(SETTINGS_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

function saveSettings(settings: Record<string, string>) {
  try {
    const dataDir = join(CLAUDE_CWD, "data");
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error("[relay] Failed to save settings:", e);
  }
}

async function executeBackupCommands(promptText: string, reply: string): Promise<BackupResult | null> {
  const lowerPrompt = promptText.toLowerCase();
  const lowerReply = reply.toLowerCase();

  // Check if this is a backup request
  const isBackupRequest = lowerPrompt.includes("backup yourself") ||
                          lowerPrompt.includes("backup me") ||
                          lowerPrompt.includes("backup my");
  const isRestoreRequest = lowerPrompt.includes("restore");

  if (!isBackupRequest && !isRestoreRequest) {
    return null;
  }

  // Load current settings
  const settings = loadSettings();
  const backupRepo = process.env.BACKUP_REPO || settings.backupRepo;

  // Check if user provided a repo URL in their message
  const repoUrlMatch = promptText.match(/https?:\/\/github\.com\/[^\s\/]+\/[^\s\/]+/i);
  if (repoUrlMatch) {
    const providedUrl = repoUrlMatch[0].replace(/\.git$/i, "");
    settings.backupRepo = providedUrl;
    saveSettings(settings);
    console.log(`[relay] Saved backup repo: ${providedUrl}`);
  }

  // For restore, need BACKUP_REPO
  if (isRestoreRequest && !backupRepo && !repoUrlMatch) {
    return { success: false, output: "No backup repo configured. Please provide a backup repo URL first." };
  }

  // Execute backup
  if (isBackupRequest) {
    const repo = backupRepo || settings.backupRepo;
    if (!repo) {
      return { success: false, output: "I don't have a backup repo configured yet! Please provide your backup repo URL (e.g., https://github.com/username/meow-backup)" };
    }

    console.log(`[relay] Starting backup to ${repo}`);

    const os = await import("node:os");
    const tmpPath = join(os.tmpdir(), `meow-backup-${Date.now()}`);

    // Clone or init backup repo
    const cloneResult = await execCommand("git", ["clone", "--depth", "1", repo, tmpPath]);
    if (cloneResult.code !== 0) {
      // Repo might be empty or not exist - init fresh
      await execCommand("mkdir", ["-p", tmpPath]);
      await execCommand("sh", ["-c", `cd ${tmpPath} && git init && git remote add origin ${repo}`]);
    }

    // Sync data (exclude large files)
    const rsyncExcludes = "--exclude='.relay_history.json' --exclude='threads.backup.json' --exclude='*.log'";
    const isWin = process.platform === "win32";
    
    if (isWin) {
      await execCommand("powershell", ["-c", `New-Item -ItemType Directory -Force -Path '${join(tmpPath, "data")}'; Copy-Item -Path '${join(CLAUDE_CWD, "data", "*")}' -Destination '${join(tmpPath, "data")}' -Exclude '.relay_history.json','threads.backup.json','*.log'`]);
      await execCommand("powershell", ["-c", `New-Item -ItemType Directory -Force -Path '${join(tmpPath, ".claude/skills")}'; Copy-Item -Path '${join(CLAUDE_CWD, ".claude/skills", "*")}' -Destination '${join(tmpPath, ".claude/skills")}' -Recurse`]);
      await execCommand("powershell", ["-c", `Copy-Item -Path '${join(CLAUDE_CWD, ".gitignore")}' -Destination '${tmpPath}' -ErrorAction SilentlyContinue`]);
    } else {
      await execCommand("sh", ["-c", `rsync -a ${rsyncExcludes} ${CLAUDE_CWD}/data/ ${tmpPath}/data/`]);
      await execCommand("sh", ["-c", `rsync -a ${rsyncExcludes} ${CLAUDE_CWD}/.claude/skills/ ${tmpPath}/.claude/skills/`]);
      await execCommand("sh", ["-c", `cp ${CLAUDE_CWD}/.gitignore ${tmpPath}/ 2>/dev/null || true`]);
    }

    // Commit and push
    const commitResult = await execCommand("sh", ["-c", `cd ${tmpPath} && git add -A && git commit -m "Backup $(date -u '+%Y-%m-%d %H:%M UTC')" && git push origin main || git push -u origin main`]);

    await execCommand("rm", ["-rf", tmpPath]);

    if (commitResult.code !== 0) {
      return { success: false, output: `Backup failed: ${commitResult.stderr}` };
    }

    return { success: true, output: `✅ Backup complete! Pushed to ${repo}` };
  }

  // Execute restore
  if (isRestoreRequest) {
    const repo = backupRepo || settings.backupRepo;
    console.log(`[relay] Starting restore from ${repo}`);

    const os = await import("node:os");
    const tmpPath = join(os.tmpdir(), `meow-restore-${Date.now()}`);
    const cloneResult = await execCommand("git", ["clone", repo, tmpPath]);

    if (cloneResult.code !== 0) {
      return { success: false, output: `Restore failed: could not clone ${repo}` };
    }

    if (process.platform === "win32") {
      await execCommand("powershell", ["-c", `Copy-Item -Path '${join(tmpPath, "data", "*")}' -Destination '${join(CLAUDE_CWD, "data")}' -Recurse -Force`]);
      await execCommand("powershell", ["-c", `Copy-Item -Path '${join(tmpPath, ".claude/skills", "*")}' -Destination '${join(CLAUDE_CWD, ".claude/skills")}' -Recurse -Force -ErrorAction SilentlyContinue`]);
    } else {
      await execCommand("sh", ["-c", `rsync -a ${tmpPath}/data/ ${CLAUDE_CWD}/data/`]);
      await execCommand("sh", ["-c", `rsync -a ${tmpPath}/.claude/skills/ ${CLAUDE_CWD}/.claude/skills/ 2>/dev/null || true`]);
    }
    await execCommand("rm", ["-rf", tmpPath]);

    return { success: true, output: `✅ Restore complete! Memory and skills restored from ${repo}` };
  }

  return null;
}

// ============================================================================
// Claude Code Client
// ============================================================================

class ClaudeCodeClient {
  private getMcpConfig() {
    const isDocker = existsSync("/.dockerenv");
    if (isDocker && existsSync(join(CLAUDE_CWD, "mcp-bridge.json"))) {
      return join(CLAUDE_CWD, "mcp-bridge.json");
    }
    return join(CLAUDE_CWD, "mcp-null.json");
  }

  private primaryMcpConfig = this.getMcpConfig();
  private fallbackMcpConfig = join(CLAUDE_CWD, "mcp-null.json");

  async prompt(text: string): Promise<string> {
    return this.promptWithRetry(text, 0);
  }

  private async promptWithRetry(text: string, attempt: number): Promise<string> {
    const mcpConfig = attempt === 0 ? this.primaryMcpConfig : this.fallbackMcpConfig;
    const args = [
      "--output-format", "text",
      "--dangerously-skip-permissions",
      "--mcp-config", mcpConfig
    ];

    return new Promise((resolve, reject) => {
      const cliPath = process.env.CLAUDE_CLI_PATH ||
        (process.platform === "win32"
          ? "C:\\Users\\stanc\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js"
          : "/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js");

      const execPath = "node";
      const execArgs = [cliPath, ...args, "-p", text];

      const proc = spawn(execPath, execArgs, {
        cwd: CLAUDE_CWD,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, MEOW_TRUST_ALL: "1" },
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

          // If MCP error and haven't tried fallback, retry without MCP
          if (attempt === 0 && (clean.includes("MCP") || clean.includes("mcp"))) {
            console.warn(`[claude] MCP error detected, retrying without MCP: ${clean.slice(0, 100)}`);
            return this.promptWithRetry(text, 1).then(resolve).catch(reject);
          }

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
// Mission Management
// ============================================================================

interface Mission {
  id: string;
  title: string;
  description: string;
  goals: string[];
  status: "pending" | "in_progress" | "completed" | "cancelled";
  createdAt: number;
  updatedAt: number;
  checkInterval: number;
  channelId: string;
  iteration: number;
  lastCheck: number;
  completionPercent: number;
  evalHistory: Array<{
    timestamp: number;
    percent: number;
    findings: string;
    nextSteps: string;
  }>;
}

const MISSIONS_FILE = join(MEMORY_DATA_DIR, "missions.json");

function loadMissions(): Mission[] {
  try {
    if (existsSync(MISSIONS_FILE)) {
      const data = JSON.parse(readFileSync(MISSIONS_FILE, "utf-8"));
      return data.missions || [];
    }
  } catch {}
  return [];
}

function saveMissions(missions: Mission[]) {
  try {
    if (!existsSync(MEMORY_DATA_DIR)) {
      mkdirSync(MEMORY_DATA_DIR, { recursive: true });
    }
    writeFileSync(MISSIONS_FILE, JSON.stringify({ missions }, null, 2));
  } catch (e) {
    console.error("[relay] Failed to save missions:", e);
  }
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

function handleMissionCommand(prompt: string, message: Message): string | null {
  const lower = prompt.toLowerCase();

  // List missions
  if (lower.includes("list mission") || lower === "missions") {
    const missions = loadMissions();
    if (missions.length === 0) {
      return "📋 No missions yet! Say `create mission <title>` to start tracking.";
    }

    let response = "**📋 Active Missions:**\n\n";
    for (const m of missions.filter(m => m.status !== "cancelled")) {
      const emoji = m.completionPercent >= 100 ? "✅" : m.completionPercent >= 50 ? "🔄" : "⏳";
      const status = m.status === "completed" ? " [DONE]" : m.status === "in_progress" ? " [Active]" : "";
      response += `${emoji} **${m.title}**${status}\n`;
      response += `   ${m.completionPercent}% complete | ${m.goals.length} goals\n`;
      if (m.channelId) {
        response += `   Tracking since <t:${Math.floor(m.createdAt / 1000)}:R>\n`;
      }
      response += "\n";
    }
    return response;
  }

  // Create mission
  const createMatch = prompt.match(/create mission[s]?\s+(.+)/i);
  if (createMatch) {
    const title = createMatch[1].trim();
    const missions = loadMissions();
    const newMission: Mission = {
      id: generateId(),
      title,
      description: "",
      goals: [],
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      checkInterval: 600,
      channelId: message.channelId,
      iteration: 0,
      lastCheck: 0,
      completionPercent: 0,
      evalHistory: [],
    };
    missions.push(newMission);
    saveMissions(missions);
    return `🎯 **Mission created:** ${title}\n\nNow tell me the goals! What should this mission accomplish?\n\nExample: \`add goal to ${title}: build landing page with hero section\``;
  }

  // Add goal to mission
  const goalMatch = prompt.match(/add goal[s]?\s+to\s+(.+?):\s*(.+)/i);
  if (goalMatch) {
    const missionTitle = goalMatch[1].trim().toLowerCase();
    const goal = goalMatch[2].trim();
    const missions = loadMissions();
    const mission = missions.find(m => m.title.toLowerCase().includes(missionTitle));

    if (!mission) {
      return `Couldn't find mission "${missionTitle}". Try \`list missions\` to see active ones.`;
    }

    mission.goals.push(goal);
    mission.status = "in_progress";
    mission.updatedAt = Date.now();
    saveMissions(missions);

    return `✅ Added goal to **${mission.title}**:\n• ${goal}\n\nSay \`start mission ${mission.id.slice(0, 8)}\` when ready to begin tracking!`;
  }

  // Start mission (activate tracking)
  const startMatch = prompt.match(/start mission[s]?\s+(.+)/i);
  if (startMatch) {
    const idOrTitle = startMatch[1].trim();
    const missions = loadMissions();
    const mission = missions.find(m =>
      m.id.startsWith(idOrTitle) || m.title.toLowerCase().includes(idOrTitle.toLowerCase())
    );

    if (!mission) {
      return `Couldn't find mission "${idOrTitle}".`;
    }

    mission.status = "in_progress";
    mission.channelId = message.channelId;
    mission.updatedAt = Date.now();
    saveMissions(missions);

    return `🚀 **Mission started:** ${mission.title}\n\nI'll track this in the background and update you on progress. Goals:\n${mission.goals.map((g, i) => `${i + 1}. ${g}`).join("\n")}\n\nI'll check every ${mission.checkInterval / 60} minutes.`;
  }

  // Complete/cancel mission
  if (prompt.toLowerCase().includes("complete mission")) {
    const idOrTitle = prompt.replace(/complete mission[s]?/i, "").trim();
    const missions = loadMissions();
    const mission = missions.find(m =>
      m.id.startsWith(idOrTitle) || m.title.toLowerCase().includes(idOrTitle.toLowerCase())
    );

    if (!mission) {
      return `Couldn't find mission "${idOrTitle}".`;
    }

    mission.status = "completed";
    mission.updatedAt = Date.now();
    saveMissions(missions);
    return `✅ **Mission completed:** ${mission.title}\n\nFinal stats:\n• ${mission.iteration} evaluation cycles\n• ${mission.completionPercent}% completion\n\nGreat work! 🎉`;
  }

  if (prompt.toLowerCase().includes("cancel mission") || prompt.toLowerCase().includes("delete mission")) {
    const idOrTitle = prompt.replace(/cancel|delete mission[s]?/gi, "").trim();
    const missions = loadMissions();
    const idx = missions.findIndex(m =>
      m.id.startsWith(idOrTitle) || m.title.toLowerCase().includes(idOrTitle.toLowerCase())
    );

    if (idx < 0) {
      return `Couldn't find mission "${idOrTitle}".`;
    }

    const removed = missions.splice(idx, 1)[0];
    saveMissions(missions);
    return `🗑️ Mission **${removed.title}** cancelled.`;
  }

  // Mission status
  if (prompt.toLowerCase().includes("mission status") || prompt.toLowerCase().includes("how's my") || prompt.toLowerCase().includes("how is my")) {
    const missions = loadMissions().filter(m => m.status === "in_progress");
    if (missions.length === 0) {
      return "No active missions! Say `create mission <title>` to start.";
    }

    let response = "**🎯 Active Mission Status:**\n\n";
    for (const m of missions) {
      const emoji = m.completionPercent >= 100 ? "✅" : m.completionPercent >= 50 ? "🔄" : "⏳";
      response += `${emoji} **${m.title}** — ${m.completionPercent}%\n`;
      if (m.evalHistory.length > 0) {
        const latest = m.evalHistory[m.evalHistory.length - 1];
        response += `   Last: ${latest.findings.slice(0, 100)}...\n`;
      }
      response += "\n";
    }
    return response;
  }

  return null;
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

  const meow = new MeowAgentClient();
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

  // Start mission agent in background
  spawn("bun", ["run", "--watch", "src/agents/mission-agent.ts"], {
    cwd: process.cwd(),
    stdio: ["ignore", "inherit", "inherit"],
    detached: true,
    shell: false,
  });
  console.log("[relay] Mission agent started in background");

  // Start bun scheduler for JOB.md-based hourly jobs
  const orchestratorProc = spawn("bun", ["run", "jobs/bun-orchestrator.ts"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    shell: false,
  });
  orchestratorProc.stdout?.on("data", (chunk: Buffer) => {
    console.log(`[orchestrator] ${chunk.toString().trim()}`);
  });
  orchestratorProc.stderr?.on("data", (chunk: Buffer) => {
    console.error(`[orchestrator:err] ${chunk.toString().trim()}`);
  });
  console.log("[relay] Bun scheduler started in background");

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

    // Check for /auto command (start/stop/status auto-improvement daemon)
    if (promptText.startsWith("/auto")) {
      const args = promptText.slice(5).trim();
      const [action, ...missionParts] = args.split(/\s+/);
      const subcmd = action?.toLowerCase();
      const { startAutoDaemon, stopAutoDaemon, getAutoDaemonStatus, setMission, getMission, clearMission } = await import("./agents/auto-daemon");

      if (!subcmd || subcmd === "status") {
        const status = getAutoDaemonStatus();
        let msg = `Auto daemon: ${status.running ? "RUNNING" : "stopped"} | PID: ${status.pid ?? "n/a"}`;
        if (status.mission) msg += `\nMission: ${status.mission}`;
        await message.reply(msg);
      } else if (subcmd === "start") {
        const mission = missionParts.join(" ");
        if (mission) {
          setMission(mission);
          await message.reply(`Mission set: "${mission}"`);
        }
        const msg = startAutoDaemon();
        await message.reply(msg);
      } else if (subcmd === "stop") {
        clearMission();
        const msg = stopAutoDaemon();
        await message.reply(msg);
      } else if (subcmd === "mission") {
        const missionText = missionParts.join(" ");
        if (missionText) {
          setMission(missionText);
          await message.reply(`Mission set: "${missionText}"`);
        } else {
          const current = getMission();
          await message.reply(current ? `Current mission: ${current}` : "No mission set");
        }
      } else {
        await message.reply("Usage: `/auto [start|stop|status|mission]`\nStart with a mission: `/auto start research the gaps in meow and fix them`\nSet mission separately: `/auto mission fix the timeout bug in meow-run.ts`");
      }
      processing.delete(message.id);
      return;
    }

    // Check for mission commands (quick handling, no Claude needed)
    const missionResponse = handleMissionCommand(promptText, message);
    if (missionResponse) {
      console.log(`[relay] ← [mission] ${missionResponse.slice(0, 60)}...`);
      await message.reply(missionResponse);
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
      let reply: string;
      let attemptPath: "meow" | "meow→claude-code" = "meow";

      const logEntry: FallbackLogEntry = {
        timestamp: new Date().toISOString(),
        channelId: message.channelId,
        userPrompt: promptText.slice(0, 500),
        attemptPath: "meow",
        finalBackend: "meow",
        finalResponseLength: 0,
      };

      try {
        reply = await meow.prompt(fullPrompt);
      } catch (meowErr: any) {
        attemptPath = "meow→claude-code";
        logEntry.attemptPath = attemptPath;
        logEntry.meowError = meowErr.message.slice(0, 500);
        console.warn(`[relay] Meow failed (${meowErr.message.slice(0, 80)}), falling back to Claude Code`);

        try {
          reply = await claude.prompt(fullPrompt);
          logEntry.fallbackSuccess = true;
          logEntry.finalBackend = "claude-code";
        } catch (claudeErr: any) {
          logEntry.fallbackSuccess = false;
          logEntry.finalResponseLength = 0;
          logFallback(logEntry);
          try {
            await message.reply(`❌ Both backends failed.\nMeow: ${meowErr.message}\nClaude: ${claudeErr.message}`);
          } catch { /* ignore */ }
          processing.delete(message.id);
          return;
        }
      }

      logEntry.finalResponseLength = reply.length;
      logFallback(logEntry);

      // If Meow fell back to Claude Code, spawn background fix agent
      if (attemptPath === "meow→claude-code") {
        spawn("bun", ["run", "/app/compare-and-fix.ts"], {
          cwd: process.env.CLAUDE_CWD || "/app",
          stdio: ["ignore", "inherit", "inherit"],
          detached: false,
          shell: false,
        });
        console.log("[relay] Spawned compare-and-fix agent in background");
      }

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

      // Try to execute backup/restore commands
      const backupResult = await executeBackupCommands(promptText, reply);
      if (backupResult) {
        console.log(`[relay] Backup: ${backupResult.output}`);
        reply = reply.trim() + "\n\n" + backupResult.output;
      }

      // Add assistant reply to history and memory
      addToHistory(message.channelId, "assistant", reply);
      memory.addMessageToThread(message.channelId, userId, "meow", reply);

      console.log(`[relay] ← ${reply.slice(0, 80)}${reply.length > 80 ? "..." : ""}`);

      const chunks = chunkMessage(reply);
      await sendChunksWithRateLimit(message, chunks);
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