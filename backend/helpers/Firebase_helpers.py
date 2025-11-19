from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials
from firebase_admin import auth
from pydantic import BaseModel
from fastapi.security import HTTPBearer
from typing import List, Callable, Optional
from fastapi import Depends, Request
from database.models import Session, User, Role, Permission, engine, UserRoleLink
from sqlmodel import select
from sqlalchemy.orm import selectinload
import json
import logging


security = HTTPBearer()

DEFAULT_MODEL = "kimi"


class FirebaseUser:
    def __init__(self, uid: str, email: str, roles: List[str], name: str, mcp_servers: List[dict], github_username: Optional[str] = None, github_token: Optional[str] = None, prefered_model: str = DEFAULT_MODEL):
        self.uid = uid
        self.email = email
        self.roles = roles
        self.name = name
        self.mcp_servers = mcp_servers  # List of dicts with server info and enabled status
        self.github_username = github_username
        self.github_token = github_token  # Include token for backend operations
        self.prefered_model = prefered_model  # User's preferred model

class Token(BaseModel):
    access_token: str
    token_type: str






async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> FirebaseUser:
    """
    Validate Firebase ID token and verify the user has access to the resource
    """
    try:
        # The token comes in the format "Bearer <token>"
        token = credentials.credentials
        # Verify the token with Firebase Admin SDK
        decoded_token = auth.verify_id_token(token)
        
        # Get user claims to check
        uid = decoded_token['uid']
        user = auth.get_user(uid)
        
        # Check email
        email = user.email if user.email else decoded_token.get('email', '')
        name = user.display_name if user.display_name else decoded_token.get('name', '')
        
        # Get custom claims
        custom_claims = user.custom_claims or {}
        firebase_roles = custom_claims.get('roles', [])
        mcp_servers = custom_claims.get('mcp_servers', [])  # Get MCP servers from custom claims
        
        # Get or create user in database
        with Session(engine) as session:
            db_user = session.exec(select(User).where(User.id == uid)).first()
            
            if not db_user:
                # Create new user if doesn't exist
                db_user = User(
                    id=uid,
                    email=email,
                    name=name,
                    preferred_model=DEFAULT_MODEL  # Default model
                )
                session.add(db_user)
                session.commit()
                session.refresh(db_user)
            
            # Sync roles from Firebase to database using Role table
            # Use session.get() to get a proper User instance (not Row)
            db_user = session.get(User, uid)
            
            if not db_user:
                raise HTTPException(status_code=404, detail="User not found after creation")
            
            # Safely get current role IDs - trigger lazy load
            try:
                _ = db_user.roles  # Trigger lazy load
                current_role_ids = {role.id for role in db_user.roles} if db_user.roles else set()
            except Exception as e:
                logging.warning(f"Error accessing roles for user {uid}: {e}, defaulting to empty set")
                current_role_ids = set()
            
            # Start with Firebase roles
            synced_role_ids = set(firebase_roles) if firebase_roles else set()
            
            # Auto-grant super_admin if user has whitelisted claim
            if 'whitelisted' in firebase_roles and 'super_admin' not in synced_role_ids:
                synced_role_ids.add('super_admin')
            
            # Update database roles if they differ
            if synced_role_ids != current_role_ids:
                # Use session.get() to get a proper User instance (not Row)
                db_user_for_update = session.get(User, uid)
                
                if not db_user_for_update:
                    raise HTTPException(status_code=404, detail="User not found for role update")
                
                # Get or create roles
                roles_to_assign = []
                for role_id in synced_role_ids:
                    role = session.get(Role, role_id)
                    if not role:
                        # Create role if it doesn't exist
                        role = Role(id=role_id, name=role_id.replace('_', ' ').title())
                        session.add(role)
                        session.flush()  # Flush to get the role ID
                    roles_to_assign.append(role)
                
                # Load the roles relationship by accessing it (lazy load)
                # This will trigger SQLAlchemy to load the relationship
                _ = db_user_for_update.roles  # Trigger lazy load
                
                # Update user's roles by clearing and reassigning
                # Initialize roles list if None
                if db_user_for_update.roles is None:
                    db_user_for_update.roles = []
                else:
                    # Clear existing roles
                    db_user_for_update.roles.clear()
                
                # Add new roles
                for role in roles_to_assign:
                    if role not in db_user_for_update.roles:
                        db_user_for_update.roles.append(role)
                
                session.add(db_user_for_update)
                session.commit()
                logging.info(f"Updated roles for user {uid}: {current_role_ids} -> {synced_role_ids}")
            
            # Get final role IDs for FirebaseUser object
            # Use session.get() to get a proper User instance
            db_user_final = session.get(User, uid)
            
            if not db_user_final:
                raise HTTPException(status_code=404, detail="User not found when loading final roles")
            
            # Safely get role IDs - trigger lazy load by accessing the relationship
            try:
                _ = db_user_final.roles  # Trigger lazy load
                final_role_ids = [role.id for role in db_user_final.roles] if db_user_final.roles else []
            except Exception as e:
                logging.warning(f"Error accessing roles for user {uid}: {e}, defaulting to empty list")
                final_role_ids = []
            
            # Safely get values with defaults (use db_user_final which has all the latest data)
            github_username = getattr(db_user_final, 'github_username', None)
            github_token = getattr(db_user_final, 'github_token', None)
            prefered_model = getattr(db_user_final, 'preferred_model', DEFAULT_MODEL)
        
        # Create user object with roles from database
        firebase_user = FirebaseUser(
            uid=uid,
            email=email,
            roles=final_role_ids,  # Use role IDs from database (synced from Firebase)
            name=name,
            mcp_servers=mcp_servers,
            github_username=github_username,
            github_token=github_token,
            prefered_model=prefered_model,
        )

        # Expose the authenticated user on the request for downstream handlers
        if request is not None:
            request.state.user = firebase_user

        return firebase_user
        
    except auth.RevokedIdTokenError:
        raise HTTPException(status_code=401, detail="Firebase ID token has been revoked. Please sign in again.")
    except auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Firebase ID token has expired. Please sign in again.")
    except auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Invalid Firebase ID token. Please sign in again.")
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logging.error(f"Unexpected error validating Firebase ID token: {str(e)}\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"Unexpected error validating Firebase ID token: {str(e)}")
    

def role_based_access(required_roles: List[str]) -> Callable:
    """
    Factory function to create a dependency that checks if the user has the required roles.
    Reads roles directly from Role table in database.
    """
    async def check_role(request: Request, current_user: FirebaseUser = Depends(get_current_user)) -> None:
        """
        Dependency that checks if the user has the required roles.
        Reads roles directly from the Role table to ensure we have the latest role information.
        """
        try:
            # Read roles directly from database Role table
            with Session(engine) as session:
                db_user = session.exec(
                    select(User)
                    .where(User.id == current_user.uid)
                    .options(selectinload(User.roles))
                ).first()
                
                if not db_user:
                    raise HTTPException(
                        status_code=404,
                        detail="User not found in database"
                    )
                
                # Get role IDs using the helper property
                # Note: roles relationship must be loaded (e.g. via selectinload above) for this to work without detached instance error
                try:
                    user_role_ids = set(db_user.roles_list)
                except Exception as e:
                    logging.warning(f"Error accessing roles_list, reloading user: {e}")
                    # Fallback: reload user if detached
                    db_user = session.get(User, current_user.uid)
                    user_role_ids = set(db_user.roles_list) if db_user else set()
                
                # Check if all required roles are present
                missing_roles = [role for role in required_roles if role not in user_role_ids]

                # If user has developer role, grant access to all roles
                if "developer" in user_role_ids:
                    missing_roles = []

                if missing_roles:
                    raise HTTPException(
                        status_code=403,
                        detail=f"User does not have the required roles: {', '.join(missing_roles)}. User roles: {list(user_role_ids)}"
                    )
            
            # Store the user in the request state so it can be accessed in endpoints
            request.state.user = current_user

        except HTTPException:
            # Re-raise HTTP exceptions (like 403, 404)
            raise
        except Exception as e:
            logging.error(f"Error checking user roles from database: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Error checking user roles: {str(e)}"
            )
    return check_role


def permission_based_access(required_permissions: List[str]) -> Callable:
    """
    Factory function to create a dependency that checks if the user has the required permissions.
    Checks permissions through the user's roles.
    """
    async def check_permission(request: Request, current_user: FirebaseUser = Depends(get_current_user)) -> None:
        """
        Dependency that checks if the user has the required permissions through their roles.
        """
        try:
            with Session(engine) as session:
                db_user = session.exec(
                    select(User)
                    .where(User.id == current_user.uid)
                    .options(selectinload(User.roles).selectinload(Role.permissions))
                ).first()
                
                if not db_user:
                    raise HTTPException(
                        status_code=404,
                        detail="User not found in database"
                    )
                
                # Collect all permissions from user's roles
                user_permissions = set()
                if db_user.roles:
                    for role in db_user.roles:
                        if role.permissions:
                            for perm in role.permissions:
                                user_permissions.add(perm.id)
                
                # Check if all required permissions are present
                missing_permissions = [perm for perm in required_permissions if perm not in user_permissions]
                
                # If user has developer role, grant all permissions
                user_role_ids = {role.id for role in db_user.roles} if db_user.roles else set()
                if "developer" in user_role_ids:
                    missing_permissions = []

                if missing_permissions:
                    raise HTTPException(
                        status_code=403,
                        detail=f"User does not have the required permissions: {', '.join(missing_permissions)}"
                    )
            
            request.state.user = current_user

        except HTTPException:
            raise
        except Exception as e:
            logging.error(f"Error checking user permissions: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Error checking user permissions: {str(e)}"
            )
    return check_permission