"""
Migration: Seed default permissions and roles

This migration ensures that default permissions and roles exist:
- Permissions: microsoft_entra_app_permissions, microsoft_entra_delegated_permissions
- Roles: super_admin (with both permissions), user (with delegated permissions only)
"""
import os
import sys

# Ensure working dir and project paths are on sys.path
try:
    cwd = os.getcwd()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(script_dir))
    for p in [cwd, project_root, script_dir, "/app", "/app/backend"]:
        if p and p not in sys.path:
            sys.path.append(p)
except Exception:
    pass

try:
    from database.seed_permissions import seed_permissions_and_roles
except Exception as e:
    print(f"[seed_default_permissions] import failed: {repr(e)}")
    sys.path.append(script_dir)
    from database.seed_permissions import seed_permissions_and_roles  # type: ignore


def upgrade():
    """Seed default permissions and roles."""
    print("=" * 60)
    print("Seeding Default Permissions and Roles")
    print("=" * 60)
    
    try:
        seed_permissions_and_roles()
        print("=" * 60)
        print("Migration completed successfully!")
        print("=" * 60)
    except Exception as e:
        print(f"Error during migration: {e}")
        import traceback
        traceback.print_exc()
        raise


def downgrade():
    """Reverse migration - remove default permissions and roles."""
    # Note: This is a destructive operation, so we'll just log it
    print("Downgrade not implemented for seed migration")
    print("Default permissions and roles will remain in the database")


if __name__ == "__main__":
    upgrade()

