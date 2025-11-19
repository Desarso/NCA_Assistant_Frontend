"""
Seeder for default permissions and roles.
Runs on app startup to ensure basic permissions exist.
"""
import logging
from database.models import Session, engine, Permission, Role, RolePermissionLink
from sqlalchemy import select

logger = logging.getLogger(__name__)

# Hard-coded permissions as primitives
MICROSOFT_ENTRA_APP_PERMISSIONS = "microsoft_entra_app_permissions"
MICROSOFT_ENTRA_DELEGATED_PERMISSIONS = "microsoft_entra_delegated_permissions"

# Default permissions to ensure exist
DEFAULT_PERMISSIONS = [
    {
        "id": MICROSOFT_ENTRA_APP_PERMISSIONS,
        "name": "Microsoft Entra App Permissions",
        "description": "Permission to use Microsoft Graph API with application permissions (requires super_admin role)"
    },
    {
        "id": MICROSOFT_ENTRA_DELEGATED_PERMISSIONS,
        "name": "Microsoft Entra Delegated Permissions",
        "description": "Permission to use Microsoft Graph API with delegated permissions (user's own permissions)"
    }
]

# Default roles to ensure exist
DEFAULT_ROLES = [
    {
        "id": "super_admin",
        "name": "Super Admin",
        "description": "Super administrator with all permissions",
        "permissions": [MICROSOFT_ENTRA_APP_PERMISSIONS, MICROSOFT_ENTRA_DELEGATED_PERMISSIONS]
    },
    {
        "id": "user",
        "name": "User",
        "description": "Default user role with delegated permissions only",
        "permissions": [MICROSOFT_ENTRA_DELEGATED_PERMISSIONS]
    }
]


def seed_permissions_and_roles():
    """Seed default permissions and roles if they don't exist."""
    try:
        with Session(engine) as session:
            # 1. Create permissions first
            logger.info("Seeding permissions...")
            for perm_data in DEFAULT_PERMISSIONS:
                # Use session.get() for primary key lookups (more reliable)
                existing_perm = session.get(Permission, perm_data["id"])
                
                if not existing_perm:
                    perm = Permission(
                        id=perm_data["id"],
                        name=perm_data["name"],
                        description=perm_data["description"]
                    )
                    session.add(perm)
                    logger.info(f"Created permission: {perm_data['id']}")
                else:
                    # Update name/description if they changed
                    updated = False
                    if existing_perm.name != perm_data["name"]:
                        existing_perm.name = perm_data["name"]
                        updated = True
                    if existing_perm.description != perm_data["description"]:
                        existing_perm.description = perm_data["description"]
                        updated = True
                    if updated:
                        logger.info(f"Updated permission: {perm_data['id']}")
                    else:
                        logger.debug(f"Permission already exists: {perm_data['id']}")
            
            session.commit()
            logger.info("Permissions seeded successfully")
            
            # 2. Create roles and assign permissions
            logger.info("Seeding roles...")
            for role_data in DEFAULT_ROLES:
                # Use session.get() for primary key lookups
                existing_role = session.get(Role, role_data["id"])
                
                if not existing_role:
                    role = Role(
                        id=role_data["id"],
                        name=role_data["name"],
                        description=role_data["description"]
                    )
                    session.add(role)
                    session.flush()  # Flush to get the role ID
                    logger.info(f"Created role: {role_data['id']}")
                else:
                    role = existing_role
                    # Update name/description if they changed
                    updated = False
                    if existing_role.name != role_data["name"]:
                        existing_role.name = role_data["name"]
                        updated = True
                    if existing_role.description != role_data["description"]:
                        existing_role.description = role_data["description"]
                        updated = True
                    if updated:
                        logger.info(f"Updated role: {role_data['id']}")
                    else:
                        logger.debug(f"Role already exists: {role_data['id']}")
                
                # Ensure permissions are assigned to role (even if role already exists)
                for perm_id in role_data["permissions"]:
                    # Verify permission exists first using session.get()
                    perm_exists = session.get(Permission, perm_id)
                    
                    if not perm_exists:
                        logger.warning(f"Permission {perm_id} does not exist, skipping assignment to role {role.id}")
                        continue
                    
                    # Check if permission link already exists
                    # For link tables, we need to use select since there's no single primary key
                    existing_link = session.exec(
                        select(RolePermissionLink).where(
                            RolePermissionLink.role_id == role.id,
                            RolePermissionLink.permission_id == perm_id
                        )
                    ).first()
                    
                    if not existing_link:
                        link = RolePermissionLink(
                            role_id=role.id,
                            permission_id=perm_id
                        )
                        session.add(link)
                        logger.info(f"Assigned permission {perm_id} to role {role.id}")
                    else:
                        logger.debug(f"Permission {perm_id} already assigned to role {role.id}")
            
            session.commit()
            logger.info("Roles and permission assignments seeded successfully")
            logger.info("Permissions and roles seeding completed successfully")
            
    except Exception as e:
        logger.error(f"Error seeding permissions and roles: {e}", exc_info=True)
        if 'session' in locals():
            session.rollback()
        raise

