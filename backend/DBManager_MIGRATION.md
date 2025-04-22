# Migrating from Python `ai/models.py` to Go `DBManager` Package

This guide describes how to port your existing Python SQLModel-based database layer to a Go package using GORM.

---

## 1. Overview

- **Old implementation**: SQLModel (`ai/models.py`) with SQLite, tables defined via Python dataclasses and relationships.
- **New implementation**: Go `DBManager` package with GORM-based structs and methods (Conversation, Message) and manager functions.

## 2. Old Python SQLModel Schema

File: `backend/ai/models.py`

```python
class User(SQLModel, table=True):
    id: str = Field(primary_key=True)
    email: str = Field(unique=True)
    name: Optional[str]
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    preferred_model: str = Field(default="gemini")
    conversations: List["Conversation"] = Relationship(back_populates="user")

class Conversation(SQLModel, table=True):
    id: str = Field(primary_key=True)
    title: str
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    user_id: str = Field(foreign_key="user.id")
    messages: List["Message"] = Relationship(
        back_populates="conversation",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )

class Message(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    reasoning: str = Field(default="")
    content: str = Field(default="")
    is_user_message: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    conversation_id: str = Field(foreign_key="conversation.id")
```

- Tables: `user`, `conversation`, `message`
- Relationships: foreign keys and cascades managed by SQLModel/SQLAlchemy.
- Session creation via `get_session()` and `engine = create_engine(DATABASE_URL)`.

## 3. New Go GORM Schema

Based on your provided code, in `backend/DBManager`:

```go
package DBManager

import (
    "gorm.io/gorm"
)

type Conversation struct {
    gorm.Model
    ConversationID string    `gorm:"uniqueIndex;not null"`
    UserID         string    `gorm:"index;not null"`
    MessageCount   int       `gorm:"default:0"`
    Messages       []Message `gorm:"foreignKey:ConversationID;references:ConversationID"`
}

type Message struct {
    gorm.Model
    ConversationID   string `gorm:"index;not null"`
    Sequence         int    `gorm:"not null"`
    Role             string `gorm:"not null"`
    Type             string `gorm:"not null"` // e.g. "user", "model"
    FunctionName     string
    FunctionArgs     string `gorm:"type:json"`
    FunctionResponse string `gorm:"type:json"`
    Text             string `gorm:"type:text"`
    Reasoning        string `gorm:"type:text"`
}
```

- Tables: `conversations`, `messages`
- JSON payloads stored as TEXT/JSON columns.
- Manager struct `DBManager` wraps `*gorm.DB` and provides methods.

## 4. Field Mapping and Type Changes

| Python Field            | Go Field               | Notes                                |
|-------------------------|------------------------|--------------------------------------|
| `User.id`               | `Conversation.UserID`  | user table renamed; track owner ID   |
| `Conversation.id`       | `Conversation.ConversationID` | primary key string                |
| `Message.id`            | `Message.ID`           | auto-increment                       |
| `Message.content`       | `Message.Text`         | renamed for clarity                  |
| `Message.is_user_message` | `Message.Role`        | enum string: "user" or "model"    |
| `created_at`, `updated_at` | GORM timestamps    | `gorm.Model` provides these         |
| Relationship lists      | slices + GORM tags     | foreign keys defined in struct tags  |
| JSON args/response      | `FunctionArgs`, `FunctionResponse` | store marshaled JSON strings  |

## 5. Migration Steps

### 5.1 Models and Auto-Migration

1. Create `models.go` in `DBManager` package: define `Conversation` and `Message` structs with GORM tags.
2. In `dbmanager.go`, write `NewDBManager(dbPath string)` to open connection and call `AutoMigrate(&Conversation{}, &Message{})`.

### 5.2 Session vs. Manager API

- **Python**: use `with Session(engine) as session:` and SQLModel CRUD.
- **Go**: use `mgr := NewDBManager("path/to/db.sqlite")` and call methods on `mgr`:
  - `mgr.CreateConversation(convoID, userID)`
  - `mgr.AddMessage(convoID, role, msgType, text, reasoning, fnName, argsJSON, respJSON)`
  - `mgr.GetMessages(convoID)`

### 5.3 Implementing CRUD Methods

- **CreateConversation**:
  ```go
  conv := Conversation{ConversationID: convoID, UserID: userID}
  mgr.DB.Create(&conv)
  ```

- **ListConversations**:
  ```go
  var convs []Conversation
  mgr.DB.Find(&convs)
  // extract ConversationID
  ```

- **AddMessage**:
  1. Count existing messages: `mgr.DB.Model(&Message{}).Where(...).Count(&cnt)`
  2. Insert `Message{Sequence: cnt+1, ...}` inside a transaction.
  3. Update parent record `MessageCount`.

- **GetMessages**:
  ```go
  var msgs []Message
  mgr.DB.Where("conversation_id = ?", convoID).
         Order("sequence asc").
         Find(&msgs)
  ```

## 6. Data Migration (Optional)

If you need to preserve existing SQLite data:

1. Dump Python SQLite data: `sqlite3 chat_history.sqlite .dump > dump.sql`
2. Edit `dump.sql` table names/column names to match new schema.
3. Load into new DB: `sqlite3 new.db < dump.sql`

## 7. Testing and Verification

- Write unit tests in Go using `gorm.Open(sqlite.Open("file::memory:?cache=shared"), ...)`.
- Verify CRUD methods behave the same as Python.

---

This should give you a clear migration path from your Python `ai/models.py` layer to the Go `DBManager` package. Let me know if you need sample code snippets or help with specific methods!
