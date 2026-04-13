# syntax=docker/dockerfile:1
FROM node:22-alpine

# Install Bun for fast package management
RUN npm install -g bun

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
COPY --chown=appuser:appgroup mcp-null.json ./

# Build relay for production
RUN bun build relay.ts --outdir=dist --format=esm --target=node

# Expose for any future HTTP services
EXPOSE 3000

# Default command - run relay with env vars
CMD ["bun", "run", "relay.ts"]