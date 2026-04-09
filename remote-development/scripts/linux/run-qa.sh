#!/bin/bash
# run-qa.sh - Run QA/UI-UX agent
# Usage: ./run-qa.sh

PROJECT_DIR="/home/ubuntu/meow"
cd "$PROJECT_DIR"

export CLAUDE_PRINT_PROMPT="$(cat "$PROJECT_DIR/local-dev/qa-prompt.txt")"

echo "Starting QA Agent..."
echo "Press Ctrl+C to abort"
claude --dangerously-skip-permissions --continue
