# syntax=docker/dockerfile:1
FROM node:22-alpine

# Install Bun for fast package management
RUN npm install -g bun

# Install git, bash, curl, and github CLI
RUN apk add --no-cache git bash curl

# Install GitHub CLI (gh)
RUN curl -fsSL https://github.com/cli/cli/releases/download/v2.65.0/gh_2.65.0_linux_amd64.tar.gz -o /tmp/gh.tar.gz && \
    tar -xzf /tmp/gh.tar.gz -C /tmp && \
    mv /tmp/gh_2.65.0_linux_amd64/bin/gh /usr/local/bin/ && \
    chmod +x /usr/local/bin/gh && \
    rm -rf /tmp/gh*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Set up working directory
WORKDIR /app

# Copy package files
COPY package.json ./
COPY bun.lock* ./

# Install dependencies (as root)
RUN bun install

# Create non-root user with proper home directory
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -D -h /home/appuser && \
    chown -R appuser:appgroup /app
USER appuser

# Copy relay source
COPY --chown=appuser:appgroup relay.ts ./
COPY --chown=appuser:appgroup memory.ts ./
COPY --chown=appuser:appgroup skill-manager.ts ./
COPY --chown=appuser:appgroup mcp-null.json ./
COPY --chown=appuser:appgroup SYSTEM_PROMPT.md ./

# Build relay for production
RUN bun build relay.ts --outdir=dist --format=esm --target=node

# Expose for any future HTTP services
EXPOSE 3000

# Default command - run relay with env vars
CMD ["bun", "run", "relay.ts"]