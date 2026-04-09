#!/bin/bash
# train.sh — Thin wrapper that delegates to evolve.ts
set -e
BUN=/home/ubuntu/.bun/bin/bun
cd /home/ubuntu/meow
# Source .env if present
if [[ -f .env ]]; then set -a; source .env; set +a; fi

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

    # Count open gaps (look for the 📋 icon on a gap line, not the header)
    OPEN_GAPS=$(bun run meow/src/tools/evolve.ts --status 2>&1 | grep -c "^  📋" || echo "0")
    echo "📊 Open gaps: $OPEN_GAPS"

    if [[ "$OPEN_GAPS" == "0" ]]; then
      echo "💤 All gaps solved! Waiting 60s before rechecking..."
      sleep 60
    else
      echo "⏳ Gaps remaining ($OPEN_GAPS open), continuing..."
      echo "🔄 Sleeping 5s before next iteration..."
      sleep 5
    fi
  done
else
  # Pass through to evolve.ts for --once, --status, etc.
  exec bun run meow/src/tools/evolve.ts "$@"
fi
