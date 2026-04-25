#!/bin/bash
# evolve-watchdog.sh — Claude Code monitors and fixes the evolve loop
# Run via cron: */10 * * * * /path/to/evolve-watchdog.sh

cd /c/Users/stanc/github/meow

LOG="/tmp/evolve-watchdog.log"
PID_FILE="/tmp/train-sh.pid"

echo "========== $(date) ==========" >> "$LOG"

# Check if train.sh is running
if [[ -f "$PID_FILE" ]]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "OK: train.sh running as PID $OLD_PID" >> "$LOG"
  else
    echo "WARN: train.sh not running (stale PID $OLD_PID)" >> "$LOG"
    # Restart via watchdog
    bash watchdog.sh >> "$LOG" 2>&1
  fi
else
  # No PID file, check by process name
  if pgrep -f "bun.*evolve.ts" > /dev/null 2>&1; then
    echo "OK: train.sh is running" >> "$LOG"
  else
    echo "WARN: train.sh not running at all, starting..." >> "$LOG"
    bash watchdog.sh >> "$LOG" 2>&1
  fi
fi

# Check log for recent activity
if [[ -f "/tmp/train-sh.log" ]]; then
  LAST_TIME=$(tail -5 /tmp/train-sh.log | grep "Iteration started" | tail -1 | cut -d' ' -f2)
  if [[ -n "$LAST_TIME" ]]; then
    echo "Last iteration: $LAST_TIME" >> "$LOG"
  fi
fi

# Check for stuck Claude Code processes
STUCK=$(ps aux | grep "claude --print" | grep -v grep | wc -l)
if [[ "$STUCK" -gt 0 ]]; then
  echo "WARN: $STUCK stuck claude --print process(es) found, killing..." >> "$LOG"
  pkill -f "claude --print" >> "$LOG" 2>&1
fi

# Check for stale bun processes from old runs
OLD_BUNS=$(ps aux | grep "bun" | grep "evolve" | grep -v "grep\|$$" | wc -l)
if [[ "$OLD_BUNS" -gt 2 ]]; then
  echo "WARN: $OLD_BUNS stale bun processes, cleaning..." >> "$LOG"
  pkill -f "bun.*evolve" >> "$LOG" 2>&1
fi

echo "Done at $(date)" >> "$LOG"
