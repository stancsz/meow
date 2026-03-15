#!/bin/bash

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.." || exit 1

# Load .env so DEEPSEEK_API_KEY etc. are available
if [[ -f ".env" ]]; then
  set -o allexport
  # shellcheck disable=SC1091
  source .env
  set +o allexport
fi

OPENCODE_MODEL="${OPENCODE_MODEL:-deepseek/deepseek-chat}"
RUN_HOURS="${RUN_HOURS:-4}"
SLEEP_SECONDS="${CRYSTAL_BALL_SLEEP_SECONDS:-5}"
RUN_ONCE="${CRYSTAL_BALL_ONCE:-0}"
MAX_CONSECUTIVE_FAILURES="${CRYSTAL_BALL_MAX_CONSECUTIVE_FAILURES:-3}"

# Map the OPENAI_API_KEY (set in .env for DeepSeek) to DEEPSEEK_API_KEY
# opencode uses DEEPSEEK_API_KEY for the deepseek provider
if [[ -z "${DEEPSEEK_API_KEY:-}" && -n "${OPENAI_API_KEY:-}" ]]; then
  export DEEPSEEK_API_KEY="$OPENAI_API_KEY"
fi

log() {
  echo "--- [$(date +%T)] $* ---"
}

require_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $SCRIPT_DIR/$file" >&2
    exit 1
  fi
}

ensure_opencode_ready() {
  if ! command -v opencode >/dev/null 2>&1; then
    echo "opencode CLI not found in PATH. Install with: npm install -g opencode-ai" >&2
    exit 1
  fi

  if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
    echo "DEEPSEEK_API_KEY is not set. Add OPENAI_API_KEY or DEEPSEEK_API_KEY to .env" >&2
    exit 1
  fi
}

run_opencode() {
  opencode run \
    --model "$OPENCODE_MODEL" \
    "$@"
}

restore_claude_md() {
  if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
    log "Skipping CLAUDE.md reset because $SCRIPT_DIR is not a git repository"
    return
  fi

  if git ls-files --error-unmatch CLAUDE.md >/dev/null 2>&1; then
    git checkout -- CLAUDE.md
  else
    log "Skipping CLAUDE.md reset because CLAUDE.md is not tracked by git"
  fi
}

require_file "CLAUDE.md"
require_file "SPEC.md"
ensure_opencode_ready

RUN_SECONDS="$(awk -v hours="$RUN_HOURS" 'BEGIN {
  if (hours !~ /^[0-9]+([.][0-9]+)?$/) {
    exit 1
  }
  printf "%d", hours * 3600
}')"
if [[ -z "$RUN_SECONDS" || "$RUN_SECONDS" -le 0 ]]; then
  echo "RUN_HOURS must be a positive number of hours" >&2
  exit 1
fi
END_TIME_EPOCH=$(( $(date +%s) + RUN_SECONDS ))

consecutive_failures=0

while (( $(date +%s) < END_TIME_EPOCH )); do
  log "Unleashing High-Leverage Reasoning"

  run_opencode \
    "1. Read CLAUDE.md and identify the next high-leverage architectural move from the current task state on disk.
     2. Execute that move and deeply verify your changes before exiting.
     3. If you hit a wall, pivot and try a different approach instead of stopping early.
     4. When the task is verified via tests, update CLAUDE.md before exiting."
  status=$?
  if [[ $status -ne 0 ]]; then
    consecutive_failures=$((consecutive_failures + 1))
    log "opencode command failed with exit code $status"
    if [[ $consecutive_failures -ge $MAX_CONSECUTIVE_FAILURES ]]; then
      echo "Stopping after $consecutive_failures consecutive opencode failures. Fix auth/config and rerun." >&2
      exit "$status"
    fi
  else
    consecutive_failures=0
  fi

  restore_claude_md

  log "Cycle Complete. Monitoring for drift..."

  if [[ "$RUN_ONCE" == "1" ]]; then
    break
  fi

  if (( $(date +%s) >= END_TIME_EPOCH )); then
    log "Run window of ${RUN_HOURS} hour(s) reached"
    break
  fi

  sleep "$SLEEP_SECONDS"
done