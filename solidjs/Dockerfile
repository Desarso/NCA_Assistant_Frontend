FROM oven/bun:1 AS builder

WORKDIR /app

# Install dependencies first (leverages Docker layer caching)
# No Bun lockfile tracked in repo; Bun will generate one during install
COPY package.json ./
RUN bun install

# Copy rest of the frontend source and build
COPY . .
RUN bun run build

# Production runtime image
FROM oven/bun:1 AS runner

WORKDIR /app

# Only copy the built assets
COPY --from=builder /app/dist ./dist

ENV PORT=3000
EXPOSE 3000

# Use Bun's built-in serve command to serve static files from dist directory
# Bun serve handles SPA routing automatically and reads PORT env var
CMD ["sh", "-c", "bunx serve -s dist -l tcp://0.0.0.0:${PORT:-3000}"]

