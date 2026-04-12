/**
 * index.ts
 *
 * Discord MCP server - implements the MCP stdio protocol.
 * Provides tools for reading and posting to Discord channels.
 *
 * Usage: bun run index.ts
 * Or: node dist/index.js (after building)
 */
import { Client, GatewayIntentBits, Routes, ChannelType } from "discord.js";

// ============================================================================
// MCP Protocol Infrastructure
// ============================================================================

let initialized = false;
let messageId = 0;
let client: Client | null = null;
const pendingRequests = new Map<number | string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

// Read lines from stdin
let buf = "";
process.stdin.on("data", (chunk: Buffer) => {
  buf += chunk.toString();
  processLines();
});

function processLines() {
  const lines = buf.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      handleMessage(JSON.parse(line));
    } catch (e) {
      // ignore parse errors
    }
  }
  buf = lines[lines.length - 1];
}

function send(id: number | string | undefined, result: unknown) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function sendError(id: number | string | undefined, code: number, message: string) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

function sendNotification(method: string, params?: unknown) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

// ============================================================================
// Discord Client Setup
// ============================================================================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!DISCORD_TOKEN) {
  console.error("[Discord MCP] DISCORD_TOKEN environment variable is required");
  process.exit(1);
}

client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("clientReady", () => {
  console.error(`[Discord MCP] Logged in as ${client?.user?.tag}`);
});

// ============================================================================
// MCP Tools Definition
// ============================================================================

const tools = [
  {
    name: "list_guilds",
    description: "List all guilds (servers) the bot is connected to",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "list_channels",
    description: "List all available text channels in the guild",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "Guild ID (server ID)" },
      },
      required: ["guild_id"],
    },
  },
  {
    name: "get_messages",
    description: "Get recent messages from a channel",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "Channel ID" },
        limit: { type: "number", description: "Number of messages to fetch (default: 10, max: 100)" },
      },
      required: ["channel_id"],
    },
  },
  {
    name: "post_message",
    description: "Post a message to a channel",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "Channel ID" },
        content: { type: "string", description: "Message content" },
      },
      required: ["channel_id", "content"],
    },
  },
  {
    name: "get_channel_info",
    description: "Get information about a specific channel",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "Channel ID" },
      },
      required: ["channel_id"],
    },
  },
];

// ============================================================================
// Tool Implementations
// ============================================================================

async function listGuilds() {
  if (!client) throw new Error("Discord client not initialized");

  const guilds = await client.guilds.fetch();
  return guilds.map((guild) => ({
    id: guild.id,
    name: guild.name,
  }));
}

async function listChannels(guildId: string) {
  if (!client) throw new Error("Discord client not initialized");

  const guild = await client.guilds.fetch(guildId);
  if (!guild) throw new Error(`Guild ${guildId} not found`);

  const channels = await guild.channels.fetch();
  const textChannels = channels
    .filter((ch) => ch?.type === ChannelType.GuildText)
    .map((ch) => ({
      id: ch?.id,
      name: ch?.name,
      topic: (ch as any)?.topic || null,
    }));

  return textChannels;
}

async function getMessages(channelId: string, limit: number = 10) {
  if (!client) throw new Error("Discord client not initialized");

  const channel = await client.channels.fetch(channelId);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error(`Channel ${channelId} not found or is not a text channel`);
  }

  const messages = await channel.messages.fetch({ limit: Math.min(limit, 100) });
  return messages.map((msg) => ({
    id: msg.id,
    author: `${msg.author.username}#${msg.author.discriminator}`,
    content: msg.content,
    timestamp: msg.createdAt.toISOString(),
  }));
}

async function postMessage(channelId: string, content: string) {
  if (!client) throw new Error("Discord client not initialized");

  const channel = await client.channels.fetch(channelId);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error(`Channel ${channelId} not found or is not a text channel`);
  }

  const message = await channel.send(content);
  return {
    id: message.id,
    content: message.content,
    timestamp: message.createdAt.toISOString(),
  };
}

async function getChannelInfo(channelId: string) {
  if (!client) throw new Error("Discord client not initialized");

  const channel = await client.channels.fetch(channelId);
  if (!channel) {
    throw new Error(`Channel ${channelId} not found`);
  }

  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    topic: (channel as any).topic || null,
    guild_id: (channel as any).guildId || null,
  };
}

// ============================================================================
// MCP Message Handler
// ============================================================================

function handleMessage(msg: any) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize": {
      initialized = true;
      send(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "discord-mcp", version: "1.0.0" },
      });
      break;
    }

    case "initialized": {
      // Client is done initializing - log in to Discord
      client?.login(DISCORD_TOKEN).catch((err) => {
        console.error("[Discord MCP] Login failed:", err.message);
        process.exit(1);
      });
      break;
    }

    case "tools/list": {
      if (!initialized) {
        sendError(id, -32602, "Server not initialized");
        return;
      }
      send(id, { tools });
      break;
    }

    case "tools/call": {
      if (!initialized) {
        sendError(id, -32602, "Server not initialized");
        return;
      }

      const { name, arguments: args = {} } = params || {};

      // Wrap tool execution in async handler
      (async () => {
        try {
          let result: unknown;

          switch (name) {
            case "list_guilds":
              result = await listGuilds();
              send(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
              break;

            case "list_channels":
              result = await listChannels(args.guild_id as string);
              send(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
              break;

            case "get_messages":
              result = await getMessages(args.channel_id as string, args.limit as number);
              send(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
              break;

            case "post_message":
              result = await postMessage(args.channel_id as string, args.content as string);
              send(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
              break;

            case "get_channel_info":
              result = await getChannelInfo(args.channel_id as string);
              send(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
              break;

            default:
              sendError(id, -32601, `Unknown tool: ${name}`);
          }
        } catch (err: any) {
          sendError(id, -32603, err.message);
        }
      })();
      break;
    }

    default:
      if (id !== undefined) {
        sendError(id, -32601, `Unknown method: ${method}`);
      }
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  client?.destroy();
  process.exit(0);
});
