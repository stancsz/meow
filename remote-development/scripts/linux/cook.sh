#!/bin/bash
# cook.sh — Gap-Closing Loop via evolve.ts
#
# Delegates to src/tools/evolve.ts for the OODA loop that actually closes
# gaps between meow CLI and Claude Code.
#
# Each iteration:
#   1. OBSERVE: Run gaps.test.ts to find what's missing
#   2. ORIENT: Use wisdom to pick highest-leverage gap
#   3. DECIDE: Skip if blocked, implement if viable
#   4. ACT: Implement in meow/src/, dogfood, commit
#   5. LEARN: On-demand harvest for new capabilities
#
# Usage: ./cook.sh
#        ./cook.sh --once    # Single iteration
#        ./cook.sh --status  # Show current state

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Check if bun is available
if ! command -v bun &> /dev/null; then
  echo "ERROR: bun is required but not found"
  exit 1
fi

# Run evolve.ts
exec bun run meow/src/tools/evolve.ts "$@"
