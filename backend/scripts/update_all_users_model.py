#!/usr/bin/env python3
"""
CLI script to update the preferred_model for all users in the database.

Usage:
    python scripts/update_all_users_model.py [model_name]

Examples:
    python scripts/update_all_users_model.py grok-4-fast
    python scripts/update_all_users_model.py gpt-oss-120b
"""

import sys
import os

# Add the backend directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from database.models import User, engine


def update_all_users_model(model_name: str):
    """Update preferred_model for all users in the database."""

    try:
        with Session(engine) as session:
            # Get all users
            users = session.query(User).all()

            if not users:
                print("No users found in database.")
                return

            print(f"Found {len(users)} users. Updating preferred_model to '{model_name}'...")

            # Update each user
            updated_count = 0
            for user in users:
                user.preferred_model = model_name
                updated_count += 1

            # Commit all changes
            session.commit()

            print(f"✅ Successfully updated {updated_count} users to use '{model_name}' as their preferred model.")

    except Exception as e:
        print(f"❌ Error updating users: {e}")
        sys.exit(1)


def main():
    """Main CLI entry point."""

    if len(sys.argv) != 2:
        print("Usage: python scripts/update_all_users_model.py [model_name]")
        print("\nExamples:")
        print("  python scripts/update_all_users_model.py grok-4-fast")
        print("  python scripts/update_all_users_model.py gpt-oss-120b")
        sys.exit(1)

    model_name = sys.argv[1]

    # Validate model name exists in config
    try:
        from ai.config.models import models
        if model_name not in models:
            print(f"❌ Model '{model_name}' is not defined in the models configuration.")
            print(f"Available models: {', '.join(models.keys())}")
            sys.exit(1)
    except ImportError as e:
        print(f"❌ Could not import models configuration: {e}")
        print("Make sure the backend environment is properly set up.")
        sys.exit(1)

    print(f"🔄 Updating all users to use model: {model_name}")
    update_all_users_model(model_name)


if __name__ == "__main__":
    main()
