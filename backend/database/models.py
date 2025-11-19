import os
from typing import List, Optional
from datetime import datetime, timezone
from enum import Enum
from sqlmodel import Field, Relationship, Session, SQLModel, create_engine, Column
from sqlalchemy import String, Text

# Load .env file only in development (not in production where Coolify exports env vars)
is_production = (
    os.getenv("ENVIRONMENT", "").lower() == "production" or
    os.getenv("ENV", "").lower() == "production" or
    os.getenv("PRODUCTION", "").lower() == "true" or
    os.getenv("NODE_ENV", "").lower() == "production"
)

if not is_production:
    from dotenv import load_dotenv
    load_dotenv()

# Define the database URL from environment variable, normalizing deprecated postgres:// scheme
raw_db_url = os.getenv("DATABASE_URL", "sqlite:///./db/chat_history.sqlite")

def _normalize_db_url(url: str) -> str:
    # SQLAlchemy requires 'postgresql' dialect; some environments provide 'postgres://'
    # Convert to 'postgresql+psycopg2://' to ensure the correct driver is used
    try:
        if url and url.startswith("postgres://"):
            return "postgresql+psycopg2://" + url[len("postgres://"):]
    except Exception:
        pass
    return url

DATABASE_URL = _normalize_db_url(raw_db_url)

# Create models matching your frontend Prisma schema

class MessageType(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    TOOL_CALL = "tool_call"
    TOOL_RESPONSE = "tool_response"


# Link models for many-to-many relationships (SQLModel requires link models, not Tables)
class UserRoleLink(SQLModel, table=True):
    """Link model for User-Role many-to-many relationship"""
    user_id: str = Field(foreign_key="user.id", primary_key=True)
    role_id: str = Field(foreign_key="role.id", primary_key=True)


class RolePermissionLink(SQLModel, table=True):
    """Link model for Role-Permission many-to-many relationship"""
    role_id: str = Field(foreign_key="role.id", primary_key=True)
    permission_id: str = Field(foreign_key="permission.id", primary_key=True)


class Permission(SQLModel, table=True):
    """Permission model - represents a specific permission/action"""
    id: str = Field(primary_key=True)  # e.g., "read:users", "write:workflows", "admin:all"
    name: str = Field(unique=True, index=True)  # Human-readable name
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now, sa_column=Column(String))
    
    # Relationships
    roles: List["Role"] = Relationship(back_populates="permissions", link_model=RolePermissionLink)


class Role(SQLModel, table=True):
    """Role model - represents a role that can have multiple permissions"""
    id: str = Field(primary_key=True)  # e.g., "super_admin", "user", "developer"
    name: str = Field(unique=True, index=True)  # Human-readable name
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now, sa_column=Column(String))
    
    # Relationships
    permissions: List["Permission"] = Relationship(back_populates="roles", link_model=RolePermissionLink)
    users: List["User"] = Relationship(back_populates="roles", link_model=UserRoleLink)


class User(SQLModel, table=True):
    id: str = Field(primary_key=True)
    email: str = Field(unique=True)
    name: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now, sa_column=Column(String))
    updated_at: datetime = Field(default_factory=datetime.now, sa_column=Column(String))
    github_token: Optional[str] = None  # Store GitHub token securely
    github_username: Optional[str] = None  # Store GitHub username
    preferred_model: str = Field(default="grok-4-fast")  # Store user's preferred model
    microsoft_access_token: Optional[str] = None  # Encrypted Microsoft access token
    microsoft_refresh_token: Optional[str] = None  # Encrypted Microsoft refresh token
    microsoft_token_expires_at: Optional[datetime] = None  # Token expiration time
    microsoft_consent_given: bool = Field(default=False)  # Track if user consented to Microsoft permissions
    
    # Relationships
    conversations: List["Conversation"] = Relationship(back_populates="user")
    workflows: List["Workflow"] = Relationship(back_populates="user")
    roles: List["Role"] = Relationship(back_populates="users", link_model=UserRoleLink)

    @property
    def roles_list(self) -> List[str]:
        """Return list of role IDs"""
        return [role.id for role in self.roles] if self.roles else []

    @property
    def permissions_list(self) -> List[str]:
        """Return list of permission IDs from all roles"""
        perms = set()
        if self.roles:
            for role in self.roles:
                if role.permissions:
                    for perm in role.permissions:
                        perms.add(perm.id)
        return list(perms)


class Conversation(SQLModel, table=True):
    id: str = Field(primary_key=True)
    title: str
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    model: Optional[str] = Field(default=None)
    
    # Foreign keys
    user_id: str = Field(foreign_key="user.id")
    
    # Relationships
    user: User = Relationship(back_populates="conversations")
    messages: List["Message"] = Relationship(
        back_populates="conversation", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class Message(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    reasoning: str = Field(default="")
    content: str = Field(default="")
    message_type: MessageType = Field(default=MessageType.USER)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    # Foreign keys
    conversation_id: str = Field(foreign_key="conversation.id")

    # Relationships
    conversation: Conversation = Relationship(back_populates="messages")


class Workflow(SQLModel, table=True):
    id: str = Field(primary_key=True)
    title: str = Field(max_length=255)
    description: Optional[str] = Field(default=None)
    code: str = Field(sa_column=Column(Text))  # Store Python code
    status: str = Field(default="inactive")  # active, inactive, running, error
    last_run: Optional[datetime] = Field(default=None)
    last_run_status: Optional[str] = Field(default=None)  # success, error, timeout
    last_run_output: Optional[str] = Field(default=None, sa_column=Column(Text))
    last_run_error: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
    # Foreign keys
    user_id: str = Field(foreign_key="user.id")
    
    # Relationships
    user: User = Relationship(back_populates="workflows")
    schedules: List["WorkflowSchedule"] = Relationship(
        back_populates="workflow", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    runs: List["WorkflowRun"] = Relationship(
        back_populates="workflow", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    shares: List["WorkflowShare"] = Relationship(
        back_populates="workflow", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class WorkflowSchedule(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    cron_expression: str = Field(max_length=100)  # e.g., "0 9 * * 1-5" (9 AM weekdays)
    is_active: bool = Field(default=True)
    timezone: str = Field(default="UTC", max_length=50)
    next_run: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
    # Foreign keys
    workflow_id: str = Field(foreign_key="workflow.id")
    
    # Relationships
    workflow: Workflow = Relationship(back_populates="schedules")


class WorkflowRun(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    status: str = Field(default="pending")  # pending, running, success, error, timeout
    started_at: datetime = Field(default_factory=datetime.now)
    completed_at: Optional[datetime] = Field(default=None)
    output: Optional[str] = Field(default=None, sa_column=Column(Text))
    error: Optional[str] = Field(default=None, sa_column=Column(Text))
    triggered_by: str = Field(default="manual")  # manual, schedule, api
    duration_seconds: Optional[float] = Field(default=None)
    
    # Foreign keys
    workflow_id: str = Field(foreign_key="workflow.id")
    
    # Relationships
    workflow: Workflow = Relationship(back_populates="runs")


class WorkflowShare(SQLModel, table=True):
    __tablename__ = "workflow_shares"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    workflow_id: str = Field(foreign_key="workflow.id")
    user_id: str
    shared_by: str
    shared_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Relationship back to Workflow
    workflow: Optional["Workflow"] = Relationship(back_populates="shares")


# Setup database connection
engine = create_engine(DATABASE_URL, echo=False)


# Function to create all tables in the database
def create_db_and_tables():
    # Only create tables if they don't exist
    SQLModel.metadata.create_all(engine)
    # Lightweight migration: add 'model' column to conversation if missing
    try:
        from sqlalchemy import inspect, text
        with engine.begin() as conn:
            inspector = inspect(conn)
            columns = [c['name'] for c in inspector.get_columns('conversation')]
            if 'model' not in columns:
                conn.execute(text("ALTER TABLE conversation ADD COLUMN model VARCHAR"))
            
            # No longer backfilling here; see below to always run backfill even if column existed.
    except Exception:
        # Best-effort migration; ignore if not supported
        pass

    # Always attempt backfill: set conversation.model to user's preferred_model if null/empty
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text(
                """
                UPDATE conversation
                SET model = (
                    SELECT preferred_model FROM "user" WHERE "user".id = conversation.user_id
                )
                WHERE model IS NULL OR model = ''
                """
            ))
    except Exception:
        # Ignore if DB is not ready or table missing
        pass


# Database session management
def get_session():
    with Session(engine) as session:
        yield session