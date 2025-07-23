from typing import List, Optional
from datetime import datetime, timezone
from sqlmodel import Field, Relationship, Session, SQLModel, create_engine
from sqlalchemy import String, Column, Text

# Define the database URL
DATABASE_URL = "sqlite:///./db/chat_history.sqlite"

# Create models matching your frontend Prisma schema
class User(SQLModel, table=True):
    id: str = Field(primary_key=True)
    email: str = Field(unique=True)
    name: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now, sa_column=Column(String))
    updated_at: datetime = Field(default_factory=datetime.now, sa_column=Column(String))
    github_token: Optional[str] = None  # Store GitHub token securely
    github_username: Optional[str] = None  # Store GitHub username
    preferred_model: str = Field(default="gemini")  # Store user's preferred model
    
    # Relationships
    conversations: List["Conversation"] = Relationship(back_populates="user")
    workflows: List["Workflow"] = Relationship(back_populates="user")


class Conversation(SQLModel, table=True):
    id: str = Field(primary_key=True)
    title: str
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
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
    is_user_message: bool = Field(default=True)
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


# Database session management
def get_session():
    with Session(engine) as session:
        yield session