import { Client, GatewayIntentBits } from "discord.js";
import { aiIpiSanitizer } from "../security/triple_lock.ts";
import { extensionRegistry } from "../core/extensions.ts";
import type { Extension } from "../core/extensions.ts";
import { loadSkillsContext } from "../core/skills.ts";
import "dotenv/config";

// Initialize Discord Client for Gateway mode
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let isBotReady = false;

client.once("clientReady", async (c) => {
  console.log(`🚀 Discord Bot logged in as ${c.user?.tag}`);
  isBotReady = true;

  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    const channelId = process.env.DISCORD_CHANNEL_ID;
    
    if (guildId && channelId) {
      const guild = c.guilds.cache.get(guildId);
      if (!guild) {
        console.error(`❌ Bot is NOT in guild ${guildId}. Please invite it!`);
        return;
      }

      const channel = await c.channels.fetch(channelId);
      if (channel && channel.isTextBased()) {
        await (channel as any).send("Hello! SimpleClaw is now online and monitoring this channel. 🦀");
        console.log(`✅ Posted startup message to channel ${channelId}`);
      }
    }
  } catch (error: any) {
    console.error("❌ Failed to post startup message:", error.message);
  }
});

import { runAgentLoop } from "../core/agent.ts";

client.on("messageCreate", async (message) => {
  const channelId = (process.env.DISCORD_CHANNEL_ID || "").trim();

  if (message.author.bot) return;

  const isMentioned = client.user && message.mentions.has(client.user);
  const isDirectChannel = message.channelId === channelId;

  if (!isMentioned && !isDirectChannel) return;

  // Guardian Lock implementation
  const sanitizedContent = aiIpiSanitizer(message.content);

  try {
    await message.channel.sendTyping();

    const result = await runAgentLoop(sanitizedContent, {
      model: "gpt-5-nano",
      onIteration: async (status) => {
        // Optional: you could send status updates here, 
        // but for now we just log to console and keep typing
        await message.channel.sendTyping();
      }
    });

    if (result.content) {
      await message.reply(result.content);
    } else if (!result.completed) {
      await message.reply("⚠️ Reached maximum task depth. Stopping.");
    }
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    await message.reply(`⚠️ Error: ${error.message}`);
  }
});

// Removed side-effect login to prevent ghost instances
export const startBot = async () => {
  if (process.env.DISCORD_BOT_TOKEN) {
    try {
      await client.login(process.env.DISCORD_BOT_TOKEN);
    } catch (err: any) {
      console.error("Failed to login to Discord:", err.message);
    }
  }
};

export const plugin: Extension = {
  name: "discord",
  type: "webhook", // Kept as webhook type to maintain registry compatibility
  route: "/discord",
  start: startBot, // Add start capability
  execute: async (req: Request): Promise<Response> => {
    // This allows manual triggering via webhook if needed
    return new Response(JSON.stringify({ 
      status: "ok", 
      bot_ready: isBotReady,
      bot_user: client.user?.tag || "Unknown",
      message: "Gateway bot is active. Mention the bot to chat!" 
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
};
