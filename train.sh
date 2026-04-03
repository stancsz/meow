#!/bin/bash
# train.sh — Thin wrapper that delegates to evolve.ts
#
# All the heavy logic lives in meow/src/tools/evolve.ts (OODA loop).
# This script just handles retries and the infinite loop.
#
# Usage:
#   ./train.sh              # Run forever with retries
#   ./train.sh --once       # Single iteration (no retry)
#   ./train.sh --status     # Show current gap status

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Retry loop for continuous mode (runs forever)
if [[ "$*" == "" ]]; then
  echo "🚀 Starting evolve loop (runs forever, retries on failure)..."
  while true; do
    echo "========================================"
    echo "Iteration started at: $(date)"
    echo "========================================"

    if bun run meow/src/tools/evolve.ts --once 2>&1; then
      echo "✅ Iteration completed successfully"
    else
      echo "❌ Iteration failed, retrying in 10s..."
      sleep 10
      continue
    fi

    # Check if all gaps are solved
    if bun run meow/src/tools/evolve.ts --status 2>&1 | grep -q "All gaps solved"; then
      echo "💤 All gaps solved! Waiting 60s before rechecking..."
      sleep 60
    else
      echo "⏳ Gaps remaining, continuing..."
    fi

    echo "🔄 Sleeping 5s before next iteration..."
    sleep 5
  done
else
  # Pass through to evolve.ts for --once, --status, etc.
  exec bun run meow/src/tools/evolve.ts "$@"
fi
