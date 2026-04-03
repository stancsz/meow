#!/bin/bash
# cook.sh — Self-improving agent loop via evolve.ts
#
# Delegates to meow/src/tools/evolve.ts which runs the antifragile OODA loop.
# evolve.ts handles:
#   - Gap analysis (gaps.test.ts)
#   - Gap selection via wisdom (difficulty scores, failure history)
#   - Implementation via Claude Code CLI
#   - Dogfood verification
#   - Documentation updates
#   - Wisdom accumulation (never repeats same mistake)
#
# Usage:
#   ./cook.sh              # Continuous loop
#   ./cook.sh --once       # Single iteration
#   ./cook.sh --status     # Show current state
#   ./cook.sh --report     # Full wisdom report
#
# evolve.ts lives at: meow/src/tools/evolve.ts

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Ensure we're on cook branch
if ! git show-ref --verify --quiet refs/heads/cook; then
  echo "Creating 'cook' branch..."
  git checkout -b cook
else
  git checkout cook
fi

exec bun run meow/src/tools/evolve.ts "$@"
