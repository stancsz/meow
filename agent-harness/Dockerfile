# syntax=docker/dockerfile:1
FROM node:22-alpine

# Install Bun for fast package management
RUN npm install -g bun

# Install git, bash, curl, rsync, and github CLI
RUN apk add --no-cache git bash curl rsync

# Install GitHub CLI (gh)
RUN curl -fsSL https://github.com/cli/cli/releases/download/v2.65.0/gh_2.65.0_linux_amd64.tar.gz -o /tmp/gh.tar.gz && \
    tar -xzf /tmp/gh.tar.gz -C /tmp && \
    mv /tmp/gh_2.65.0_linux_amd64/bin/gh /usr/local/bin/ && \
    chmod +x /usr/local/bin/gh && \
    rm -rf /tmp/gh*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code@2.1.98

# Set up working directory
WORKDIR /app

# Copy package files
COPY package.json ./
COPY bun.lock* ./

# Install dependencies (as root)
RUN bun install

# Create non-root user with proper home directory
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -D -h /home/appuser -G appgroup && \
    chown -R appuser:appgroup /app

# Create .claude/skills directory for skill management
RUN mkdir -p /app/.claude/skills && chown -R appuser:appgroup /app/.claude

# Create workspace directory (used by Meow agent as CWD)
RUN mkdir -p /app/workspace && chown -R appuser:appgroup /app/workspace

# Configure git
RUN git config --global user.email "meowju@meow.bot" && \
    git config --global user.name "meowju"

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER appuser

# Set up gh auth at runtime using token from GH_PAT
ENV GH_HOST=github.com

# Copy source and config
COPY --chown=appuser:appgroup src/ ./src/
COPY --chown=appuser:appgroup config/ ./config/
COPY --chown=appuser:appgroup jobs/ ./jobs/
COPY --chown=appuser:appgroup docs/ ./docs/

# Create .claude directory structure
RUN mkdir -p /app/.claude/skills /app/.claude/skills.skel && chown -R appuser:appgroup /app/.claude

# Create .gitignore for backup repo
RUN echo ".env" > .gitignore && \
    echo "data/.relay_history.json" >> .gitignore && \
    echo "data/threads.backup.json" >> .gitignore && \
    echo "*.log" >> .gitignore && \
    echo "node_modules/" >> .gitignore

# Create logs directory for fallback logging
RUN mkdir -p /app/logs && chown -R appuser:appgroup /app/logs

# Running via bun run directly to support runtime-mounted volumes
EXPOSE 3000

# Entrypoint handles gh auth, then runs relay
ENTRYPOINT ["/entrypoint.sh"]
CMD ["bun", "run", "src/relay.ts"]
