from fastapi import APIRouter, HTTPException, Request, Depends, UploadFile, File
from firebase_admin import auth, storage
from helpers.Firebase_helpers import Token
from fastapi.security import (
    OAuth2PasswordRequestForm,
)
import uuid
import logging
from models.general import UserCredentials
from typing import List, Optional
from pydantic import BaseModel
from collections import defaultdict
from helpers.Firebase_helpers import FirebaseUser, get_current_user, role_based_access
from database.models import get_session, User, Role, Permission, Session, engine, UserRoleLink, RolePermissionLink, Conversation, Message
from requests import Session as DBSession
from datetime import datetime, timedelta
from helpers.RequestHelper import encrypt_token
from sqlmodel import select

user_router = APIRouter(prefix="/users")



@user_router.post("/auth/login", response_model=Token, tags=["authentication"])
async def login_for_access_token(credentials: UserCredentials):
    """
    Login with email/password to get a Firebase token for API access

    This endpoint is primarily for testing in Swagger UI.
    """
    try:
        # Sign in with Firebase Auth
        user = auth.get_user_by_email(credentials.email)

        # Create a custom token
        custom_token = auth.create_custom_token(user.uid)

        # In a real application, you would exchange this for an ID token
        # Here we're using it directly for simplicity in Swagger UI testing

        return {
            "access_token": custom_token.decode("utf-8")
            if isinstance(custom_token, bytes)
            else custom_token,
            "token_type": "bearer",
        }
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail=f"Authentication failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


@user_router.post("/auth/token", response_model=Token, tags=["authentication"])
async def login_oauth(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    OAuth2 compatible token endpoint for Swagger UI
    """
    try:
        # Sign in with Firebase Auth
        user = auth.get_user_by_email(
            form_data.username
        )  # Using username field for email

        # Create a custom token
        custom_token = auth.create_custom_token(user.uid)

        return {
            "access_token": custom_token.decode("utf-8")
            if isinstance(custom_token, bytes)
            else custom_token,
            "token_type": "bearer",
        }
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail=f"Authentication failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


@user_router.get("/auth/me", response_model=dict, tags=["authentication"])
async def get_current_user_info(request: Request):

    current_user = request.state.user
    
    """
    Return information about the currently authenticated user
    """
    return {
        "status": "success",
        "user": {
            "uid": current_user.uid,
            "email": current_user.email,
            "roles": current_user.roles,
        },
    }


@user_router.post("/profile/picture", response_model=dict, tags=["user"])
async def upload_profile_picture(
    file: UploadFile = File(...),
    request: Request = None
):
    """
    Upload a profile picture for the current user
    """
    try:
        # Get current user
        current_user = request.state.user
        
        # Validate file type
        if not file.content_type.startswith('image/'):
            raise HTTPException(
                status_code=400,
                detail="File must be an image"
            )
        
            
        # Read file content
        file_content = await file.read()
        
        # Generate unique filename
        file_extension = file.filename.split('.')[-1]
        filename = f"profile_pictures/{current_user.uid}/{uuid.uuid4()}.{file_extension}"
        
        # Get storage bucket
        bucket = storage.bucket()
        blob = bucket.blob(filename)

        
        # Upload file
        try:
            blob.upload_from_string(
                file_content,
                content_type=file.content_type
            )
        except Exception as e:
            print(e)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to upload profile picture: {str(e)}"
            )

        
        # Make the file publicly accessible
        blob.make_public()

        print("made it here 3")
        
        # Get the public URL
        public_url = blob.public_url
        
        # Update user's profile picture URL in Firebase Auth
        auth.update_user(
            current_user.uid,
            photo_url=public_url
        )
        
        return {
            "status": "success",
            "message": "Profile picture uploaded successfully",
            "photo_url": public_url
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload profile picture: {str(e)}"
        )


class UserResponse(BaseModel):
    id: str
    email: str
    displayName: str | None = None

@user_router.get("/search", response_model=List[UserResponse])
async def search_users(
    q: str = "",
    current_user: FirebaseUser = Depends(get_current_user)
):
    """Search for users by email or display name. Returns all users (up to 10) if no search term provided."""
    try:
        # List all users (in production, you'd want to paginate this)
        # For now, we'll limit to first 100 users
        users = auth.list_users().users

        # If no search query, return all users (up to 10)
        if not q.strip():
            all_users = [
                UserResponse(
                    id=user.uid,
                    email=user.email,
                    displayName=user.display_name
                )
                for user in users
            ]
            # Sort alphabetically by email and limit to 10
            return sorted(all_users, key=lambda u: u.email.lower())[:10]

        # Filter users based on search query
        query = q.lower()
        filtered_users = [
            UserResponse(
                id=user.uid,
                email=user.email,
                displayName=user.display_name
            )
            for user in users
            if query in user.email.lower() or 
               (user.display_name and query in user.display_name.lower())
        ]

        # Sort by relevance (exact matches first, then partial matches)
        # and limit to first 10 results
        sorted_users = sorted(
            filtered_users,
            key=lambda u: (
                not u.email.lower().startswith(query),  # Exact start matches first
                not query in u.email.lower(),           # Contains matches second
                u.email.lower()                         # Alphabetical within each group
            )
        )[:10]

        return sorted_users

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Preferred model endpoints
@user_router.get("/preferred-model", response_model=dict, tags=["user"])
async def get_preferred_model(request: Request, session: DBSession = Depends(get_session)):
    current_user = request.state.user
    user = session.get(User, current_user.uid)
    return {"status": "success", "preferred_model": getattr(user, 'preferred_model', None)}


@user_router.patch("/preferred-model", response_model=dict, tags=["user"])
async def update_preferred_model(model: str, request: Request, session: DBSession = Depends(get_session)):
    current_user = request.state.user
    user = session.get(User, current_user.uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.preferred_model = model
    session.add(user)
    session.commit()
    return {"status": "success", "preferred_model": user.preferred_model}


class MicrosoftTokenRequest(BaseModel):
    """Request model for storing Microsoft OAuth token"""
    access_token: str
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = 3600  # Default to 1 hour if not provided


@user_router.post("/microsoft-token", response_model=dict, tags=["user"])
async def store_microsoft_token(
    token_data: MicrosoftTokenRequest,
    request: Request,
    session: DBSession = Depends(get_session)
):
    """
    Store Microsoft OAuth token for the current user.
    This token is extracted from Firebase OAuth credential after Microsoft login.
    """
    current_user = request.state.user
    
    try:
        user = session.get(User, current_user.uid)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Encrypt tokens before storing
        user.microsoft_access_token = encrypt_token(token_data.access_token)
        
        if token_data.refresh_token:
            user.microsoft_refresh_token = encrypt_token(token_data.refresh_token)
        
        # Calculate expiration time
        expires_in = token_data.expires_in or 3600
        user.microsoft_token_expires_at = datetime.now() + timedelta(seconds=expires_in)
        user.microsoft_consent_given = True
        
        session.add(user)
        session.commit()
        
        return {
            "status": "success",
            "message": "Microsoft token stored successfully",
            "expires_at": user.microsoft_token_expires_at.isoformat()
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to store Microsoft token: {str(e)}"
        )


#####################################################
# Admin Routes - Super Admin Only
#####################################################

class UserWithRolesResponse(BaseModel):
    """Response model for user with roles and permissions"""
    id: str
    email: str
    name: Optional[str] = None
    roles: List[str] = []
    permissions: List[str] = []
    created_at: Optional[str] = None
    microsoft_consent_given: bool = False
    total_bytes: int = 0  # Total word count across all conversations


class RoleResponse(BaseModel):
    """Response model for role with permissions"""
    id: str
    name: str
    description: Optional[str] = None
    permissions: List[str] = []
    user_count: int = 0


class PermissionResponse(BaseModel):
    """Response model for permission"""
    id: str
    name: str
    description: Optional[str] = None
    roles: List[str] = []


@user_router.get("/admin/users", response_model=List[UserWithRolesResponse], tags=["admin"])
async def list_all_users(
    request: Request,
    session: DBSession = Depends(get_session),
    _: None = Depends(role_based_access(["super_admin"]))
):
    """
    List all users with their roles and permissions.
    Super admin only.
    """
    try:
        with Session(engine) as db_session:
            # Fetch all data in separate queries to avoid relationship loading issues
            users = db_session.exec(select(User)).all()
            user_role_links = db_session.exec(select(UserRoleLink)).all()
            role_permission_links = db_session.exec(select(RolePermissionLink)).all()
            
            # Build lookup maps
            roles_by_user = defaultdict(list)
            for link in user_role_links:
                roles_by_user[link.user_id].append(link.role_id)
                
            perms_by_role = defaultdict(list)
            for link in role_permission_links:
                perms_by_role[link.role_id].append(link.permission_id)
            
            result = []
            for user in users:
                role_ids = roles_by_user.get(user.id, [])
                
                # Aggregate permissions from all roles
                permissions = set()
                for rid in role_ids:
                    for pid in perms_by_role.get(rid, []):
                        permissions.add(pid)
                
                created_ts = user.created_at
                created_at_str = (
                    created_ts.isoformat()
                    if created_ts is not None and hasattr(created_ts, "isoformat")
                    else str(created_ts) if created_ts is not None else None
                )

                # Calculate total word count (total_bytes) from all user messages
                total_bytes = 0
                try:
                    # Get all conversations for this user
                    user_conversations = db_session.exec(
                        select(Conversation).where(Conversation.user_id == user.id)
                    ).all()
                    
                    # Get all messages from these conversations
                    conversation_ids = [conv.id for conv in user_conversations]
                    if conversation_ids:
                        all_messages = db_session.exec(
                            select(Message).where(Message.conversation_id.in_(conversation_ids))
                        ).all()
                        
                        # Count words in all message content and reasoning
                        for msg in all_messages:
                            if msg.content:
                                total_bytes += len(msg.content.split())
                            if msg.reasoning:
                                total_bytes += len(msg.reasoning.split())
                except Exception as e:
                    logging.warning(f"Error calculating total_bytes for user {user.id}: {e}")
                    total_bytes = 0

                result.append(UserWithRolesResponse(
                    id=user.id,
                    email=user.email,
                    name=user.name,
                    roles=role_ids,
                    permissions=list(permissions),
                    created_at=created_at_str,
                    microsoft_consent_given=user.microsoft_consent_given or False,
                    total_bytes=total_bytes
                ))
            
            return result
    except Exception as e:
        import traceback
        logging.error(f"Error listing users: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to list users: {str(e)}")


@user_router.get("/admin/users/{user_id}", response_model=UserWithRolesResponse, tags=["admin"])
async def get_user_details(
    user_id: str,
    request: Request,
    session: DBSession = Depends(get_session),
    _: None = Depends(role_based_access(["super_admin"]))
):
    """
    Get detailed information about a specific user including roles and permissions.
    Super admin only.
    """
    try:
        with Session(engine) as db_session:
            user = db_session.exec(select(User).where(User.id == user_id)).first()
            
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            
            # Fetch links specifically for this user
            user_role_links = db_session.exec(
                select(UserRoleLink).where(UserRoleLink.user_id == user_id)
            ).all()
            role_ids = [link.role_id for link in user_role_links]
            
            # Fetch permissions for these roles
            permissions = set()
            if role_ids:
                role_permission_links = db_session.exec(
                    select(RolePermissionLink).where(RolePermissionLink.role_id.in_(role_ids))
                ).all()
                permissions = {link.permission_id for link in role_permission_links}
            
            created_ts = user.created_at
            created_at_str = (
                created_ts.isoformat()
                if created_ts is not None and hasattr(created_ts, "isoformat")
                else str(created_ts) if created_ts is not None else None
            )

            # Calculate total word count (total_bytes) from all user messages
            total_bytes = 0
            try:
                # Get all conversations for this user
                user_conversations = db_session.exec(
                    select(Conversation).where(Conversation.user_id == user_id)
                ).all()
                
                # Get all messages from these conversations
                conversation_ids = [conv.id for conv in user_conversations]
                if conversation_ids:
                    all_messages = db_session.exec(
                        select(Message).where(Message.conversation_id.in_(conversation_ids))
                    ).all()
                    
                    # Count words in all message content and reasoning
                    for msg in all_messages:
                        if msg.content:
                            total_bytes += len(msg.content.split())
                        if msg.reasoning:
                            total_bytes += len(msg.reasoning.split())
            except Exception as e:
                logging.warning(f"Error calculating total_bytes for user {user_id}: {e}")
                total_bytes = 0

            return UserWithRolesResponse(
                id=user.id,
                email=user.email,
                name=user.name,
                roles=role_ids,
                permissions=list(permissions),
                created_at=created_at_str,
                microsoft_consent_given=user.microsoft_consent_given or False,
                total_bytes=total_bytes
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get user details: {str(e)}")


@user_router.get("/admin/roles", response_model=List[RoleResponse], tags=["admin"])
async def list_all_roles(
    request: Request,
    session: DBSession = Depends(get_session),
    _: None = Depends(role_based_access(["super_admin"]))
):
    """
    List all roles with their permissions and user counts.
    Super admin only.
    """
    try:
        with Session(engine) as db_session:
            # Query roles directly
            roles = db_session.exec(select(Role)).all()
            
            # Query permissions and user counts separately using joins
            from database.models import RolePermissionLink, UserRoleLink
            
            result = []
            for role in roles:
                # Get permissions for this role via join
                role_permissions = db_session.exec(
                    select(Permission)
                    .join(RolePermissionLink, Permission.id == RolePermissionLink.permission_id)
                    .where(RolePermissionLink.role_id == role.id)
                ).all()
                permission_ids = [perm.id for perm in role_permissions]
                
                # Get user count for this role
                user_count = db_session.exec(
                    select(UserRoleLink)
                    .where(UserRoleLink.role_id == role.id)
                ).all()
                user_count = len(user_count)
                
                result.append(RoleResponse(
                    id=role.id,
                    name=role.name,
                    description=role.description,
                    permissions=permission_ids,
                    user_count=user_count
                ))
            
            return result
    except Exception as e:
        import traceback
        logging.error(f"Error listing roles: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to list roles: {str(e)}")


@user_router.get("/admin/permissions", response_model=List[PermissionResponse], tags=["admin"])
async def list_all_permissions(
    request: Request,
    session: DBSession = Depends(get_session),
    _: None = Depends(role_based_access(["super_admin"]))
):
    """
    List all permissions with the roles that have them.
    Super admin only.
    """
    try:
        with Session(engine) as db_session:
            permissions = db_session.exec(select(Permission)).all()
            
            # Use explicit joins
            from database.models import RolePermissionLink
            
            result = []
            for perm in permissions:
                # Get roles for this permission
                perm_roles = db_session.exec(
                    select(Role)
                    .join(RolePermissionLink, Role.id == RolePermissionLink.role_id)
                    .where(RolePermissionLink.permission_id == perm.id)
                ).all()
                role_ids = [role.id for role in perm_roles]
                
                result.append(PermissionResponse(
                    id=perm.id,
                    name=perm.name,
                    description=perm.description,
                    roles=role_ids
                ))
            
            return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list permissions: {str(e)}")


class AssignRoleRequest(BaseModel):
    """Request model for assigning a role to a user"""
    role_id: str


class AssignPermissionRequest(BaseModel):
    """Request model for assigning a permission to a role"""
    permission_id: str


@user_router.post("/admin/users/{user_id}/roles", response_model=dict, tags=["admin"])
async def assign_role_to_user(
    user_id: str,
    role_data: AssignRoleRequest,
    request: Request,
    session: DBSession = Depends(get_session),
    _: None = Depends(role_based_access(["super_admin"]))
):
    """
    Assign a role to a user.
    Super admin only.
    """
    try:
        from helpers.role_helpers import assign_role_to_user
        
        success = assign_role_to_user(user_id, role_data.role_id)
        if success:
            return {
                "status": "success",
                "message": f"Role {role_data.role_id} assigned to user {user_id}"
            }
        else:
            raise HTTPException(status_code=400, detail="Failed to assign role")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to assign role: {str(e)}")


@user_router.delete("/admin/users/{user_id}/roles/{role_id}", response_model=dict, tags=["admin"])
async def remove_role_from_user(
    user_id: str,
    role_id: str,
    request: Request,
    session: DBSession = Depends(get_session),
    _: None = Depends(role_based_access(["super_admin"]))
):
    """
    Remove a role from a user.
    Super admin only.
    """
    try:
        from helpers.role_helpers import remove_role_from_user
        
        success = remove_role_from_user(user_id, role_id)
        if success:
            return {
                "status": "success",
                "message": f"Role {role_id} removed from user {user_id}"
            }
        else:
            raise HTTPException(status_code=400, detail="Failed to remove role or role not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove role: {str(e)}")


@user_router.post("/admin/roles/{role_id}/permissions", response_model=dict, tags=["admin"])
async def assign_permission_to_role(
    role_id: str,
    perm_data: AssignPermissionRequest,
    request: Request,
    session: DBSession = Depends(get_session),
    _: None = Depends(role_based_access(["super_admin"]))
):
    """
    Assign a permission to a role.
    Super admin only.
    """
    try:
        # Prevent modifying super_admin role
        if role_id == "super_admin":
            raise HTTPException(status_code=403, detail="super_admin role permissions are immutable and defined on the server")
        
        from helpers.role_helpers import assign_permission_to_role
        
        success = assign_permission_to_role(role_id, perm_data.permission_id)
        if success:
            return {
                "status": "success",
                "message": f"Permission {perm_data.permission_id} assigned to role {role_id}"
            }
        else:
            raise HTTPException(status_code=400, detail="Failed to assign permission")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to assign permission: {str(e)}")


@user_router.delete("/admin/roles/{role_id}/permissions/{permission_id}", response_model=dict, tags=["admin"])
async def remove_permission_from_role(
    role_id: str,
    permission_id: str,
    request: Request,
    session: DBSession = Depends(get_session),
    _: None = Depends(role_based_access(["super_admin"]))
):
    """
    Remove a permission from a role.
    Super admin only.
    """
    try:
        # Prevent modifying super_admin role
        if role_id == "super_admin":
            raise HTTPException(status_code=403, detail="super_admin role permissions are immutable and defined on the server")
        
        from helpers.role_helpers import remove_permission_from_role
        
        success = remove_permission_from_role(role_id, permission_id)
        if success:
            return {
                "status": "success",
                "message": f"Permission {permission_id} removed from role {role_id}"
            }
        else:
            raise HTTPException(status_code=400, detail="Failed to remove permission")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove permission: {str(e)}")


class UpdateRolePermissionsRequest(BaseModel):
    """Request model for updating all permissions for a role"""
    permission_ids: List[str]


@user_router.put("/admin/roles/{role_id}/permissions", response_model=dict, tags=["admin"])
async def update_role_permissions(
    role_id: str,
    perm_data: UpdateRolePermissionsRequest,
    request: Request,
    session: DBSession = Depends(get_session),
    _: None = Depends(role_based_access(["super_admin"]))
):
    """
    Update all permissions for a role (replaces existing permissions).
    Super admin only.
    """
    try:
        # Prevent modifying super_admin role
        if role_id == "super_admin":
            raise HTTPException(status_code=403, detail="super_admin role permissions are immutable and defined on the server")
        
        from helpers.role_helpers import update_role_permissions
        
        success = update_role_permissions(role_id, perm_data.permission_ids)
        if success:
            return {
                "status": "success",
                "message": f"Permissions updated for role {role_id}"
            }
        else:
            raise HTTPException(status_code=400, detail="Failed to update permissions")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update permissions: {str(e)}")


