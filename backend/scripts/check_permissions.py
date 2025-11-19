#!/usr/bin/env python3
"""
Script to check current permissions and roles in the database
"""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.models import Session, engine, Role, Permission, RolePermissionLink
from sqlalchemy import select

def check_permissions():
    with Session(engine) as session:
        roles = session.exec(select(Role)).all()
        permissions = session.exec(select(Permission)).all()
        links = session.exec(select(RolePermissionLink)).all()
        
        print("=" * 60)
        print("Current Database State")
        print("=" * 60)
        
        print(f"\nRoles ({len(roles)}):")
        for role in roles:
            print(f"  - {role.id}: {role.name} (description: {role.description or 'None'})")
        
        print(f"\nPermissions ({len(permissions)}):")
        for perm in permissions:
            print(f"  - {perm.id}: {perm.name} (description: {perm.description or 'None'})")
        
        print(f"\nRole-Permission Links ({len(links)}):")
        for link in links:
            print(f"  - Role '{link.role_id}' -> Permission '{link.permission_id}'")
        
        # Show what each role should have
        print("\n" + "=" * 60)
        print("Expected State")
        print("=" * 60)
        print("\nExpected Roles:")
        print("  - super_admin: Should have microsoft_entra_app_permissions, microsoft_entra_delegated_permissions")
        print("  - user: Should have microsoft_entra_delegated_permissions")
        
        print("\nExpected Permissions:")
        print("  - microsoft_entra_app_permissions")
        print("  - microsoft_entra_delegated_permissions")
        
        # Check if everything is correct
        print("\n" + "=" * 60)
        print("Validation")
        print("=" * 60)
        
        role_ids = {r.id for r in roles}
        perm_ids = {p.id for p in permissions}
        link_map = {(l.role_id, l.permission_id) for l in links}
        
        expected_roles = {"super_admin", "user"}
        expected_perms = {"microsoft_entra_app_permissions", "microsoft_entra_delegated_permissions"}
        
        missing_roles = expected_roles - role_ids
        missing_perms = expected_perms - perm_ids
        
        if missing_roles:
            print(f"❌ Missing roles: {missing_roles}")
        else:
            print("✅ All expected roles exist")
        
        if missing_perms:
            print(f"❌ Missing permissions: {missing_perms}")
        else:
            print("✅ All expected permissions exist")
        
        # Check links
        expected_links = {
            ("super_admin", "microsoft_entra_app_permissions"),
            ("super_admin", "microsoft_entra_delegated_permissions"),
            ("user", "microsoft_entra_delegated_permissions"),
        }
        
        missing_links = expected_links - link_map
        if missing_links:
            print(f"❌ Missing role-permission links: {missing_links}")
        else:
            print("✅ All expected role-permission links exist")

if __name__ == "__main__":
    check_permissions()

