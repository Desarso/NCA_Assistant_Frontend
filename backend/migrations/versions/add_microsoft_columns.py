#!/usr/bin/env python3
"""
Migration script to add Microsoft OAuth token columns to the user table.
Run this script to update existing databases.
"""
import os
import sys
from sqlalchemy import text, inspect

# Ensure working dir and project paths are on sys.path
try:
    cwd = os.getcwd()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.dirname(os.path.dirname(script_dir))
    project_root = os.path.dirname(backend_dir)
    for p in [cwd, project_root, backend_dir, script_dir, "/app", "/app/backend"]:
        if p and p not in sys.path:
            sys.path.append(p)
except Exception:
    pass

try:
    from database.models import engine, create_db_and_tables
except Exception as e:
    print(f"[migrate_microsoft] import failed: {repr(e)}")
    sys.path.append(backend_dir)
    from database.models import engine, create_db_and_tables  # type: ignore


def add_microsoft_columns():
    """Add Microsoft OAuth token columns to user table if they don't exist"""
    print("=" * 60)
    print("Microsoft OAuth Columns Migration")
    print("=" * 60)
    
    # First ensure all tables exist (creates new tables like Role, Permission, etc.)
    print("\n1. Creating/updating all tables...")
    create_db_and_tables()
    print("   ✓ Tables created/updated")
    
    try:
        with engine.connect() as conn:
            # Test connectivity
            v = conn.execute(text("SELECT 1")).scalar()
            print(f"   ✓ Database connectivity OK")
            
            # Get existing columns
            inspector = inspect(engine)
            try:
                columns = [col['name'] for col in inspector.get_columns('user')]
                print(f"   ✓ Found {len(columns)} existing columns in user table")
            except Exception as e:
                print(f"   ⚠ Could not inspect user table: {e}")
                columns = []
            
            # Add Microsoft columns if they don't exist
            print("\n2. Adding Microsoft OAuth columns...")
            added_count = 0
            
            if 'microsoft_access_token' not in columns:
                conn.execute(text('ALTER TABLE "user" ADD COLUMN microsoft_access_token TEXT'))
                print("   ✓ Added microsoft_access_token")
                added_count += 1
            else:
                print("   - microsoft_access_token already exists")
            
            if 'microsoft_refresh_token' not in columns:
                conn.execute(text('ALTER TABLE "user" ADD COLUMN microsoft_refresh_token TEXT'))
                print("   ✓ Added microsoft_refresh_token")
                added_count += 1
            else:
                print("   - microsoft_refresh_token already exists")
            
            if 'microsoft_token_expires_at' not in columns:
                conn.execute(text('ALTER TABLE "user" ADD COLUMN microsoft_token_expires_at TIMESTAMP'))
                print("   ✓ Added microsoft_token_expires_at")
                added_count += 1
            else:
                print("   - microsoft_token_expires_at already exists")
            
            if 'microsoft_consent_given' not in columns:
                conn.execute(text('ALTER TABLE "user" ADD COLUMN microsoft_consent_given BOOLEAN DEFAULT FALSE'))
                print("   ✓ Added microsoft_consent_given")
                added_count += 1
            else:
                print("   - microsoft_consent_given already exists")
            
            # Commit changes
            conn.commit()
            
            print(f"\n3. Migration complete!")
            if added_count > 0:
                print(f"   ✓ Added {added_count} new column(s)")
            else:
                print(f"   ✓ All columns already exist - no changes needed")
            
            print("=" * 60)
            print("Migration completed successfully!")
            print("=" * 60)
            
    except Exception as e:
        print(f"\n❌ Error during migration: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    add_microsoft_columns()

