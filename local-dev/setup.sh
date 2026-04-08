#!/bin/bash
# setup.sh — Install cron jobs for local-dev agents (Linux/macOS/Git Bash)
#
# Usage: ./setup.sh
#
# Installs 3 cron jobs:
#   1. KILL ALL AGENTS     — every 30 min (kills stuck node/bun)
#   2. FEATURE DEV AGENT   — every hour (:01, :31)
#   3. QA/UI-UX AGENT      — every hour (:01, :31)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Detect cron binary
if command -v crontab &> /dev/null; then
  CRON_CMD="crontab"
elif command -v fcron &> /dev/null; then
  CRON_CMD="fcron"
else
  echo "ERROR: No cron binary found. Install cron or fcron."
  exit 1
fi

echo "Installing local-dev cron jobs..."

mkdir -p "$PROJECT_DIR/.meow"

# Build cron entries (use prompt files for robustness)
KILL_JOB="0,30 * * * * cd $PROJECT_DIR && kill -TERM \$(pidof claude) 2>/dev/null; kill -TERM \$(pidof bun) 2>/dev/null; sleep 3; kill -KILL \$(pidof claude) 2>/dev/null; kill -KILL \$(pidof bun) 2>/dev/null; echo \"Agents killed at \$(date)\" >> $PROJECT_DIR/.meow/agent.log"
FEATURE_JOB="1,31 * * * * cd $PROJECT_DIR && cat local-dev/feature-prompt.txt | claude --dangerously-skip-permissions --print"
QA_JOB="1,31 * * * * cd $PROJECT_DIR && cat local-dev/qa-prompt.txt | claude --dangerously-skip-permissions --print"

# Append to crontab (remove old entries first by filtering)
(crontab -l 2>/dev/null | grep -v "local-dev/" ; echo "$KILL_JOB" ; echo "$FEATURE_JOB" ; echo "$QA_JOB") | crontab -

echo "Done. Cron jobs installed:"
crontab -l | grep "local-dev/"
