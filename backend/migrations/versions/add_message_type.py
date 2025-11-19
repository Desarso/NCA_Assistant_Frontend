"""
Migration: Add message_type column to message table

This migration adds the missing message_type column and migrates existing data
from the is_user_message boolean field to the new message_type enum field.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import text
from database.models import engine


def upgrade():
    """Add message_type column and migrate existing data."""

    # Step 1: Add the new message_type column
    try:
        with engine.begin() as conn:
            # Add the message_type column with a default value
            conn.execute(text("ALTER TABLE message ADD COLUMN message_type VARCHAR DEFAULT 'user'"))

            # Step 2: Migrate existing data from is_user_message to message_type
            # If is_user_message is True, set message_type to 'user'
            # If is_user_message is False, set message_type to 'assistant' (most common case for existing messages)
            conn.execute(text("""
                UPDATE message
                SET message_type = CASE
                    WHEN is_user_message = 1 THEN 'user'
                    ELSE 'assistant'
                END
            """))

            # Step 3: Drop the old is_user_message column since we no longer need it
            conn.execute(text("ALTER TABLE message DROP COLUMN is_user_message"))

            print("Successfully added message_type column and migrated existing data")

    except Exception as e:
        print(f"Error during migration: {e}")
        raise


def downgrade():
    """Reverse the migration - restore is_user_message column."""

    try:
        with engine.begin() as conn:
            # Add back the is_user_message column
            conn.execute(text("ALTER TABLE message ADD COLUMN is_user_message BOOLEAN DEFAULT 1"))

            # Convert message_type back to boolean
            conn.execute(text("""
                UPDATE message
                SET is_user_message = CASE
                    WHEN message_type = 'user' THEN 1
                    ELSE 0
                END
            """))

            # Drop the message_type column
            conn.execute(text("ALTER TABLE message DROP COLUMN message_type"))

            print("Successfully reversed migration")

    except Exception as e:
        print(f"Error during downgrade: {e}")
        raise


if __name__ == "__main__":
    print("Running message_type column migration...")
    upgrade()
    print("Migration completed successfully!")
