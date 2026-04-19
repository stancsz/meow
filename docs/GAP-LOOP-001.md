# GAP-LOOP-001: Non-Stop Agent Loop

## Why Other Agents Run Non-Stop

### Hermes-Agent (NousResearch)

**Gateway message loop** - A persistent async event loop (`gateway/run.py`) that:
- Runs indefinitely, handling messages from multiple platforms (Discord, Telegram, Slack, etc.)
- Each platform adapter runs in its own asyncio task
- The main loop NEVER exits - it's a long-running server process

**Cron scheduler** - Built-in scheduler that:
- Ticks every 60 seconds from a background thread
- Runs due cron jobs as sub-agent sessions
- File-based locking prevents overlapping ticks
- Jobs stored in `~/.hermes/cron/jobs.json`

**Context compression** - `agent/context_compressor.py`:
- Automatic compression when conversation exceeds ~50% of context window
- Uses cheap auxiliary model (Haiku) to summarize middle turns
- Preserves head (system prompt) and tail (recent messages)
- Happens DURING the conversation, not after

**Session persistence** - SQLite with FTS5:
- Sessions stored on disk, survive restarts
- Session store has LRU eviction with 1-hour idle TTL
- Agent cache caps at 128 sessions

**Background processes** - `terminal(background=true, notify_on_complete=true)`:
- Long-running tasks spawn as background processes
- A watcher detects completion and triggers a new agent turn
- User gets notified when done

### OpenClaw

**Gateway server** - Long-running Node.js server:
- WebSocket connections from multiple clients
- Session management with compaction checkpoints
- Session reaper cleans up stale sessions

**Cron service** - Persistent job scheduler:
- Jobs defined in config, run on schedule
- Can run isolated agent sessions for cron jobs
- Delivery to configured channels (Discord, Slack, etc.)

**Session compaction** - `session-compaction-checkpoints.ts`:
- Checkpoints mid-conversation to preserve state
- Session reaper removes old sessions
- Sessions can be resumed

**Auto-reply** - Handles messages even when agent is busy processing

---

## Why Our agent-harness Cannot Run Non-Stop

### Gap 1: Process-Per-Message Architecture

**What we do:**
```
Discord message → relay.ts → spawn Claude CLI → get response → DONE
```

Each message spawns a NEW Claude CLI process. No persistent agent.

**What hermes/openclaw do:**
```
Gateway message → AIAgent.run_conversation() → persistent agent instance
```

A single agent instance handles all messages in a session. The agent maintains:
- Conversation history
- Tool schemas (already loaded)
- Model client connections (already established)
- Session context

**Impact:**
- Cold start latency on every message (~2-5 seconds just to spawn)
- No conversation continuity between messages
- Claude has no idea what happened in previous messages unless we stuff it in the prompt

---

### Gap 2: No Context Compression

**What we do:**
- Last 10 messages stored in `channelHistory`
- No compression, no summarization
- Eventually hits Claude's context window limit and starts dropping old context

**What hermes does:**
```python
# Automatic compression when context exceeds threshold
if context_length > context_window * 0.5:
    compressed = compress_context(messages, model)
    messages = compressed
```

**Impact:**
- After ~20-30 messages in a channel, older context is lost
- No memory of what was discussed earlier
- Brain has no signal from compressed history

---

### Gap 3: No Persistent Session Store

**What we do:**
- Messages stored in `data/.relay_history.json` (raw JSON)
- `memory.ts` saves user profiles to `data/profiles.json`
- No session resumption - each conversation starts fresh

**What hermes does:**
```python
# SQLite session store
session = SessionStore.get_or_create(session_id)
session.add_message(role, content)
session.save()  # persists to disk
```

**Impact:**
- If Docker restarts, all session context is lost
- No way to resume a specific conversation thread
- Memory is fragmented across files, not unified into sessions

---

### Gap 4: No Cron / Scheduled Jobs

**What we do:**
- `mission-agent.ts` runs in background, but ONLY evaluates missions that are "in_progress"
- No scheduled brain maintenance, no periodic enrichment
- No way to run "every morning at 9am do X"

**What hermes does:**
```python
# Cron job definition
job = {
    "skill": "daily-briefing",
    "schedule": "0 9 * * *",  # 9am daily
    "delivery": {"platform": "discord", "channel": "home"}
}
```

**Impact:**
- No autonomous operation while user sleeps
- No nightly brain maintenance
- No periodic enrichment sweeps

---

### Gap 5: No Background Process Handling

**What we do:**
- Long-running commands (git clone, npm install) just... wait
- No way to background a task and get notified when done
- No process registry

**What hermes does:**
```python
result = terminal(command, background=True, notify_on_complete=True)
# User gets pinged when done
```

**Impact:**
- User must wait for long operations
- No way to start a task and continue conversation
- Terminal gets blocked

---

### Gap 6: No Brain-First Lookup in Hot Path

**What we do:**
- Brain is mentioned in SYSTEM_PROMPT but NOT actually called
- Relay has no code that runs `gbrain query` before prompts
- No signal detection on messages

**What hermes does:**
```python
# Brain-first on every message
context = brain.query(user_message)
messages.append({"role": "system", "content": context})
```

**Impact:**
- Brain exists but is not used
- No entity enrichment on messages
- Brain doesn't compound from conversations

---

## Summary: Architecture Comparison

| Feature | Hermes | OpenClaw | Meow (us) |
|---------|--------|----------|------------|
| Process model | Persistent agent instance | Long-running gateway | Spawn per message |
| Context compression | Auto, ~50% threshold | Checkpoints | None |
| Session store | SQLite + FTS5 | Session compaction | JSON files |
| Cron jobs | Built-in scheduler | Cron service | Mission agent (basic) |
| Background processes | Terminal tool + watcher | Tasks | None |
| Brain integration | gbrain MCP | gbrain MCP | Not wired |
| Startup latency | ~100ms | ~500ms | ~2-5s |

## What's Needed to Close These Gaps

### Phase 1: Session Persistence
- [ ] Replace `channelHistory` JSON with SQLite session store
- [ ] Add session resumption on Docker restart
- [ ] Session-level context instead of channel-level

### Phase 2: Persistent Agent
- [ ] Instead of spawning Claude CLI per message, keep agent running
- [ ] Agent instance per Discord channel/session
- [ ] Reuse model clients, tool schemas

### Phase 3: Context Compression
- [ ] Implement summarization when context > 50% full
- [ ] Compress middle turns, preserve head + tail
- [ ] Integrate with brain for storage

### Phase 4: Cron System
- [ ] Add cron scheduler (like hermes cron/)
- [ ] Brain maintenance jobs
- [ ] Nightly enrichment sweeps

### Phase 5: Brain Integration
- [ ] Wire gbrain into hot path
- [ ] Signal detection on every message
- [ ] Entity enrichment automatic

### Phase 6: Background Tasks
- [ ] Terminal tool with background mode
- [ ] Process watcher for completion notifications
- [ ] Non-blocking task execution
