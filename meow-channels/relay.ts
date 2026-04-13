#!/usr/bin/env bun
/**
 * relay.ts
 *
 * Meow Channels Relay — the plugin-equivalent of `claude --channels`.
 * Bridges Discord → Claude Code → Discord reply.
 *
 * Architecture:
 *   Discord message → relay.ts → claude -p (print mode) → AI → Discord reply
 *
 * Canonical invocation (equivalent of `claude --channels`):
 *   meow --meow-chan                          # all channels, all messages
 *   meow --meow-chan-mention                  # only @bot mentions
 *   meow --meow-chan --channel 123 --prefix "meow:"
 *
 * Direct invocation:
 *   bun run relay.ts
 *   bun run relay.ts --channel 123456789  # Only watch specific channel(s)
 *   bun run relay.ts --prefix "meow:"    # Only respond to messages starting with prefix
 *   bun run relay.ts --mention-only       # Only respond when bot is @mentioned
 *
 * npm scripts (from repo root):
 *   npm run meow-chan               # full relay mode
 *   npm run meow-chan:mention       # mention-only mode
 *   npm run channels                # alias: direct relay
 *
 * Environment variables (from .env or shell):
 *   DISCORD_TOKEN        - Bot token (required)
 *   CLAUDE_CWD          - Working directory for claude (default: process.cwd())
 *   CLAUDE_MODEL        - Model to use (default: from Claude Code config)
 *   RELAY_CHANNELS      - Comma-separated channel IDs to watch (optional)
 *   RELAY_PREFIX        - Message prefix to trigger relay (e.g. "meow:"), optional
 *   RELAY_MENTION_ONLY  - Only respond to @bot mentions (set to "1")
 *   RELAY_TYPING        - Show "typing..." while processing (default: "1")
 */

import { Client, GatewayIntentBits, ChannelType, type TextChannel, type Message } from "discord.js";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
const RELAY_TYPING = process.env.RELAY_TYPING !== "0"; // default true

// ============================================================================
// Claude Code Client — spawns `claude -p "<prompt>"` for each message
// ============================================================================

class ClaudeCodeClient {
  private claudeArgs = ["--output-format", "text", "--dangerously-skip-permissions", "--strict-mcp-config", "--mcp-config", join(CLAUDE_CWD, "mcp-null.json")];

  async prompt(text: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const claudeJsPath = "C:\\Users\\stanc\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js";
      const proc = spawn("node", [claudeJsPath, ...this.claudeArgs, "-p", text], {
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
          // Fall back to stderr as error message
          const errMsg = stderr.trim() || `claude exited with code ${code}`;
          // Strip ANSI codes if any
          const clean = errMsg.replace(/\x1b\[[0-9;]*m/g, "");
          reject(new Error(clean));
        }
      });

      // 60s timeout
      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error("Claude prompt timed out after 60s"));
      }, 60000);
    });
  }

  isAlive(): boolean {
    // Claude Code is spawned per-message, so always "alive" in the relay sense
    return true;
  }

  stop(): void {
    // Nothing to stop for per-message spawn model
  }
}

// ============================================================================
// Rate limiter — avoid spam
// ============================================================================

const lastReplyTime = new Map<string, number>(); // channelId → timestamp
const RATE_LIMIT_MS = 1000; // min 1s between replies per channel

function isRateLimited(channelId: string): boolean {
  const last = lastReplyTime.get(channelId) ?? 0;
  return Date.now() - last < RATE_LIMIT_MS;
}

function markReplied(channelId: string) {
  lastReplyTime.set(channelId, Date.now());
}

// ============================================================================
// Message chunker — Discord's 2000 char limit
// ============================================================================

function chunkMessage(text: string, maxLen = 1900): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    // Try to split at a newline near the limit
    let cut = maxLen;
    const nl = remaining.lastIndexOf("\n", maxLen);
    if (nl > maxLen * 0.5) cut = nl + 1;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  return chunks;
}

// ============================================================================
// Main Relay Loop
// ============================================================================

// Detect permission/auth errors that should not be re-reported to Discord
function isAuthError(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("permission") ||
    lower.includes("authorize") ||
    lower.includes("discord mcp needs") ||
    lower.includes("no discord") ||
    lower.includes("run /discord") ||
    lower.includes("grant access") ||
    lower.includes("needs permission") ||
    lower.includes("don't have discord") ||
    lower.includes("discord access") ||
    lower.includes("reply permissions") ||
    lower.includes("pending permission") ||
    lower.includes("approve") ||
    lower.includes("/discord:access")
  );
}

// Check if the reply is just Claude complaining about not having permission (not useful to send)
function isPermissionBloat(text: string): boolean {
  const lower = text.toLowerCase();
  const permissionPhrases = [
    "don't have discord",
    "don't have permission",
    "don't have discord reply",
    "hasn't been approved",
    "needs to be approved",
    "plugin needs to be approved",
    "plugin needs approval",
    "haven't approved",
    "haven't granted",
    "hasn't been granted",
    "permission to reply",
    "reply tool is pending",
    "reply tool needs",
    "mcp plugin needs",
    "discord plugin needs",
    "run /discord",
    "grant it so i can",
    "want me to reply",
    "want to grant",
    "you can approve",
    "approve it with",
    "can i reply",
  ];
  // If reply is short and is mostly permission-related blurb, skip it
  const firstLine = lower.split('\n')[0];
  const isShort = text.length < 200;
  const hasPermissionPhrase = permissionPhrases.some(p => lower.includes(p));
  const hasSelfReference = lower.includes("i tried") || lower.includes("i'm unable") || lower.includes("i don't have");
  return isShort && hasPermissionPhrase && hasSelfReference;
}

async function main() {
  console.log("[relay] Starting Meow Channels Relay (Claude Code)...");
  console.log(`[relay] CWD: ${CLAUDE_CWD}`);
  console.log(`[relay] Watching channels: ${RELAY_CHANNELS.length > 0 ? RELAY_CHANNELS.join(", ") : "ALL"}`);
  if (RELAY_PREFIX) console.log(`[relay] Prefix filter: "${RELAY_PREFIX}"`);
  if (RELAY_MENTION_ONLY) console.log("[relay] Mode: mention-only");

  // Claude Code client
  const claude = new ClaudeCodeClient();

  // Connect to Discord
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

  // Track messages currently being processed to avoid duplicates
  const processing = new Set<string>();

  discord.on("messageCreate", async (message: Message) => {
    // Ignore bots (including self)
    if (message.author.bot) return;

    // Channel filter
    if (RELAY_CHANNELS.length > 0 && !RELAY_CHANNELS.includes(message.channelId)) return;

    // Mention-only filter
    if (RELAY_MENTION_ONLY && !message.mentions.has(discord.user!)) return;

    // Prefix filter
    if (RELAY_PREFIX && !message.content.startsWith(RELAY_PREFIX)) return;

    // Rate limit
    if (isRateLimited(message.channelId)) return;

    // Deduplicate
    if (processing.has(message.id)) return;
    processing.add(message.id);

    // Extract the actual prompt text
    let promptText = message.content;

    // Strip bot mention from start
    if (discord.user) {
      promptText = promptText
        .replace(new RegExp(`^<@!?${discord.user.id}>\\s*`), "")
        .trim();
    }

    // Strip prefix
    if (RELAY_PREFIX && promptText.startsWith(RELAY_PREFIX)) {
      promptText = promptText.slice(RELAY_PREFIX.length).trim();
    }

    if (!promptText) {
      processing.delete(message.id);
      return;
    }

    // Add author context so the agent knows who's talking
    // We use a safe neutral label and put metadata at the end
    const fullPrompt = `User Message: ${promptText}

(Sent by ${message.author.username} in Discord. Respond only with your reply.)`;

    console.log(`[relay] → ${message.author.username}: ${promptText.slice(0, 80)}${promptText.length > 80 ? "..." : ""}`);

    try {
      // Show typing indicator
      if (RELAY_TYPING && message.channel.type === ChannelType.GuildText) {
        await (message.channel as TextChannel).sendTyping();
      }

      let reply = await claude.prompt(fullPrompt);
      markReplied(message.channelId);

      if (!reply) {
        console.log("[relay] ! Empty reply, skipping");
        processing.delete(message.id);
        return;
      }

      console.log(`[relay] ← ${reply.slice(0, 80)}${reply.length > 80 ? "..." : ""}`);

      // Send reply (chunked if needed)
      const chunks = chunkMessage(reply);
      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    } catch (e: any) {
      console.error(`[relay] Error processing ${message.id}:`, e.message);
      try {
        await message.reply(`❌ Error: ${e.message}`);
      } catch {
        // ignore reply errors
      }
    } finally {
      processing.delete(message.id);
    }
  });

  await discord.login(DISCORD_TOKEN);

  // Graceful shutdown
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
