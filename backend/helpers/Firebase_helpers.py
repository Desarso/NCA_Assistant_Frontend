from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials
from firebase_admin import auth
from pydantic import BaseModel
from fastapi.security import HTTPBearer
from typing import List, Callable, Optional
from fastapi import Depends, Request
from ai.models import Session, User, engine
from sqlalchemy import select


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






async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> FirebaseUser:
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
        roles = custom_claims.get('roles', [])
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
            
            # Safely get values with defaults
            github_username = getattr(db_user, 'github_username', None)
            github_token = getattr(db_user, 'github_token', None)
            prefered_model = getattr(db_user, 'preferred_model', DEFAULT_MODEL)
        
        # Create user object
        firebase_user = FirebaseUser(
            uid=uid, 
            email=email, 
            roles=roles, 
            name=name,
            mcp_servers=mcp_servers,
            github_username=github_username,
            github_token=github_token,
            prefered_model=prefered_model
        )

            
        return firebase_user
        
    except auth.RevokedIdTokenError:
        raise HTTPException(status_code=401, detail="Firebase ID token has been revoked. Please sign in again.")
    except auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Firebase ID token has expired. Please sign in again.")
    except auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Invalid Firebase ID token. Please sign in again.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error validating Firebase ID token: {str(e)}")
    

def role_based_access(required_roles: List[str]) -> Callable:
    """
    Factory function to create a dependency that checks if the user has the required roles.
    """
    async def check_role(request: Request, current_user: FirebaseUser = Depends(get_current_user)) -> None:
        """
        Dependency that checks if the user has the required roles in their custom claims.
        """
        try:
            user = auth.get_user(current_user.uid)
            custom_claims = user.custom_claims or {}
            roles = custom_claims.get('roles', [])

            # Check if all required roles are present
            missing_roles = [role for role in required_roles if role not in roles]

            # If user has developer role, grant access to all roles
            if "developer" in roles:
                missing_roles = []

            if missing_roles:
                raise HTTPException(
                    status_code=403,
                    detail=f"User does not have the required roles: {', '.join(missing_roles)}"
                )
            # Store the user in the request state so it can be accessed in endpoints
            request.state.user = current_user

        except auth.UserNotFoundError:
            raise HTTPException(
                status_code=404,
                detail="User not found"
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Error retrieving user claims: {str(e)}"
            )
    return check_role