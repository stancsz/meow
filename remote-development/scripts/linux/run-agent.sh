#!/bin/bash
# run-agent.sh - Run a Claude Code agent with a prompt file
# Usage: ./run-agent.sh <prompt-file> [additional claude args]
# Example: ./run-agent.sh feature-prompt.txt
# Example: ./run-agent.sh qa-prompt.txt --dangerously-skip-permissions

PROJECT_DIR="/home/ubuntu/meow"
PROMPT_FILE="$1"

if [[ -z "$PROMPT_FILE" ]]; then
  echo "Usage: $0 <prompt-file> [additional args]"
  echo "Example: $0 feature-prompt.txt"
  exit 1
fi

PROMPT_PATH="$PROJECT_DIR/local-dev/$PROMPT_FILE"
if [[ ! -f "$PROMPT_PATH" ]]; then
  echo "Error: Prompt file not found: $PROMPT_PATH"
  exit 1
fi

export CLAUDE_PRINT_PROMPT="$(cat "$PROMPT_PATH")"
cd "$PROJECT_DIR"

echo "Running agent with prompt: $PROMPT_FILE"
claude --dangerously-skip-permissions --continue "${@:2}"
