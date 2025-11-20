FROM oven/bun:1 AS builder

WORKDIR /app

# Install dependencies first (leverages Docker layer caching)
COPY package.json bun.lockb* ./
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
CMD ["bunx", "serve", "dist", "--hostname", "0.0.0.0"]

