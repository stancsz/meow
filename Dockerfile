FROM oven/bun:1
# We use the full image for build tools needed by better-sqlite3

WORKDIR /app

# Install browser dependencies for agent-browser (Playwright based)
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Copy the core workspace config files
COPY package.json bun.lock ./

# Install dependencies (including those for SQLite native binding)
RUN bun install --frozen-lockfile

# Copy everything else
COPY . .

# Build the Next.js server
RUN cd server && bun install && bun run build

# Ensure playwright browsers are installed for agent-browser
RUN npx playwright install chromium

# Set default role
ENV ROLE=worker
ENV NODE_ENV=production

# Entrypoint script checks ROLE to decide what to run
CMD ["sh", "-c", "if [ \"$ROLE\" = 'server' ]; then cd server && bun run start; else bun run src/index.ts; fi"]