#!/bin/bash
# train.sh — Thin wrapper that delegates to evolve.ts
#
# All the heavy logic lives in meow/src/tools/evolve.ts (OODA loop).
# This script is just a convenient entry point.
#
# Usage:
#   ./train.sh              # Run the full loop
#   ./train.sh --once       # Single iteration
#   ./train.sh --status     # Show current gap status
#   ./train.sh --report     # Full wisdom report

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

exec bun run meow/src/tools/evolve.ts "$@"
