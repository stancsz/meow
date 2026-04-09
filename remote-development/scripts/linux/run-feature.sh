#!/bin/bash
# run-feature.sh - Run feature development agent
# Usage: ./run-feature.sh

PROJECT_DIR="/home/ubuntu/meow"
cd "$PROJECT_DIR"

export CLAUDE_PRINT_PROMPT="$(cat "$PROJECT_DIR/local-dev/feature-prompt.txt")"

echo "Starting Feature Development Agent..."
echo "Press Ctrl+C to abort"
claude --dangerously-skip-permissions
