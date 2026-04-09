#!/bin/bash
# watchdog.sh — Keeps train.sh running forever
# Run via cron: */5 * * * * /path/to/watchdog.sh

# watchdog.sh — Keeps train.sh running forever
# Run via cron: */5 * * * * /path/to/watchdog.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$PROJECT_DIR"

LOG_FILE="/tmp/train-sh.log"
PID_FILE="/tmp/train-sh.pid"

# Check if train.sh is already running (by PID file)
if [[ -f "$PID_FILE" ]]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "$(date): train.sh running as PID $OLD_PID"
    exit 0
  else
    echo "$(date): Stale PID $OLD_PID, cleaning..."
    rm -f "$PID_FILE"
  fi
fi

# Check if evolve is running
if pgrep -f "bun.*evolve" > /dev/null 2>&1; then
  echo "$(date): bun evolve running"
  exit 0
fi

echo "$(date): Not running, starting..."
nohup ./remote-development/scripts/linux/train.sh >> "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"
echo "$(date): Started as PID $NEW_PID"
