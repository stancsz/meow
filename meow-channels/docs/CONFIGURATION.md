# Configuring Meow-Chan

Follow these steps to set up your own instance of the Meow-Chan Discord relay.

## 1. Environment Setup
Create a `.env` file in the root directory:
```env
DISCORD_TOKEN=your_bot_token_here
CLAUDE_CWD=C:\path\to\your\workspace
```

## 2. Global Tool Path
Ensure the `relay.ts` points to the correct absolute path of your Claude Code installation. 
On Windows, check:
`C:\Users\<user>\AppData\Roaming\npm\node_modules\@anthropic-ai\claude-code\cli.js`

## 3. The "Null" Config
The relay requires a file named `mcp-null.json` in the project root to isolate the Brain from local MCP tools.
```json
{
  "mcpServers": {}
}
```

## 4. Launching
You can launch the relay using Bun:
```bash
bun run meow-channels/relay.ts --channel <channel_id>
```

Or using the built-in watcher:
```bash
npm run channels:watch -- --channel <channel_id>
```
