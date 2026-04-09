#!/bin/bash
# ssh.sh - SSH into the Meow remote dev server
# Reads MEOW_SERVER_IP and MEOW_SSH_KEY from ~/.env
#
# Usage:
#   ./ssh.sh           # Interactive shell
#   ./ssh.sh -i       # Force interactive (explicit)
#   ./ssh.sh "cmd"    # Run command

# Load ~/.env
ENV_FILE="$HOME/.env"
if [[ -f "$ENV_FILE" ]]; then
  export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

SERVER_IP="${MEOW_SERVER_IP:-}"
SSH_KEY="${MEOW_SSH_KEY:-$HOME/.ssh/meow-final-key.pem}"

if [[ -z "$SERVER_IP" ]]; then
  echo "ERROR: MEOW_SERVER_IP not set in ~/.env"
  echo "Add: MEOW_SERVER_IP=<your-server-ip>"
  exit 1
fi

if [[ ! -f "$(eval echo $SSH_KEY)" ]]; then
  echo "ERROR: SSH key not found at $SSH_KEY"
  echo "Download the key from AWS Lightsail console."
  exit 1
fi

SSH_KEY_EXPANDED=$(eval echo "$SSH_KEY")

if [[ "$1" == "-i" ]] || [[ "$1" == "--interactive" ]] || [[ "$#" -eq 0 ]]; then
  # Interactive shell with TTY
  ssh -i "$SSH_KEY_EXPANDED" -o StrictHostKeyChecking=no -t ubuntu@$SERVER_IP
elif [[ "$1" == "-c" ]] || [[ "$1" == "--command" ]]; then
  shift
  ssh -i "$SSH_KEY_EXPANDED" -o StrictHostKeyChecking=no ubuntu@$SERVER_IP "$@"
else
  # Run command
  ssh -i "$SSH_KEY_EXPANDED" -o StrictHostKeyChecking=no ubuntu@$SERVER_IP "$@"
fi
