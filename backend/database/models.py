import os
from typing import List, Optional
from datetime import datetime, timezone
from enum import Enum
from sqlmodel import Field, Relationship, Session, SQLModel, create_engine
from sqlalchemy import String, Column, Text

# Load environment variables from .env file
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
class User(SQLModel, table=True):
    id: str = Field(primary_key=True)
    email: str = Field(unique=True)
    name: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now, sa_column=Column(String))
    updated_at: datetime = Field(default_factory=datetime.now, sa_column=Column(String))
    github_token: Optional[str] = None  # Store GitHub token securely
    github_username: Optional[str] = None  # Store GitHub username
    preferred_model: str = Field(default="grok-4-fast")  # Store user's preferred model
    
    # Relationships
    conversations: List["Conversation"] = Relationship(back_populates="user")
    workflows: List["Workflow"] = Relationship(back_populates="user")


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