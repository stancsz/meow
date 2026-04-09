#!/bin/bash
# deploy.sh - Deploy Meow remote dev server to AWS Lightsail
# Reads credentials from ~/.env

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "=== Meow Remote Dev Deploy ==="

# Load .env
ENV_FILE="$HOME/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found"
  exit 1
fi

export $(grep -v '^#' "$ENV_FILE" | xargs)
echo "✓ Loaded credentials from ~/.env"

# Check required vars
if [[ -z "$AWS_ACCESS_KEY_ID" ]] || [[ -z "$AWS_SECRET_ACCESS_KEY" ]]; then
  echo "ERROR: AWS credentials not found in ~/.env"
  exit 1
fi

if [[ -z "$GITHUB_PAT" ]]; then
  echo "ERROR: GITHUB_PAT not found in ~/.env"
  exit 1
fi

# Prompt for Anthropic API key if not set
if [[ -z "$ANTHROPIC_API_KEY" ]]; then
  echo -n "Enter your Anthropic API key (or set ANTHROPIC_API_KEY in ~/.env): "
  read -s ANTHROPIC_API_KEY
  echo
fi

if [[ -z "$ANTHROPIC_API_KEY" ]]; then
  echo "ERROR: ANTHROPIC_API_KEY is required"
  exit 1
fi

# Initialize Terraform
echo ">>> Initializing Terraform..."
terraform init

# Apply with variables
echo ">>> Applying Terraform (this may take a few minutes)..."
terraform apply \
  -var "aws_access_key=$AWS_ACCESS_KEY_ID" \
  -var "aws_secret_key=$AWS_SECRET_ACCESS_KEY" \
  -var "anthropic_api_key=$ANTHROPIC_API_KEY" \
  -var "github_pat=$GITHUB_PAT" \
  -var "github_username=${GITHUB_USERNAME:-stancsz}" \
  -var "minimax_base_url=${ANTHROPIC_BASE_URL:-https://api.minimaxi.com/anthropic}" \
  -auto-approve

echo ""
echo "=== Deployment Complete ==="
echo ""
terraform output

# Note: SSH private key must be downloaded from AWS Lightsail console
# It is only shown once at key pair creation
echo ""
echo "IMPORTANT: Download your SSH private key from AWS Lightsail console:"
echo "  AWS Console → Lightsail → SSH keys → meow-remote-dev-key → Download"

echo ""
echo "Next steps:"
echo "  - Download SSH key from AWS Lightsail console if not downloaded"
echo "  - SSH: terraform output ssh_command"
echo "  - Check Meow: terraform output meow_status"
echo "  - Tail logs: terraform output meow_logs"
