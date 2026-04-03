#!/bin/bash
# watchdog.sh — Keeps train.sh running forever
# Run via cron: */5 * * * * /path/to/watchdog.sh

cd /c/Users/stanc/github/meow

LOG_FILE="/tmp/train-sh.log"
PID_FILE="/tmp/train-sh.pid"

# Check if train.sh is already running (by PID file)
if [[ -f "$PID_FILE" ]]; then
  OLD_PID=$(cat "$PID_FILE")
  # Check if that PID is actually running
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "$(date): train.sh already running as PID $OLD_PID"
    exit 0
  else
    echo "$(date): Stale PID file (PID $OLD_PID is dead), cleaning up..."
    rm -f "$PID_FILE"
  fi
fi

# Check if train.sh is running (by process name) - prevent duplicates
# Use ps | grep instead of pgrep (pgrep not available on Windows Git Bash)
if ps aux 2>/dev/null | grep -v grep | grep -q "bun.*evolve\.ts"; then
  echo "$(date): train.sh is already running (found by ps)"
  exit 0
fi

echo "$(date): train.sh not running, starting..."
nohup ./train.sh >> "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"
echo "$(date): Started train.sh as PID $NEW_PID"
