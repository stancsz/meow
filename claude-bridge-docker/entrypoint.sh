#!/bin/bash
set -e

echo "[entrypoint] Starting Claude Bridge Docker..."

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
