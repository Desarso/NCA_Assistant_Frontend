from datetime import datetime
import json
from typing import AsyncGenerator, List, Union, Dict
from cohere import ToolResult
from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from requests import Session
import asyncio
from pydantic import BaseModel, Field
import cohere
import uuid

from ai.Manager import MyDeps, create_agent, get_system_prompt
from ai.assistant_functions.memory_functions import get_memory_no_context
from pydantic_ai.messages import (
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    ModelMessage,
    ModelRequest,
    ModelResponse,
    PartDeltaEvent,
    PartStartEvent,
    
    RetryPromptPart,
    SystemPromptPart,
    TextPart,
    TextPartDelta,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
    ReasoningPart,
    ReasoningPartDelta,
    ImageUrl,
    AudioUrl,
    DocumentUrl,
    BinaryContent,
)
# ReasoningPart,
# ReasoningPartDelta,
from helpers.helper_funcs import geminiParts
from ai.models import get_session, User, Conversation, Message as DBMessage, engine
from sqlmodel import Session as DBSession
from models.general import ConversationCreate, MessageCreate
from fastapi.responses import StreamingResponse, JSONResponse
from .chat_events import event_to_json_string, model_message_to_dict, get_message_history


class ImageUrlContent(BaseModel):
    url: str
    media_type: str = Field(..., pattern="^image/.*")
    kind: str = "image-url"


class AudioUrlContent(BaseModel):
    url: str
    media_type: str = Field(..., pattern="^audio/.*")
    kind: str = "audio-url"


class DocumentUrlContent(BaseModel):
    url: str
    media_type: str = Field(
        ...,
        pattern="^(application/pdf|text/plain|text/csv|application/vnd.openxmlformats-officedocument.wordprocessingml.document|application/vnd.openxmlformats-officedocument.spreadsheetml.sheet|text/html|text/markdown|application/vnd.ms-excel)$",
    )
    kind: str = "document-url"


class BinaryContentModel(BaseModel):
    data: bytes
    media_type: str
    kind: str = "binary"


class ChatContent(BaseModel):
    content: Union[
        str, ImageUrlContent, AudioUrlContent, DocumentUrlContent, BinaryContentModel
    ]


class ChatRequest(BaseModel):
    content: List[ChatContent]

    def to_user_content(
        self,
    ) -> List[Union[str, ImageUrl, AudioUrl, DocumentUrl, BinaryContent]]:
        """Convert the request content to the format expected by agent.iter"""
        result = []
        for item in self.content:
            if isinstance(item.content, str):
                result.append(item.content)
            elif isinstance(item.content, ImageUrlContent):
                result.append(ImageUrl(url=item.content.url))
            elif isinstance(item.content, AudioUrlContent):
                result.append(AudioUrl(url=item.content.url))
            elif isinstance(item.content, DocumentUrlContent):
                result.append(DocumentUrl(url=item.content.url))
            elif isinstance(item.content, BinaryContentModel):
                result.append(
                    BinaryContent(
                        data=item.content.data, media_type=item.content.media_type
                    )
                )
        return result


chats_router = APIRouter(prefix="/chats")
ws_chats_router = APIRouter(prefix="/chats")

# In-memory chat sessions for resumable/background execution
class ChatSession:
    def __init__(self, conversation_id: str):
        self.conversation_id = conversation_id
        self.queue: asyncio.Queue[str] = asyncio.Queue(maxsize=1000)
        self.task: asyncio.Task | None = None
        self.deps_instance: MyDeps | None = None
        self.started: bool = False

    def is_running(self) -> bool:
        return self.task is not None and not self.task.done()

    async def stop(self) -> None:
        """Cancel the running task, if any, and signal stop to listeners."""
        if self.task and not self.task.done():
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                # Inform clients the run was stopped
                try:
                    await self._emit(json.dumps({"type": "stopped"}))
                except Exception:
                    pass
        self.task = None
        self.started = False

    async def start(self, current_user: User, user_content: List[Union[str, ImageUrl, AudioUrl, DocumentUrl, BinaryContent]], has_pdfs: bool, memory: str | None) -> None:
        if self.is_running():
            return
        self.deps_instance = MyDeps(user_object=current_user, user_rejection_flags={}, conversation_id=self.conversation_id)
        self.task = asyncio.create_task(self._run(current_user, user_content, has_pdfs, memory))
        self.started = True

    async def _run(self, current_user: User, user_content: List[Union[str, ImageUrl, AudioUrl, DocumentUrl, BinaryContent]], has_pdfs: bool, memory: str | None) -> None:
        try:
            # Fresh DB session for background task
            with DBSession(engine) as session:
                conversation = session.get(Conversation, self.conversation_id)
                if not conversation:
                    return
                message_history = get_message_history(conversation)

                # Refresh system prompt if exists
                if len(message_history) > 0:
                    system_prompt = message_history[0].parts[0].content
                    if system_prompt:
                        message_history[0].parts[0].content = get_system_prompt(current_user, memory)

                agent = await create_agent(current_user, memory, has_pdfs=has_pdfs)

                async with agent.run_mcp_servers():
                    async with agent.iter(
                        deps=self.deps_instance,
                        user_prompt=user_content,
                        message_history=message_history,
                    ) as run:
                        async for node in run:
                            if agent.is_user_prompt_node(node):
                                pass
                            elif agent.is_model_request_node(node):
                                db_message_request = DBMessage(
                                    content=json.dumps(model_message_to_dict(node.request)),
                                    is_user_message=True,
                                    conversation_id=self.conversation_id,
                                )
                                session.add(db_message_request)
                                conversation_obj = session.get(Conversation, self.conversation_id)
                                if conversation_obj:
                                    conversation_obj.updated_at = datetime.now()
                                session.commit()

                                async with node.stream(run.ctx) as request_stream:
                                    async for event in request_stream:
                                        if isinstance(event, PartStartEvent):
                                            if isinstance(event.part, (TextPart, ReasoningPart)):
                                                await self._emit(event_to_json_string(event))
                                        elif isinstance(event, PartDeltaEvent):
                                            if isinstance(event.delta, (TextPartDelta, ReasoningPartDelta)):
                                                await self._emit(event_to_json_string(event))
                            elif agent.is_call_tools_node(node):
                                async with node.stream(run.ctx) as handle_stream:
                                    async for event in handle_stream:
                                        await self._emit(event_to_json_string(event))

                                db_message = DBMessage(
                                    content=json.dumps(model_message_to_dict(node.model_response)),
                                    is_user_message=False,
                                    conversation_id=self.conversation_id,
                                )
                                session.add(db_message)
                                conversation_obj = session.get(Conversation, self.conversation_id)
                                if conversation_obj:
                                    conversation_obj.updated_at = datetime.now()
                                session.commit()
            # Signal completion when the agent finishes streaming
            await self._emit(json.dumps({"type": "done"}))
        except asyncio.CancelledError:
            # Cancellation handled by stop(); re-raise to exit cleanly
            raise
        except Exception as e:
            await self._emit(json.dumps({"type": "error", "data": str(e)}))

    async def _emit(self, data: str) -> None:
        try:
            self.queue.put_nowait("data: " + data + "\n\n")
        except asyncio.QueueFull:
            # Drop oldest to make space
            _ = await self.queue.get()
            self.queue.put_nowait("data: " + data + "\n\n")


chat_sessions: Dict[str, ChatSession] = {}

def get_or_create_session(conversation_id: str) -> ChatSession:
    session = chat_sessions.get(conversation_id)
    if session is None:
        session = ChatSession(conversation_id)
        chat_sessions[conversation_id] = session
    return session


@chats_router.post("/chat")
async def chat(
    request: Request,
    chat_request: ChatRequest,
    conversation_id: str,
    session: Session = Depends(get_session),
):
    current_user = request.state.user
    """
    Endpoint to initiate a chat session and stream the response.
    Accepts a list of content that can be text, image URLs, or audio URLs.
    """
    # Get or create conversation
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        # Check if user exists in the database, create if not
        user = session.get(User, current_user.uid)
        if not user:
            user = User(
                id=current_user.uid,
                email=current_user.email,
                name=current_user.email.split("@")[0] if current_user.email else None,
            )
            session.add(user)
            session.commit()

        # Generate title using the mixed content
        title = await geminiParts(chat_request.to_user_content())
        conversation = Conversation(
            id=conversation_id,
            title=title,
            user_id=current_user.uid,
        )
        session.add(conversation)
        session.commit()

    # Get message history from the conversation
    message_history = get_message_history(conversation)
    
    # Check if message count is a multiple of 10 (excluding the new message we're about to add)
    message_count = len(conversation.messages)
    if message_count > 0 and message_count % 10 == 0:
        # Generate a new title based on recent conversation
        new_title = await geminiParts(chat_request.to_user_content())
        conversation.title = new_title
        session.commit()


    ##refresh system prompt
    # Get first text content for memory context
    text_content = next(
        (
            item.content
            for item in chat_request.content
            if isinstance(item.content, str)
        ),
        "",
    )

    ##only get memory if text content is not empty
    memory = get_memory_no_context(request.state.user.uid, text_content) if text_content != "" else None

    if len(message_history) > 0:
        system_prompt = message_history[0].parts[0].content
        if system_prompt:
            message_history[0].parts[0].content = get_system_prompt(
                request.state.user, memory
            )

    # In the chat endpoint, before creating the agent:
    has_pdfs = any(
        isinstance(item.content, DocumentUrlContent) 
        for item in chat_request.content 
        if hasattr(item, 'content') and hasattr(item.content, 'kind')
    )

    # Start or resume background chat session
    user_content = chat_request.to_user_content()
    chat_session = get_or_create_session(conversation_id)
    await chat_session.start(current_user, user_content, has_pdfs=has_pdfs, memory=memory)

    # Do not hold the HTTP request open; background session streams via WebSocket
    return JSONResponse({"status": "started", "conversation_id": conversation_id}, status_code=202)


@chats_router.post("/chat/stop")
async def stop_chat(
    request: Request,
    conversation_id: str,
):
    """Stop a running chat session for the given conversation."""
    _ = request.state.user  # Reserved for future authorization checks per conversation
    chat_session = get_or_create_session(conversation_id)
    if not chat_session.is_running():
        return JSONResponse({"status": "not_running", "conversation_id": conversation_id})
    await chat_session.stop()
    return JSONResponse({"status": "stopped", "conversation_id": conversation_id})

async def get_user_confirmation(node, deps: MyDeps) -> bool:
    # Placeholder: actual confirmation should be driven by WebSocket messages
    return False


@chats_router.post("/conversations/", response_model=dict)
def create_conversation(
    request: Request,
    conversation: ConversationCreate,
    session: Session = Depends(get_session),
):
    current_user = request.state.user
    if conversation.user_id != current_user.uid:
        raise HTTPException(
            status_code=403,
            detail="Access denied: You can only create conversations for yourself",
        )
    user = session.get(User, conversation.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db_conversation = Conversation(
        title=conversation.title, user_id=conversation.user_id
    )
    session.add(db_conversation)
    session.commit()
    session.refresh(db_conversation)
    return {"status": "success", "conversation": db_conversation}


@chats_router.get("/conversations/{conversation_id}", response_model=dict)
def read_conversation(
    request: Request,
    conversation_id: str,
    session: Session = Depends(get_session),
):
    current_user = request.state.user
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation.user_id != current_user.uid:
        raise HTTPException(
            status_code=403,
            detail="Access denied: You can only view your own conversations",
        )
    return {"status": "success", "conversation": conversation}


@chats_router.get("/users/{user_id}/conversations", response_model=dict)
def read_user_conversations(
    request: Request,
    user_id: str,
    session: Session = Depends(get_session),
):
    current_user = request.state.user
    if user_id != current_user.uid:
        raise HTTPException(
            status_code=403,
            detail="Access denied: You can only view your own conversations",
        )
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "success", "conversations": user.conversations}


@chats_router.post("/messages/", response_model=dict)
def create_message(
    request: Request,
    message: MessageCreate,
    session: Session = Depends(get_session),
):
    current_user = request.state.user
    conversation = session.get(Conversation, message.conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation.user_id != current_user.uid:
        raise HTTPException(
            status_code=403,
            detail="Access denied: You can only add messages to your own conversations",
        )
    db_message = DBMessage(
        content=message.content,
        is_user_message=message.is_user_message,
        conversation_id=message.conversation_id,
    )
    session.add(db_message)
    # Update conversation timestamp
    conversation.updated_at = datetime.now()
    session.commit()
    session.refresh(db_message)
    return {"status": "success", "message": db_message}


@chats_router.get("/conversations/{conversation_id}/messages", response_model=dict)
def read_conversation_messages(
    request: Request,
    conversation_id: str,
    session: Session = Depends(get_session),
):
    current_user = request.state.user
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation.user_id != current_user.uid:
        raise HTTPException(
            status_code=403,
            detail="Access denied: You can only view messages from your own conversations",
        )
        
    # Sort messages first
    sorted_messages = sorted(conversation.messages, key=lambda m: m.created_at)
    
    # Convert messages to a list of dictionaries suitable for JSON serialization
    # Ensure datetime objects are converted to ISO format strings
    # The frontend's convertToChatMessages function will handle parsing the 'content' field.
    processed_messages = [
        {
            "id": message.id,
            "content": message.content,  # Return the raw content string
            "is_user_message": message.is_user_message,
            "created_at": message.created_at.isoformat(),
            "updated_at": message.updated_at.isoformat(),
            "conversation_id": message.conversation_id,
            # Add other fields from DBMessage if needed by the frontend
        }
        for message in sorted_messages
    ]
            
    # Return the list of dictionaries
    return {"status": "success", "messages": processed_messages}


@chats_router.get("/conversations/{conversation_id}/verify", response_model=dict)
def verify_conversation_state(
    request: Request,
    conversation_id: str,
    session: Session = Depends(get_session),
):
    current_user = request.state.user
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation.user_id != current_user.uid:
        raise HTTPException(
            status_code=403,
            detail="Access denied: You can only verify your own conversations",
        )

    # Compute message_count and last_message_id
    sorted_messages = sorted(conversation.messages, key=lambda m: m.created_at)
    message_count = len(sorted_messages)
    last_message_id = sorted_messages[-1].id if sorted_messages else None

    return {
        "status": "success",
        "conversation_id": conversation_id,
        "message_count": message_count,
        "updated_at": conversation.updated_at.isoformat(),
        "last_message_id": last_message_id,
    }


@chats_router.delete("/conversations/{conversation_id}")
def delete_conversation(
    request: Request,
    conversation_id: str,
    session: Session = Depends(get_session),
):
    
    print("made it here")
    current_user = request.state.user
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if conversation.user_id != current_user.uid:
        raise HTTPException(status_code=403, detail="Access denied: You can only delete your own conversations")

    session.delete(conversation)
    session.commit()
    return {"status": "success"}


@ws_chats_router.websocket("/ws")
async def chat_ws(websocket: WebSocket, conversation_id: str):
    # Manual auth for WebSocket: read token from headers or query param
    token_header = websocket.headers.get('authorization')
    token_param = websocket.query_params.get('token')
    token = None
    if token_header and token_header.lower().startswith('bearer '):
        token = token_header.split(' ', 1)[1]
    elif token_param:
        token = token_param

    # Optionally verify token here or allow anonymous if upstream proxies handle auth
    # We accept and proceed even if token is missing to avoid handshake failures in dev
    await websocket.accept()

    chat_session = get_or_create_session(conversation_id)

    async def forward_events():
        try:
            while True:
                chunk = await chat_session.queue.get()
                if chunk.startswith("data: "):
                    await websocket.send_text(chunk[len("data: ") :].strip())
                else:
                    await websocket.send_text(chunk)
        except asyncio.CancelledError:
            return

    producer = asyncio.create_task(forward_events())
    try:
        while True:
            _ = await websocket.receive_text()
            await websocket.send_text(json.dumps({"type": "ack"}))
    except WebSocketDisconnect:
        producer.cancel()
    except Exception:
        producer.cancel()

# Add this dictionary to track tool call IDs and their results
tool_call_mapping: Dict[str, str] = {}

def generate_tool_call_id() -> str:
    """Generate a unique tool call ID."""
    return f'pyd_ai_{uuid.uuid4().hex}'


def event_to_json_string(event):
    """Convert event objects to JSON string."""
    global tool_call_mapping
    
    # Add tool_call_id if missing for tool calls and store mappings
    if isinstance(event, FunctionToolCallEvent):
        if not event.part.tool_call_id:
            # Generate a tool ID if it's missing (likely from Gemini model)
            event.part.tool_call_id = generate_tool_call_id()
            event.call_id = event.part.tool_call_id  # Update call_id as well to match
        
        # Store mapping from call_id to tool_call_id
        tool_call_mapping[event.call_id] = event.part.tool_call_id
    
    # Ensure tool results reference the correct tool call
    elif isinstance(event, FunctionToolResultEvent):
        # Check if this result references a call_id in our mapping
        if event.tool_call_id in tool_call_mapping:
            # Update tool_call_id to match the stored mapping
            tool_call_id = tool_call_mapping[event.tool_call_id]
            
            # Update the result object
            event.tool_call_id = tool_call_id
            if hasattr(event.result, 'tool_call_id'):
                event.result.tool_call_id = tool_call_id
    
    # Existing logic for pydantic-ai event objects
    event_type = "part_start"
    if isinstance(event, PartDeltaEvent):
        event_type = "part_delta"
    elif isinstance(event, FunctionToolCallEvent):
        event_type = "tool_call"
    elif isinstance(event, FunctionToolResultEvent):
        event_type = "tool_result"
    
    event_dict = {"type": event_type, "data": event_to_dict(event)}
    
    try:
        return json.dumps(event_dict)
    except (TypeError, ValueError) as e:
        # Handle the error case by providing a fallback serialization
        print(f"JSON serialization error: {e}")
        event_dict["data"] = str(event_dict["data"])
        return json.dumps(event_dict)


def event_from_json_string(json_str):
    """Convert JSON string back to event object."""
    global tool_call_mapping
    
    data = json.loads(json_str)
    event_data = data["data"]
    
    if data["type"] == "part_start":
        return PartStartEvent(
            index=event_data["index"],
            part=TextPart(
                content=event_data["part"]["content"],
                part_kind=event_data["part"]["part_kind"],
            ),
            event_kind=event_data["event_kind"],
        )
    elif data["type"] == "part_delta":
        return PartDeltaEvent(
            index=event_data["index"],
            delta=TextPartDelta(
                content_delta=event_data["delta"]["content"],
                part_delta_kind=event_data["delta"]["part_kind"],
            ),
            event_kind=event_data["event_kind"],
        )
    elif data["type"] == "tool_call":
        # Ensure tool_call_id is properly passed to ToolCallPart
        tool_call_id = event_data["tool_call"].get("tool_call_id")
        call_id = event_data.get("call_id")
        
        # Generate ID if missing
        if not tool_call_id:
            tool_call_id = generate_tool_call_id()
        
        # Store mapping
        if call_id:
            tool_call_mapping[call_id] = tool_call_id
            
        event = FunctionToolCallEvent(
            part=ToolCallPart(
                tool_name=event_data["tool_call"]["name"],
                args=event_data["tool_call"]["args"],
                tool_call_id=tool_call_id,
            ),
            event_kind=event_data["event_kind"],
        )
        
        # Ensure call_id is the same as tool_call_id for consistency
        if event.call_id != tool_call_id:
            tool_call_mapping[event.call_id] = tool_call_id
            
        return event
    elif data["type"] == "tool_result":
        tool_result = event_data["tool_result"]
        original_tool_call_id = event_data.get("tool_call_id")
        
        # Find the mapped tool_call_id if available
        tool_call_id = original_tool_call_id
        if original_tool_call_id in tool_call_mapping:
            tool_call_id = tool_call_mapping[original_tool_call_id]
        
        if "content" in tool_result:
            # Ensure that tool_result tool_call_id matches
            result_tool_call_id = tool_result.get("tool_call_id", tool_call_id)
            if result_tool_call_id != tool_call_id and tool_call_id:
                result_tool_call_id = tool_call_id
                
            return FunctionToolResultEvent(
                result=ToolReturnPart(
                    tool_name=tool_result["name"],
                    content=tool_result["content"],
                    tool_call_id=result_tool_call_id,
                ),
                tool_call_id=tool_call_id,
                event_kind=event_data["event_kind"],
            )
        elif "retry_prompt" in tool_result:
            return FunctionToolResultEvent(
                result=RetryPromptPart(
                    content=tool_result["retry_prompt"],
                    tool_call_id=tool_call_id,
                ),
                tool_call_id=tool_call_id,
                event_kind=event_data["event_kind"],
            )
        else:
            print(f"Unknown tool result format: {tool_result}")
            return None
    return None


def event_to_dict(event):
    """Convert event objects to serializable dictionaries."""
    global tool_call_mapping
    
    if isinstance(event, PartStartEvent):
        if isinstance(event.part, TextPart):
            return {
                "index": event.index,
                "part": {
                    "content": event.part.content,
                    "part_kind": event.part.part_kind,
                }
                if event.part
                else None,
                "event_kind": event.event_kind,
            }
        elif isinstance(event.part, ReasoningPart):
            return {
                "index": event.index,
                "part": {
                    "reasoning": event.part.reasoning,
                    "part_kind": event.part.part_kind,
                },
                "event_kind": event.event_kind,
            }
    elif isinstance(event, PartDeltaEvent):
        if isinstance(event.delta, TextPartDelta):
            return {
                "index": event.index,
                "delta": {
                    "content": event.delta.content_delta,
                    "part_kind": event.delta.part_delta_kind,
                }
                if event.delta
                else None,
                "event_kind": event.event_kind,
            }
        elif isinstance(event.delta, ReasoningPartDelta):
            return {
                "index": event.index,
                "delta": {
                    "reasoning": event.delta.reasoning_delta,
                    "part_kind": event.delta.part_delta_kind,
                },
                "event_kind": event.event_kind,
            }
    elif isinstance(event, FunctionToolCallEvent):
        # Ensure we have a tool_call_id, generate one if it's missing
        tool_call_id = event.part.tool_call_id
        if not tool_call_id:
            tool_call_id = generate_tool_call_id()
            event.part.tool_call_id = tool_call_id
            event.call_id = tool_call_id
            
        # Store mapping from call_id to tool_call_id
        tool_call_mapping[event.call_id] = tool_call_id
            
        return {
            "tool_call": {
                "name": event.part.tool_name,
                "args": event.part.args,
                "tool_call_id": tool_call_id,
            },
            "call_id": event.call_id,
            "event_kind": event.event_kind,
        }
    elif isinstance(event, FunctionToolResultEvent):
        # Check if this result references a call_id in our mapping
        if event.tool_call_id in tool_call_mapping:
            tool_call_id = tool_call_mapping[event.tool_call_id]
            event.tool_call_id = tool_call_id
            if hasattr(event.result, 'tool_call_id'):
                event.result.tool_call_id = tool_call_id
        
        # Properly handle the tool result content, converting non-string objects to JSON
        content = event.result.content
        if not isinstance(content, str):
            try:
                content = json.dumps(content)
            except (TypeError, ValueError):
                content = str(content)
                
        return {
            "tool_result": {
                "name": event.result.tool_name,
                "content": content,
                "tool_call_id": event.result.tool_call_id,
                "timestamp": event.result.timestamp.isoformat(),
            },
            "tool_call_id": event.tool_call_id,
            "event_kind": event.event_kind,
        }
    return vars(event)


def model_message_to_dict(message: Union[ModelRequest, ModelResponse], user_rejected: bool = False) -> dict:
    """Convert a ModelRequest or ModelResponse to a dictionary for storage"""

    def part_to_dict(part):
        # Handle primitive types first

        # Get class name for type checking
        cls_name = part.__class__.__name__

        # Handle special URL types that appear in UserPromptPart content arrays
        if cls_name in ["ImageUrl", "AudioUrl", "DocumentUrl"]:
            url_type = {
                "ImageUrl": "image-url",
                "AudioUrl": "audio-url",
                "DocumentUrl": "document-url",
            }[cls_name]
            return {
                "type": cls_name,
                "content": {"url": part.url},
                "part_kind": url_type,
            }

        if isinstance(part, ToolCallPart):
            # Ensure tool call ID exists
            tool_call_id = part.tool_call_id
            if not tool_call_id:
                tool_call_id = generate_tool_call_id()
                part.tool_call_id = tool_call_id  # Modify the part object
                
            # Ensure args are stored as a dictionary
            args_data = part.args
            if isinstance(args_data, str):
                try:
                    args_data = json.loads(args_data) # Parse if it's a JSON string
                except json.JSONDecodeError:
                    print(f"Warning: ToolCallPart args was a string but not valid JSON: {args_data}")
                    # Keep it as a string if parsing fails
            
            return {
                "type": "ToolCallPart",
                "content": {
                    "name": part.tool_name,
                    "args": args_data, # Now args_data is likely a dict
                    "tool_call_id": tool_call_id,
                },
                "part_kind": getattr(part, "part_kind", "text"),
                "user_rejected": user_rejected,
            }
        if isinstance(part, ReasoningPart):
            return {
                "type": "ReasoningPart",
                "content": part.reasoning,
                "part_kind": getattr(part, "part_kind", "reasoning"),
            }
        if isinstance(part, UserPromptPart):
            # Handle arrays in UserPromptPart content
            if isinstance(part.content, list):
                content = [part_to_dict(item) for item in part.content]
            else:
                content = part.content
            return {
                "type": "UserPromptPart",
                "content": content,
                "part_kind": getattr(part, "part_kind", "text"),
            }
        if isinstance(part, TextPart):
            return {
                "type": "TextPart",
                "content": part.content,
                "part_kind": "text",
            }
        if isinstance(part, SystemPromptPart):
            return {
                "type": "SystemPromptPart",
                "content": part.content,
                "part_kind": getattr(part, "part_kind", "text"),
            }
        if isinstance(part, RetryPromptPart):
            return {
                "type": "RetryPromptPart",
                "content": part.content,
                "part_kind": getattr(part, "part_kind", "text"),
            }
        if isinstance(part, ToolReturnPart):
            # Properly handle the tool return content, converting non-string objects to JSON
            content = part.content
            if not isinstance(content, str):
                try:
                    content = json.dumps(content)
                except (TypeError, ValueError):
                    content = str(content)
                    
            return {
                "type": "ToolReturnPart",
                "content": {
                    "name": part.tool_name,
                    "content": content,
                    "tool_call_id": part.tool_call_id,
                },
                "part_kind": getattr(part, "part_kind", "text"),
            }
        # Handle CallToolResult type
        if cls_name == "CallToolResult":
            return {
                "type": "CallToolResult",
                "content": str(part),
                "part_kind": "text"
            }
        return {
            "type": cls_name,
            "content": str(part),
            "part_kind": getattr(part, "part_kind", "text"),
        }

    if isinstance(message, ModelRequest):
        return {
            "type": "model_request",
            "parts": [part_to_dict(part) for part in message.parts],
            "kind": message.kind,
        }
    else:
        return {
            "type": "model_response",
            "parts": [part_to_dict(part) for part in message.parts],
            "model_name": message.model_name,
            "timestamp": message.timestamp.isoformat() if message.timestamp else None,
            "kind": message.kind,
        }
    



def dict_to_model_message(data: dict) -> Union[ModelRequest, ModelResponse]:
    """Convert a dictionary back to a ModelRequest or ModelResponse"""
    global tool_call_mapping

    # Remove the custom flag before processing, if it exists
    data.pop('user_rejected', None)
    
    # Track tool call IDs within this message to ensure consistency
    message_tool_call_mapping = {}

    def convert_content(content_data):
        """Helper function to convert content data back to appropriate objects"""
        if isinstance(content_data, list):
            return [convert_content(item) for item in content_data]
        if isinstance(content_data, dict):
            # print(content_data)
            if content_data.get("part_kind") == "image-url":
                return ImageUrl(url=content_data["url"])
            if content_data.get("part_kind") == "audio-url":
                return AudioUrl(url=content_data["url"])
            if content_data.get("part_kind") == "document-url":
                return DocumentUrl(url=content_data["url"])
            if content_data.get("part_kind") == "binary":
                return BinaryContent(
                    data=content_data["data"], media_type=content_data["media_type"]
                )
            if content_data.get("part_kind") == "text":
                return content_data.get("content")
        return content_data

    parts = []
    for part_data in data["parts"]:
        if part_data["type"] == "ToolCallPart":
            # Ensure there's a tool_call_id
            tool_call_id = part_data["content"].get("tool_call_id")
            if not tool_call_id:
                tool_call_id = generate_tool_call_id()
                
            # Store this ID in our temporary mapping
            if "call_id" in part_data:
                message_tool_call_mapping[part_data["call_id"]] = tool_call_id
                
            # Add to global mapping if not already there
            tool_call_mapping[tool_call_id] = tool_call_id
                
            parts.append(
                ToolCallPart(
                    tool_name=part_data["content"].get("name"),
                    args=part_data["content"].get("args"),
                    tool_call_id=tool_call_id,
                    part_kind=part_data.get("part_kind", "text"),
                )
            )
        elif part_data["type"] == "ReasoningPart":
            parts.append(
                ReasoningPart(
                    reasoning=part_data["content"],
                    part_kind=part_data.get("part_kind", "reasoning"),
                )
            )
        elif part_data["type"] == "UserPromptPart":
            content = convert_content(part_data["content"])
            parts.append(
                UserPromptPart(
                    content=content,
                    part_kind=part_data.get("part_kind", "text"),
                )
            )
        elif part_data["type"] == "TextPart":
            parts.append(
                TextPart(
                    content=part_data["content"],
                    part_kind=part_data.get("part_kind", "text"),
                )
            )
        elif part_data["type"] == "SystemPromptPart":
            parts.append(
                SystemPromptPart(
                    content=part_data["content"],
                    part_kind=part_data.get("part_kind", "text"),
                )
            )
        elif part_data["type"] == "RetryPromptPart":
            parts.append(
                RetryPromptPart(
                    content=part_data["content"],
                    part_kind=part_data.get("part_kind", "text"),
                )
            )
        elif part_data["type"] == "ToolReturnPart":
            # Get the original tool_call_id
            original_tool_call_id = part_data["content"].get("tool_call_id")
            
            # Check if we have a mapping for this ID
            tool_call_id = original_tool_call_id
            if original_tool_call_id in message_tool_call_mapping:
                tool_call_id = message_tool_call_mapping[original_tool_call_id]
            elif original_tool_call_id in tool_call_mapping:
                tool_call_id = tool_call_mapping[original_tool_call_id]
            elif not tool_call_id:
                tool_call_id = generate_tool_call_id()
                
            parts.append(
                ToolReturnPart(
                    tool_name=part_data["content"].get("name"),
                    content=part_data["content"].get("content"),
                    tool_call_id=tool_call_id,
                    part_kind=part_data.get("part_kind", "text"),
                )
            )
    if data["type"] == "model_request":
        return ModelRequest(parts=parts, kind="request")
    else:
        return ModelResponse(
            parts=parts,
            model_name=data.get("model_name"),
            timestamp=datetime.fromisoformat(data["timestamp"])
            if data.get("timestamp")
            else datetime.now(),
            kind=data.get("kind", "response"),
        )


def get_message_history(conversation: Conversation) -> List[ModelMessage]:
    """Convert stored conversation messages into a list of ModelMessages for the model"""
    message_history = []
    sorted_messages = sorted(conversation.messages, key=lambda m: m.created_at)
    for message in sorted_messages:
        try:
            message_data = json.loads(message.content)
            model_message = dict_to_model_message(message_data)
            message_history.append(model_message)
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Error processing message {message.id}: {str(e)}")
            continue
    return message_history
