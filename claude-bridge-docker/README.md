# Claude Bridge Docker

Docker-based Discord relay that bridges messages to Claude Code and replies back to Discord.

## Quick Start

1. Copy `.env.example` to `.env` and set your `DISCORD_TOKEN`
2. Optionally set `RELAY_CHANNELS` to specific channel IDs (comma-separated)
3. Build and run:

```bash
docker-compose up --build
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | Yes | - | Discord bot token |
| `CLAUDE_CWD` | No | `/app` | Working directory for Claude Code |
| `CLAUDE_CLI_PATH` | No | auto | Path to Claude Code CLI |
| `RELAY_CHANNELS` | No | all | Channel IDs to watch (comma-separated) |
| `RELAY_PREFIX` | No | - | Message prefix to trigger relay |
| `RELAY_MENTION_ONLY` | No | - | Set to "1" for mention-only mode |
| `RELAY_TYPING` | No | "1" | Show typing indicator |

## Example: Monitor Specific Channel

For `https://discord.com/channels/1454666373933568102/1492940067680030943`:

```env
DISCORD_TOKEN=your_bot_token_here
RELAY_CHANNELS=1492940067680030943
```

## Discord Setup

1. Create a Discord bot at https://discord.com/developers/applications
2. Enable these intents:
   - `Server Members Intent`
   - `Message Content Intent`
3. Copy the bot token to `DISCORD_TOKEN`
4. Add the bot to your server with the required permissions

## Direct Usage (without Docker)

```bash
bun install
bun run relay.ts
```