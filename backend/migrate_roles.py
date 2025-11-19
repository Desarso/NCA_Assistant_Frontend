"""
Migration script to create Role and Permission tables and migrate existing roles.
This script:
1. Creates Role and Permission tables
2. Creates association tables (user_role, role_permission)
3. Migrates existing JSON roles to Role table
4. Creates default roles and permissions
"""
import os
import sys
from sqlalchemy import text, inspect

# Ensure working dir and project paths are on sys.path
try:
    cwd = os.getcwd()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    for p in [cwd, project_root, script_dir, "/app", "/app/backend"]:
        if p and p not in sys.path:
            sys.path.append(p)
except Exception:
    pass

try:
    from database.models import engine, User, Role, Permission, create_db_and_tables, Session
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
except Exception as e:
    print(f"[migrate_roles] import failed: {repr(e)}")
    sys.path.append(script_dir)
    from database.models import engine, User, Role, Permission, create_db_and_tables, Session  # type: ignore
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload


def create_role_permission_tables():
    """Create Role and Permission tables if they don't exist"""
    print("Creating Role and Permission tables...")
    create_db_and_tables()
    print("Tables created successfully!")


def create_default_roles_and_permissions():
    """Create default roles and permissions"""
    print("Creating default roles and permissions...")
    
    default_roles = [
        {"id": "super_admin", "name": "Super Admin", "description": "Full system access with application permissions"},
        {"id": "developer", "name": "Developer", "description": "Developer access with all permissions"},
        {"id": "user", "name": "User", "description": "Standard user access"},
        {"id": "whitelisted", "name": "Whitelisted", "description": "Whitelisted user (legacy)"},
    ]
    
    default_permissions = [
        {"id": "read:users", "name": "Read Users", "description": "Can read user information"},
        {"id": "write:users", "name": "Write Users", "description": "Can create/update users"},
        {"id": "read:workflows", "name": "Read Workflows", "description": "Can read workflows"},
        {"id": "write:workflows", "name": "Write Workflows", "description": "Can create/update workflows"},
        {"id": "read:conversations", "name": "Read Conversations", "description": "Can read conversations"},
        {"id": "write:conversations", "name": "Write Conversations", "description": "Can create/update conversations"},
        {"id": "read:files", "name": "Read Files", "description": "Can read files"},
        {"id": "write:files", "name": "Write Files", "description": "Can upload/delete files"},
        {"id": "admin:all", "name": "Admin All", "description": "Full administrative access"},
    ]
    
    # Role-Permission mappings
    role_permissions = {
        "super_admin": ["admin:all"],  # Super admin gets all permissions
        "developer": ["admin:all"],  # Developer gets all permissions
        "user": [
            "read:users",
            "read:workflows",
            "write:workflows",
            "read:conversations",
            "write:conversations",
            "read:files",
            "write:files",
        ],
    }
    
    with Session(engine) as session:
        # Create permissions
        for perm_data in default_permissions:
            existing = session.exec(select(Permission).where(Permission.id == perm_data["id"])).first()
            if not existing:
                permission = Permission(**perm_data)
                session.add(permission)
                print(f"  Created permission: {perm_data['id']}")
        
        # Create roles first
        for role_data in default_roles:
            existing = session.exec(select(Role).where(Role.id == role_data["id"])).first()
            if not existing:
                role = Role(**role_data)
                session.add(role)
                print(f"  Created role: {role_data['id']}")
        
        # Commit all roles first
        session.commit()
        
        # Now assign permissions to roles using raw SQL to avoid relationship issues
        from sqlalchemy import text, inspect as sql_inspect
        
        # Check what tables actually exist
        inspector = sql_inspect(engine)
        tables = inspector.get_table_names()
        print(f"  Available tables: {tables}")
        
        # Verify permissions and roles exist
        all_perms = session.exec(select(Permission)).all()
        all_roles = session.exec(select(Role)).all()
        print(f"  Found {len(all_perms)} permissions and {len(all_roles)} roles")
        
        # SQLModel generates table names from class names - RolePermissionLink -> rolepermissionlink
        # But it might be lowercase with underscores - check actual table name
        link_table_name = None
        for table in tables:
            if 'role' in table.lower() and 'permission' in table.lower() and 'link' in table.lower():
                link_table_name = table
                break
        
        if not link_table_name:
            # Try common variations
            for name in ["rolepermissionlink", "role_permission_link", "rolepermission_link"]:
                if name in tables:
                    link_table_name = name
                    break
        
        if not link_table_name:
            print("  ERROR: Could not find role-permission link table!")
            print(f"  Available tables: {tables}")
            return
        
        print(f"  Using link table: {link_table_name}")
        
        for role_data in default_roles:
            if role_data["id"] in role_permissions:
                role_id = role_data["id"]
                perm_ids = role_permissions[role_id]
                
                # Verify role exists
                role_exists = session.exec(select(Role).where(Role.id == role_id)).first()
                if not role_exists:
                    print(f"    WARNING: Role {role_id} does not exist, skipping")
                    continue
                
                # Use raw SQL to insert into role_permission link table
                for perm_id in perm_ids:
                    # Verify permission exists
                    perm_exists = session.exec(select(Permission).where(Permission.id == perm_id)).first()
                    if not perm_exists:
                        print(f"    WARNING: Permission {perm_id} does not exist, skipping")
                        continue
                    
                    try:
                        # Check if link already exists
                        existing = session.exec(
                            text(f"SELECT 1 FROM {link_table_name} WHERE role_id = :role_id AND permission_id = :perm_id"),
                            {"role_id": role_id, "perm_id": perm_id}
                        ).first()
                        
                        if not existing:
                            session.exec(
                                text(f"INSERT INTO {link_table_name} (role_id, permission_id) VALUES (:role_id, :perm_id)"),
                                {"role_id": role_id, "perm_id": perm_id}
                            )
                            print(f"    Assigned permission {perm_id} to role {role_id}")
                        else:
                            print(f"    Permission {perm_id} already assigned to role {role_id}")
                    except Exception as e:
                        # If link already exists or other error, skip
                        print(f"    ERROR assigning {perm_id} to {role_id}: {e}")
        
        # Commit permission assignments
        session.commit()
        print("Default roles and permissions created successfully!")


def migrate_existing_roles():
    """Migrate existing JSON roles to Role table"""
    print("Migrating existing roles from JSON to Role table...")
    
    with Session(engine) as session:
        # Check if user table has roles column (old JSON format)
        inspector = inspect(engine)
        columns = [col['name'] for col in inspector.get_columns('user')]
        
        if 'roles' not in columns:
            print("  No existing roles column found. Skipping migration.")
            return
        
        # Get all users
        users = session.exec(select(User)).all()
        migrated_count = 0
        
        for user in users:
            # Try to get old JSON roles
            old_roles = None
            try:
                # Try to read from the old JSON column if it exists
                result = session.execute(text(f'SELECT roles FROM "user" WHERE id = :uid'), {"uid": user.id})
                row = result.fetchone()
                if row and row[0]:
                    import json
                    if isinstance(row[0], str):
                        old_roles = json.loads(row[0])
                    elif isinstance(row[0], list):
                        old_roles = row[0]
            except Exception as e:
                print(f"  Warning: Could not read old roles for user {user.id}: {e}")
                continue
            
            if old_roles:
                # Refresh user with roles relationship
                session.refresh(user, ["roles"])
                current_role_ids = {role.id for role in user.roles} if user.roles else set()
                old_role_ids = set(old_roles) if isinstance(old_roles, list) else set()
                
                # Auto-grant super_admin if user has whitelisted
                if 'whitelisted' in old_role_ids and 'super_admin' not in old_role_ids:
                    old_role_ids.add('super_admin')
                
                # Update if different
                if old_role_ids != current_role_ids:
                    roles_to_assign = []
                    for role_id in old_role_ids:
                        role = session.exec(select(Role).where(Role.id == role_id)).first()
                        if not role:
                            # Create role if it doesn't exist
                            role = Role(id=role_id, name=role_id.replace('_', ' ').title())
                            session.add(role)
                            session.flush()
                        roles_to_assign.append(role)
                    
                    user.roles = roles_to_assign
                    session.add(user)
                    migrated_count += 1
                    print(f"  Migrated roles for user {user.id}: {old_role_ids}")
        
        session.commit()
        print(f"Migration complete! Migrated {migrated_count} users.")


def main():
    print("=" * 60)
    print("Role and Permission Migration Script")
    print("=" * 60)
    
    try:
        # Step 1: Create tables
        create_role_permission_tables()
        
        # Step 2: Create default roles and permissions
        create_default_roles_and_permissions()
        
        # Step 3: Migrate existing roles
        migrate_existing_roles()
        
        print("=" * 60)
        print("Migration completed successfully!")
        print("=" * 60)
        
    except Exception as e:
        print(f"Error during migration: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

