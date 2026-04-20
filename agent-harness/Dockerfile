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

# Configure git
RUN git config --global user.email "meow@bot" && \
    git config --global user.name "Meow Bot"

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER appuser

# Set up gh auth at runtime using token from GH_PAT
ENV GH_HOST=github.com

# Copy relay source
COPY --chown=appuser:appgroup relay.ts ./
COPY --chown=appuser:appgroup memory.ts ./
COPY --chown=appuser:appgroup skill-manager.ts ./
COPY --chown=appuser:appgroup mission-agent.ts ./
COPY --chown=appuser:appgroup mcp-null.json ./
COPY --chown=appuser:appgroup SYSTEM_PROMPT.md ./

# Copy default skills to skel (hidden by volume mount at /app/.claude)
COPY --chown=appuser:appgroup .claude/skills/ /app/.claude/skills.skel/

# Create .gitignore for backup repo
RUN echo ".env" > .gitignore && \
    echo "data/.relay_history.json" >> .gitignore && \
    echo "data/threads.backup.json" >> .gitignore && \
    echo "*.log" >> .gitignore && \
    echo "node_modules/" >> .gitignore

# Build relay for production
RUN bun build relay.ts --outdir=dist --format=esm --target=node

# Expose for any future HTTP services
EXPOSE 3000

# Entrypoint handles gh auth, then runs relay
ENTRYPOINT ["/entrypoint.sh"]
CMD ["bun", "run", "relay.ts"]
