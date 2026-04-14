#!/bin/bash
set -e

echo "[entrypoint] Starting Claude Bridge Docker..."

# Ensure .claude/skills directory exists with correct ownership and SGID
if [ ! -d "/app/.claude/skills" ]; then
    mkdir -p /app/.claude/skills
    chown -R appuser:appgroup /app/.claude
    echo "[entrypoint] Created /app/.claude/skills"
fi

# Initialize default skills from skel if they don't exist
if [ -d "/app/.claude/skills.skel" ] && [ -n "$(ls -A /app/.claude/skills.skel 2>/dev/null)" ]; then
    for skill in /app/.claude/skills.skel/*/; do
        skill_name=$(basename "$skill")
        if [ ! -d "/app/.claude/skills/${skill_name}" ]; then
            mkdir -p "/app/.claude/skills/${skill_name}"
            cp -r "$skill"* "/app/.claude/skills/${skill_name}/" 2>/dev/null || true
            echo "[entrypoint] Installed default skill: ${skill_name}"
        fi
    done
fi

# Set SGID bit so new files/dirs inherit appgroup
chmod 2775 /app/.claude/skills 2>/dev/null || true

# Authenticate gh CLI if GH_PAT is provided
if [ -n "$GH_PAT" ]; then
    echo "[entrypoint] Authenticating gh CLI with GitHub..."
    # Write the token to a file to avoid passing on command line (more secure)
    echo -n "$GH_PAT" > /tmp/gh_token
    gh auth login --hostname github.com --with-token < /tmp/gh_token
    rm /tmp/gh_token
    echo "[entrypoint] gh CLI authenticated successfully"
else
    echo "[entrypoint] GH_PAT not set, skipping gh authentication"
fi

# Execute the CMD
exec "$@"
