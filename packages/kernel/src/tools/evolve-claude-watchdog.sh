#!/bin/bash
# evolve-claude-watchdog.sh — Claude Code monitors the evolve loop
# Run via cron: */15 * * * * /path/to/evolve-claude-watchdog.sh

cd /c/Users/stanc/github/meow

PROMPT_FILE="agent-kernel/src/tools/evolve-monitor-prompt.txt"
LOG="/tmp/evolve-claude-watchdog.log"

echo "========== $(date) ==========" >> "$LOG"

# Run Claude Code with the monitor prompt
(cat "$PROMPT_FILE" | bash -c 'claude --dangerously-skip-permissions --bare --print' >> "$LOG" 2>&1) &
CLAUDE_PID=$!

# Wait up to 5 minutes for Claude to respond
TIMEOUT=300
ELAPSED=0
while kill -0 $CLAUDE_PID 2>/dev/null; do
  sleep 5
  ELAPSED=$((ELAPSED + 5))
  if [[ $ELAPSED -ge $TIMEOUT ]]; then
    echo "TIMEOUT: Claude Code took too long, killing..." >> "$LOG"
    kill -9 $CLAUDE_PID 2>/dev/null
    break
  fi
done

echo "Done at $(date)" >> "$LOG"

