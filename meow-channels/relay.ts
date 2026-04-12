#!/usr/bin/env bun
/**
 * relay.ts
 *
 * Meow Channels Relay — the plugin-equivalent of `claude --channels`.
 * Bridges Discord → meow agent (ACP) → Discord reply.
 *
 * Architecture:
 *   Discord message → relay.ts → meow --acp (JSON-RPC stdio) → AI → Discord reply
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
 *   MEOW_CWD            - Working directory for meow (default: process.cwd())
 *   MEOW_DANGEROUS      - Set to "1" to enable dangerous mode
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

const MEOW_CWD = process.env.MEOW_CWD || join(import.meta.dir, "..", "meow");
const MEOW_DANGEROUS = process.env.MEOW_DANGEROUS === "1";
const RELAY_CHANNELS = [
  ...argChannels,
  ...(process.env.RELAY_CHANNELS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
];
const RELAY_PREFIX = argPrefix || process.env.RELAY_PREFIX || "";
const RELAY_MENTION_ONLY = argMentionOnly || process.env.RELAY_MENTION_ONLY === "1";
const RELAY_TYPING = process.env.RELAY_TYPING !== "0"; // default true

// ============================================================================
// Meow ACP Client — JSON-RPC 2.0 over stdio
// ============================================================================

interface ACPResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

class MeowACPClient {
  private proc: ChildProcess | null = null;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private msgId = 0;
  private buf = "";
  private sessionId: string | null = null;
  private initialized = false;

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Start meow in ACP mode
      this.proc = spawn("bun", ["run", "cli/index.ts", "--acp"], {
        cwd: MEOW_CWD,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });

      this.proc.stdout?.on("data", (chunk: Buffer) => {
        this.buf += chunk.toString();
        this.processLines();
      });

      this.proc.stderr?.on("data", (chunk: Buffer) => {
        const msg = chunk.toString().trim();
        if (msg) console.error("[meow]", msg);
      });

      this.proc.on("error", reject);
      this.proc.on("close", (code) => {
        console.log(`[relay] meow exited with code ${code}`);
        this.proc = null;
        this.initialized = false;
      });

      // Initialize and create session
      this.initialize().then(resolve).catch(reject);

      setTimeout(() => {
        if (!this.initialized) reject(new Error("meow ACP init timed out"));
      }, 15000);
    });
  }

  private processLines() {
    const lines = this.buf.split("\n");
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const msg: ACPResponse = JSON.parse(line);
        // StreamEvent pass-through (no id)
        if (msg.id === undefined || msg.id === null) continue;
        const pending = this.pending.get(msg.id as number);
        if (pending) {
          this.pending.delete(msg.id as number);
          if (msg.error) {
            pending.reject(new Error(msg.error.message));
          } else {
            pending.resolve(msg.result);
          }
        }
      } catch {
        // ignore parse errors
      }
    }
    this.buf = lines[lines.length - 1];
  }

  private send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      this.pending.set(id, { resolve, reject });
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      this.proc?.stdin?.write(msg);
    });
  }

  private async initialize(): Promise<void> {
    await this.send("initialize", {
      dangerous: MEOW_DANGEROUS,
      workspacePath: MEOW_CWD,
    });
    const newSess = await this.send("newSession") as { sessionId: string };
    this.sessionId = newSess.sessionId;
    this.initialized = true;
    console.log(`[relay] meow ACP ready, session: ${this.sessionId}`);
  }

  async prompt(text: string): Promise<string> {
    if (!this.initialized || !this.proc) {
      throw new Error("meow ACP not initialized");
    }
    const result = await this.send("prompt", { prompt: text }) as { content: string };
    return result?.content ?? "(no response)";
  }

  isAlive(): boolean {
    return this.initialized && this.proc !== null && !this.proc.killed;
  }

  stop(): void {
    this.proc?.kill();
    this.proc = null;
    this.initialized = false;
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

async function main() {
  console.log("[relay] Starting Meow Channels Relay...");
  console.log(`[relay] CWD: ${MEOW_CWD}`);
  console.log(`[relay] Watching channels: ${RELAY_CHANNELS.length > 0 ? RELAY_CHANNELS.join(", ") : "ALL"}`);
  if (RELAY_PREFIX) console.log(`[relay] Prefix filter: "${RELAY_PREFIX}"`);
  if (RELAY_MENTION_ONLY) console.log("[relay] Mode: mention-only");
  if (MEOW_DANGEROUS) console.log("[relay] ⚠️  Dangerous mode enabled");

  // Start meow ACP backend
  const meow = new MeowACPClient();
  try {
    await meow.start();
  } catch (e: any) {
    console.error("[relay] Failed to start meow ACP:", e.message);
    process.exit(1);
  }

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
    const fullPrompt = `[Discord message from ${message.author.username} in #${(message.channel as TextChannel).name ?? message.channelId}]: ${promptText}`;

    console.log(`[relay] → ${message.author.username}: ${promptText.slice(0, 80)}${promptText.length > 80 ? "..." : ""}`);

    try {
      // Show typing indicator
      if (RELAY_TYPING && message.channel.type === ChannelType.GuildText) {
        await (message.channel as TextChannel).sendTyping();
      }

      const reply = await meow.prompt(fullPrompt);
      markReplied(message.channelId);

      console.log(`[relay] ← ${reply.slice(0, 80)}${reply.length > 80 ? "..." : ""}`);

      // Send reply (chunked if needed)
      const chunks = chunkMessage(reply);
      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    } catch (e: any) {
      console.error("[relay] Error processing message:", e.message);
      try {
        await message.reply(`❌ Error: ${e.message}`);
      } catch {
        // ignore reply errors
      }
    } finally {
      processing.delete(message.id);
    }
  });

  // Auto-restart meow if it dies
  setInterval(async () => {
    if (!meow.isAlive()) {
      console.log("[relay] meow died, restarting...");
      try {
        await meow.start();
      } catch (e: any) {
        console.error("[relay] Restart failed:", e.message);
      }
    }
  }, 5000);

  await discord.login(DISCORD_TOKEN);

  // Graceful shutdown
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      console.log("\n[relay] Shutting down...");
      meow.stop();
      discord.destroy();
      process.exit(0);
    });
  }
}

main().catch((e) => {
  console.error("[relay] Fatal:", e);
  process.exit(1);
});
