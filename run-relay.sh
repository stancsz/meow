#!/usr/bin/env bash
# Auto-restarting relay launcher
# Usage: ./run-relay.sh [args...]
# e.g.: ./run-relay.sh --mention-only

cd "$(dirname "$0")"
PIDFILE="/tmp/meow-relay.pid"
LOGFILE="/tmp/meow-relay.log"

restart_relay() {
  if [ -f "$PIDFILE" ]; then
    OLD_PID=$(cat "$PIDFILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "[run-relay] Old process still running (PID $OLD_PID), killing..."
      kill "$OLD_PID" 2>/dev/null || true
      sleep 1
    fi
  fi

  echo "[run-relay] $(date) — Starting relay with args: $*" >> "$LOGFILE"
  bun run claude-bridge/relay.ts "$@" >> "$LOGFILE" 2>&1 &
  echo $! > "$PIDFILE"
  echo "[run-relay] Relay started PID $(cat $PIDFILE)"
}

watch_and_restart() {
  while true; do
    if [ -f "$PIDFILE" ]; then
      PID=$(cat "$PIDFILE")
      if ! kill -0 "$PID" 2>/dev/null; then
        echo "[run-relay] $(date) — Relay crashed, restarting..." >> "$LOGFILE"
        bun run claude-bridge/relay.ts "$@" >> "$LOGFILE" 2>&1 &
        echo $! > "$PIDFILE"
        echo "[run-relay] Restarted with PID $(cat $PIDFILE)"
      fi
    fi
    sleep 5
  done
}

stop_relay() {
  if [ -f "$PIDFILE" ]; then
    PID=$(cat "$PIDFILE")
    if kill -0 "$PID" 2>/dev/null; then
      echo "[run-relay] Stopping relay (PID $PID)..."
      kill "$PID" 2>/dev/null || true
      rm -f "$PIDFILE"
    fi
  fi
}

case "${1:-}" in
  --stop)
    stop_relay
    ;;
  --status)
    if [ -f "$PIDFILE" ]; then
      PID=$(cat "$PIDFILE")
      if kill -0 "$PID" 2>/dev/null; then
        echo "Relay running: PID $PID"
      else
        echo "Relay not running (stale pidfile)"
      fi
    else
      echo "Relay not running"
    fi
    ;;
  --watch)
    echo "[run-relay] Starting relay with auto-restart..."
    bun run claude-bridge/relay.ts "${@:2}" >> "$LOGFILE" 2>&1 &
    echo $! > "$PIDFILE"
    echo "[run-relay] Relay started with PID $(cat $PIDFILE), watching for crashes..."
    watch_and_restart "${@:2}"
    ;;
  *)
    restart_relay "$@"
    ;;
esac