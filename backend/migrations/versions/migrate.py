#!/usr/bin/env python3
import os
import sys
from sqlalchemy import text, inspect

# Ensure working dir and project paths are on sys.path and show debug info
try:
    cwd = os.getcwd()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    for p in [cwd, project_root, script_dir, "/app", "/app/backend"]:
        if p and p not in sys.path:
            sys.path.append(p)
    print("[migrate] CWD:", cwd)
    print("[migrate] script_dir:", script_dir)
    print("[migrate] project_root:", project_root)
    print("[migrate] sys.path (head):", sys.path[:8])
    try:
        print("[migrate] /app list:", os.listdir("/app"))
    except Exception as e:
        print("[migrate] /app list error:", e)
    try:
        if os.path.exists("/app/db"):
            print("[migrate] /app/db list:", os.listdir("/app/db"))
        else:
            print("[migrate] /app/db does not exist")
    except Exception as e:
        print("[migrate] /app/db list error:", e)
except Exception as e:
    print("[migrate] path bootstrap error:", e)

try:
    from database.models import engine, User, create_db_and_tables
except Exception as e:
    print("[migrate] import database.models failed:", repr(e))
    # Try relative import fallback if running from /app/backend
    try:
        sys.path.append(script_dir)
        from database.models import engine, User, create_db_and_tables  # type: ignore
    except Exception as e2:
        print("[migrate] fallback import failed:", repr(e2))
        raise

def add_new_columns():
    # Show DB URL and test connectivity
    db_url = os.getenv("DATABASE_URL")
    print("[migrate] DATABASE_URL:", db_url)
    # First ensure all tables exist
    create_db_and_tables()
    try:
        with engine.connect() as conn:
            v = conn.execute(text("SELECT 1")).scalar()
            print("[migrate] DB connectivity OK, SELECT 1 ->", v)
            try:
                ver = conn.execute(text("SELECT version()"))
                print("[migrate] DB version:", ver.fetchone()[0])
            except Exception:
                pass
    except Exception as e:
        print("[migrate] DB connectivity error:", repr(e))
    
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns('user')]
    
    with engine.connect() as conn:
        # Add columns if they don't exist
        # Quote table name "user" to avoid conflicts with Postgres reserved keyword
        if 'github_token' not in columns:
            conn.execute(text('ALTER TABLE "user" ADD COLUMN github_token TEXT'))
        if 'github_username' not in columns:
            conn.execute(text('ALTER TABLE "user" ADD COLUMN github_username TEXT'))
        if 'preferred_model' not in columns:
            conn.execute(text("ALTER TABLE \"user\" ADD COLUMN preferred_model TEXT DEFAULT 'gemini'"))
        # Add Microsoft OAuth token columns
        if 'microsoft_access_token' not in columns:
            conn.execute(text('ALTER TABLE "user" ADD COLUMN microsoft_access_token TEXT'))
        if 'microsoft_refresh_token' not in columns:
            conn.execute(text('ALTER TABLE "user" ADD COLUMN microsoft_refresh_token TEXT'))
        if 'microsoft_token_expires_at' not in columns:
            conn.execute(text('ALTER TABLE "user" ADD COLUMN microsoft_token_expires_at TIMESTAMP'))
        if 'microsoft_consent_given' not in columns:
            conn.execute(text('ALTER TABLE "user" ADD COLUMN microsoft_consent_given BOOLEAN DEFAULT FALSE'))
        # Add roles column (stored as JSON)
        if 'roles' not in columns:
            # Check database type to use appropriate JSON column type
            try:
                # Try PostgreSQL JSONB first
                conn.execute(text('ALTER TABLE "user" ADD COLUMN roles JSONB'))
            except Exception:
                try:
                    # Fall back to JSON
                    conn.execute(text('ALTER TABLE "user" ADD COLUMN roles JSON'))
                except Exception:
                    # Fall back to TEXT for SQLite
                    conn.execute(text('ALTER TABLE "user" ADD COLUMN roles TEXT'))
        conn.commit()

if __name__ == "__main__":
    print("Starting database migration...")
    add_new_columns()
    print("Database migration completed successfully!") 