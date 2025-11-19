"""
Helper functions for managing roles and permissions in the database.
"""
from typing import List, Optional
import logging

from firebase_admin import auth
from sqlmodel import select
from sqlalchemy.orm import selectinload

from database.models import Session, User, Role, Permission, UserRoleLink, engine

logger = logging.getLogger(__name__)


def _sync_user_roles_to_firebase(session: Session, user_id: str) -> None:
    """Update the Firebase custom claims to match roles stored in the database."""
    try:
        user = session.exec(
            select(User)
            .where(User.id == user_id)
            .options(selectinload(User.roles))
        ).first()
        role_ids = [role.id for role in (user.roles or [])] if user else []
    except Exception as e:
        logger.warning(f"Unable to load roles for user {user_id} during Firebase sync: {e}")
        role_ids = []
    
    try:
        user_record = auth.get_user(user_id)
        custom_claims = dict(user_record.custom_claims or {})
        custom_claims["roles"] = role_ids
        auth.set_custom_user_claims(user_id, custom_claims)
        logger.info(f"Synced Firebase custom claims for user {user_id}: {role_ids}")
    except Exception as e:
        logger.warning(f"Failed to update Firebase custom claims for user {user_id}: {e}")


def get_user_roles(user_id: str) -> List[Role]:
    """Get all roles for a user"""
    with Session(engine) as session:
        user = session.exec(
            select(User)
            .where(User.id == user_id)
            .options(selectinload(User.roles))
        ).first()
        return list(user.roles) if user and user.roles else []


def get_user_permissions(user_id: str) -> List[str]:
    """Get all permission IDs for a user (through their roles)"""
    with Session(engine) as session:
        user = session.exec(
            select(User)
            .where(User.id == user_id)
            .options(selectinload(User.roles).selectinload(Role.permissions))
        ).first()
        
        if not user or not user.roles:
            return []
        
        permissions = set()
        for role in user.roles:
            if role.permissions:
                for perm in role.permissions:
                    permissions.add(perm.id)
        
        return list(permissions)


def assign_role_to_user(user_id: str, role_id: str) -> bool:
    """Assign a role to a user"""
    try:
        with Session(engine) as session:
            user = session.exec(
                select(User)
                .where(User.id == user_id)
                .options(selectinload(User.roles))
            ).first()
            
            if not user:
                logger.error(f"User {user_id} not found")
                return False
            
            role = session.exec(select(Role).where(Role.id == role_id)).first()
            if not role:
                logger.error(f"Role {role_id} not found")
                return False
            
            if role not in (user.roles or []):
                if user.roles is None:
                    user.roles = []
                user.roles.append(role)
                session.add(user)
                session.commit()
                _sync_user_roles_to_firebase(session, user_id)
                logger.info(f"Assigned role {role_id} to user {user_id}")
                return True
            else:
                logger.info(f"User {user_id} already has role {role_id}")
                return True
    except Exception as e:
        logger.error(f"Error assigning role {role_id} to user {user_id}: {e}")
        return False


def remove_role_from_user(user_id: str, role_id: str) -> bool:
    """Remove a role from a user"""
    try:
        with Session(engine) as session:
            # Remove link row first to handle missing Role records and ensure commit
            link = session.get(UserRoleLink, (user_id, role_id))
            
            if link:
                session.delete(link)
                session.commit()
                _sync_user_roles_to_firebase(session, user_id)
                logger.info(f"Removed role link {role_id} from user {user_id}")
                return True
            
            # Fall back to relationship removal if link didn't exist but ORM still has it cached
            user = session.exec(
                select(User)
                .where(User.id == user_id)
                .options(selectinload(User.roles))
            ).first()
            
            if user and user.roles:
                matched_role = next((role for role in user.roles if role.id == role_id), None)
                if matched_role:
                    user.roles.remove(matched_role)
                    session.add(user)
                    session.commit()
                    _sync_user_roles_to_firebase(session, user_id)
                    logger.info(f"Removed role {role_id} from user {user_id} via relationship cleanup")
                    return True
            
            return False
    except Exception as e:
        logger.error(f"Error removing role {role_id} from user {user_id}: {e}")
        return False


def assign_permission_to_role(role_id: str, permission_id: str) -> bool:
    """Assign a permission to a role"""
    try:
        with Session(engine) as session:
            role = session.exec(
                select(Role)
                .where(Role.id == role_id)
                .options(selectinload(Role.permissions))
            ).first()
            
            if not role:
                logger.error(f"Role {role_id} not found")
                return False
            
            permission = session.exec(select(Permission).where(Permission.id == permission_id)).first()
            if not permission:
                logger.error(f"Permission {permission_id} not found")
                return False
            
            if permission not in (role.permissions or []):
                if role.permissions is None:
                    role.permissions = []
                role.permissions.append(permission)
                session.add(role)
                session.commit()
                logger.info(f"Assigned permission {permission_id} to role {role_id}")
                return True
            return True
    except Exception as e:
        logger.error(f"Error assigning permission {permission_id} to role {role_id}: {e}")
        return False


def create_role(role_id: str, name: str, description: Optional[str] = None) -> Optional[Role]:
    """Create a new role"""
    try:
        with Session(engine) as session:
            existing = session.exec(select(Role).where(Role.id == role_id)).first()
            if existing:
                logger.warning(f"Role {role_id} already exists")
                return existing
            
            role = Role(id=role_id, name=name, description=description)
            session.add(role)
            session.commit()
            session.refresh(role)
            logger.info(f"Created role: {role_id}")
            return role
    except Exception as e:
        logger.error(f"Error creating role {role_id}: {e}")
        return None


def create_permission(permission_id: str, name: str, description: Optional[str] = None) -> Optional[Permission]:
    """Create a new permission"""
    try:
        with Session(engine) as session:
            existing = session.exec(select(Permission).where(Permission.id == permission_id)).first()
            if existing:
                logger.warning(f"Permission {permission_id} already exists")
                return existing
            
            permission = Permission(id=permission_id, name=name, description=description)
            session.add(permission)
            session.commit()
            session.refresh(permission)
            logger.info(f"Created permission: {permission_id}")
            return permission
    except Exception as e:
        logger.error(f"Error creating permission {permission_id}: {e}")
        return None


def user_has_role(user_id: str, role_id: str) -> bool:
    """Check if a user has a specific role"""
    roles = get_user_roles(user_id)
    return any(role.id == role_id for role in roles)


def user_has_permission(user_id: str, permission_id: str) -> bool:
    """Check if a user has a specific permission (through their roles)"""
    permissions = get_user_permissions(user_id)
    return permission_id in permissions


def remove_permission_from_role(role_id: str, permission_id: str) -> bool:
    """Remove a permission from a role"""
    try:
        with Session(engine) as session:
            # Get the role with permissions loaded
            role = session.exec(
                select(Role)
                .where(Role.id == role_id)
                .options(selectinload(Role.permissions))
            ).first()
            
            if not role:
                logger.error(f"Role {role_id} not found")
                return False
            
            # Find the permission
            permission = session.get(Permission, permission_id)
            if not permission:
                logger.error(f"Permission {permission_id} not found")
                return False
            
            # Remove permission from role
            if role.permissions and permission in role.permissions:
                role.permissions.remove(permission)
                session.add(role)
                session.commit()
                logger.info(f"Removed permission {permission_id} from role {role_id}")
                return True
            else:
                logger.info(f"Permission {permission_id} not assigned to role {role_id}")
                return True  # Already not assigned, consider it success
    except Exception as e:
        logger.error(f"Error removing permission {permission_id} from role {role_id}: {e}")
        return False


def update_role_permissions(role_id: str, permission_ids: List[str]) -> bool:
    """Update all permissions for a role (replaces existing permissions)"""
    try:
        with Session(engine) as session:
            # Get the role with permissions loaded
            role = session.exec(
                select(Role)
                .where(Role.id == role_id)
                .options(selectinload(Role.permissions))
            ).first()
            
            if not role:
                logger.error(f"Role {role_id} not found")
                return False
            
            # Get all permissions that should be assigned
            permissions_to_assign = []
            for perm_id in permission_ids:
                perm = session.get(Permission, perm_id)
                if perm:
                    permissions_to_assign.append(perm)
                else:
                    logger.warning(f"Permission {perm_id} not found, skipping")
            
            # Replace role's permissions
            role.permissions = permissions_to_assign
            session.add(role)
            session.commit()
            logger.info(f"Updated permissions for role {role_id}: {permission_ids}")
            return True
    except Exception as e:
        logger.error(f"Error updating permissions for role {role_id}: {e}")
        return False

