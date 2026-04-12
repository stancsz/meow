# @meow/channels

Discord integration for Meow — the self-hosted equivalent of `claude --channels`.

## Two Modes

### 1. `relay.ts` — The Channels Bridge ⭐

Equivalent to `claude --channels` but using **your own backend** (MiniMax, OpenRouter, etc.) — no Anthropic subscription needed.

```
Discord User
    ↓  (types a message / @mentions bot)
relay.ts
    ↓  (JSON-RPC over stdio)
meow --acp  (your local AI agent)
    ↓  (MiniMax / any OpenAI-compatible API)
AI Response
    ↓
Discord Channel
```

#### Quick Start

```bash
# From the channels/ directory
DISCORD_TOKEN=your_token bun run relay

# Mention-only mode (bot only responds when @mentioned)
bun run relay:mention

# Watch specific channels
bun run relay.ts --channel 123456789 --channel 987654321

# With a trigger prefix
bun run relay.ts --prefix "meow:"
```

#### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DISCORD_TOKEN` | *(required)* | Bot token |
| `MEOW_CWD` | `../meow` | Working directory for meow agent |
| `MEOW_DANGEROUS` | `0` | Set `1` to enable shell auto-approve |
| `RELAY_CHANNELS` | all | Comma-separated channel IDs to watch |
| `RELAY_PREFIX` | none | Only respond to messages with this prefix |
| `RELAY_MENTION_ONLY` | `0` | Set `1` for mention-only mode |
| `RELAY_TYPING` | `1` | Show typing indicator while processing |

#### CLI Flags

```
--channel <id>     Add channel to watchlist (repeatable)
--prefix <str>     Only respond to messages starting with prefix
--mention-only     Only respond when bot is @mentioned
```

---

### 2. `index.ts` — Discord MCP Server

Exposes Discord as MCP tools that any MCP-compatible client (including meow) can use.

**Tools:** `list_guilds`, `list_channels`, `get_messages`, `post_message`, `get_channel_info`

Add to `~/.meow/mcp.json`:

```json
{
  "servers": [
    {
      "name": "discord",
      "command": "bun",
      "args": ["C:/path/to/meow-1/channels/index.ts"],
      "env": { "DISCORD_TOKEN": "your_token" }
    }
  ]
}
```

---

## Bot Setup

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. New application → Bot → Reset Token → copy the token
3. Under **Privileged Gateway Intents**, enable:
   - **Server Members Intent**
   - **Message Content Intent**
4. OAuth2 → URL Generator: scopes `bot`, permissions `Send Messages` + `Read Message History`
5. Use generated URL to invite bot to your server

## Configure `.env`

```bash
# channels/.env  (or root .env — relay.ts reads both)
DISCORD_TOKEN=MTQx...your_token_here
RELAY_MENTION_ONLY=1   # recommended: only respond when @mentioned
```

## Getting Channel / Guild IDs

Enable Developer Mode in Discord (Settings → Advanced → Developer Mode), then right-click channels or servers to "Copy ID".
