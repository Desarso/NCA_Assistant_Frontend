FROM ghcr.io/astral-sh/uv:debian-slim

# # Install Node.js and npm
# RUN apt-get update && \
#     apt-get install -y curl gnupg && \
#     curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
#     apt-get install -y nodejs && \
#     apt-get clean && \
#     rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy backend files
COPY . .

EXPOSE 8000

# Run migrations, then start the application
# Migrations are idempotent (check before adding), so safe to run multiple times
CMD ["sh", "-c", "uv run migrations/versions/migrate.py; uv run migrations/versions/add_microsoft_columns.py; uv run migrations/versions/migrate_roles.py; uv run migrations/versions/seed_default_permissions.py; uv run index.py"]