---
name: acp-implementation
repo: https://github.com/meow/meow
docPath: docs/harvest/acp-mode.md
why: ACP (Agent Client Protocol) enables programmatic control via JSON-RPC over stdio. IDEs and tools can control Meow programmatically.
minimalSlice: "Implement acp.ts that: 1) --acp flag starts JSON-RPC stdio server, 2) Supports initialize, newSession, prompt, cancel methods, 3) Runs headless, controlled via stdin/stdout"
fit: sidecar
complexity: 4
status: pending
---

# ACP Mode Implementation

**Problem:** `src/sidecars/acp.ts` exists but is a stub that doesn't actually implement ACP protocol.

**What ACP Should Do:**
1. Add `--acp` flag to CLI that puts Meow in server mode
2. Read JSON-RPC requests from stdin, write responses to stdout
3. `initialize` — set up agent config, optional MCP server connection
4. `newSession` — create new conversation session
5. `prompt` — run single prompt through agent, return response
6. `cancel` — AbortController abort on current run
7. Keep simple: single-session, no sub-sessions

**JSON-RPC 2.0 Format:**
```json
// Request
{"jsonrpc": "2.0", "id": 1, "method": "prompt", "params": {"prompt": "hello"}}
// Response
{"jsonrpc": "2.0", "id": 1, "result": {"message": "Hello!"}}
```

**Minimal Slice:**
```typescript
// src/sidecars/acp.ts
export function startACPServer() {
  // Read JSON-RPC from stdin
  // Parse method
  // Execute via runLeanAgent
  // Write JSON-RPC response to stdout
}
```

**Test:**
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | meow --acp
# Should output valid JSON-RPC response
```
