from datetime import datetime
import json
from typing import AsyncGenerator, List, Union
from fastapi import APIRouter, Depends, HTTPException, Request
from requests import Session
from pydantic import BaseModel, Field

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
from ai.models import get_session, User, Conversation, Message as DBMessage
from models.general import ConversationCreate, MessageCreate
from fastapi.responses import StreamingResponse


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

    agent = await create_agent(current_user, memory)

    user_content = chat_request.to_user_content()

    
    async def generate_chunks() -> AsyncGenerator[str, None]:
        async with agent.run_mcp_servers():
            async with agent.iter(
                deps=MyDeps(user_object=current_user),
                user_prompt=user_content,
                message_history=message_history,
            ) as run:
                async for node in run:
                    # print(node)
                    if agent.is_user_prompt_node(node):
                        # print user node
                        pass
                    elif agent.is_model_request_node(node):
                        async with node.stream(run.ctx) as request_stream:
                            async for event in request_stream:
                                if isinstance(event, PartStartEvent):
                                    if isinstance(event.part, TextPart):
                                        yield (
                                            "data: " + event_to_json_string(event) + "\n\n"
                                        )
                                    elif isinstance(event.part, ReasoningPart):
                                        yield (
                                            "data: " + event_to_json_string(event) + "\n\n"
                                        )
                                elif isinstance(event, PartDeltaEvent):
                                    if isinstance(event.delta, TextPartDelta):
                                        yield (
                                            "data: " + event_to_json_string(event) + "\n\n"
                                        )
                                    elif isinstance(event.delta, ReasoningPartDelta):
                                        yield (
                                            "data: " + event_to_json_string(event) + "\n\n"
                                        )
                        db_message = DBMessage(
                            content=json.dumps(model_message_to_dict(node.request)),
                            is_user_message=False,
                            conversation_id=conversation_id,
                        )
                        session.add(db_message)
                        session.commit()
                    elif agent.is_call_tools_node(node):
                        async with node.stream(run.ctx) as handle_stream:
                            async for event in handle_stream:
                                yield "data: " + event_to_json_string(event) + "\n\n"
                        db_message = DBMessage(
                            content=json.dumps(model_message_to_dict(node.model_response)),
                            is_user_message=False,
                            conversation_id=conversation_id,
                        )
                        session.add(db_message)
                        session.commit()

    return StreamingResponse(
        generate_chunks(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream",
        },
    )


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
    return {"status": "success", "messages": conversation.messages}


def event_to_json_string(event):
    """Convert event objects to JSON string."""
    event_type = "part_start"
    if isinstance(event, PartDeltaEvent):
        event_type = "part_delta"
    elif isinstance(event, FunctionToolCallEvent):
        event_type = "tool_call"
    elif isinstance(event, FunctionToolResultEvent):
        event_type = "tool_result"
    event_dict = {"type": event_type, "data": event_to_dict(event)}
    return json.dumps(event_dict)


def event_from_json_string(json_str):
    """Convert JSON string back to event object."""
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
        return FunctionToolCallEvent(
            part=ToolCallPart(
                tool_name=event_data["tool_call"]["name"],
                args=event_data["tool_call"]["args"],
                tool_call_id=event_data["tool_call"]["tool_call_id"],
            ),
            event_kind=event_data["event_kind"],
        )
    elif data["type"] == "tool_result":
        tool_result = event_data["tool_result"]
        if "content" in tool_result:
            return FunctionToolResultEvent(
                result=ToolReturnPart(
                    tool_name=tool_result["name"],
                    content=tool_result["content"],
                    tool_call_id=tool_result["tool_call_id"],
                ),
                tool_call_id=event_data["tool_call_id"],
                event_kind=event_data["event_kind"],
            )
        elif "retry_prompt" in tool_result:
            return FunctionToolResultEvent(
                result=RetryPromptPart(
                    content=tool_result["retry_prompt"],
                    tool_call_id=tool_result["tool_call_id"],
                ),
                tool_call_id=event_data["tool_call_id"],
                event_kind=event_data["event_kind"],
            )
        else:
            print(f"Unknown tool result format: {tool_result}")
            return None
    return None


def event_to_dict(event):
    """Convert event objects to serializable dictionaries."""
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
        return {
            "tool_call": {
                "name": event.part.tool_name,
                "args": event.part.args,
                "tool_call_id": event.part.tool_call_id,
            },
            "call_id": event.call_id,
            "event_kind": event.event_kind,
        }
    elif isinstance(event, FunctionToolResultEvent):
        return {
            "tool_result": {
                "name": event.result.tool_name,
                "content": str(event.result.content) if not isinstance(event.result.content, str) else event.result.content,
                "tool_call_id": event.result.tool_call_id,
                "timestamp": event.result.timestamp.isoformat(),
            },
            "tool_call_id": event.tool_call_id,
            "event_kind": event.event_kind,
        }
    return vars(event)


def model_message_to_dict(message: Union[ModelRequest, ModelResponse]) -> dict:
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
            return {
                "type": "ToolCallPart",
                "content": {
                    "name": part.tool_name,
                    "args": part.args,
                    "tool_call_id": part.tool_call_id,
                },
                "part_kind": getattr(part, "part_kind", "text"),
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
            return {
                "type": "ToolReturnPart",
                "content": {
                    "name": part.tool_name,
                    "content": str(part.content) if not isinstance(part.content, str) else part.content,
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
    

# def model_message_to_dict(message: Union[ModelRequest, ModelResponse]) -> dict:
#     """Convert a ModelRequest or ModelResponse to a dictionary for storage"""

#     def part_to_dict(part):

#         # content = part.content

#         cls_name = part.__class__.__name__

#         if cls_name in ["ImageUrl", "AudioUrl", "DocumentUrl"]:
#             url_type = {
#                 "ImageUrl": "image-url",
#                 "AudioUrl": "audio-url",
#                 "DocumentUrl": "document-url",
#             }[cls_name]
#             return {
#                 "type": cls_name,
#                 "content": {"url": part.url},
#                 "part_kind": url_type,
#             }
#         if isinstance(part, ToolCallPart):
#             content = {
#                 "name": part.tool_name,
#                 "args": part.args,
#                 "tool_call_id": part.tool_call_id,
#             }
#             return {
#                 type : 
#             }

#         elif isinstance(part, ReasoningPart):
#             content = part.reasoning
#         elif isinstance(part, UserPromptPart):
#             if isinstance(part.content, list):
#                 content = [part_to_dict(item) for item in part.content]
#             else:
#                 content = part.content
#         elif isinstance(part, TextPart):
#             content = part.content
#         elif isinstance(part, SystemPromptPart):
#             content = part.content
#         elif isinstance(part, RetryPromptPart):
#             content = part.content
#         elif isinstance(part, ToolReturnPart):
#             # print("I am here", part)
#             content = {
#                 "name": part.tool_name,
#                 "content": part.content,
#                 "tool_call_id": part.tool_call_id,
#             }
#         print(content)
#         return {
#             "type": part.__class__.__name__,
#             "content": content,
#             "part_kind": part.part_kind if hasattr(part, "part_kind") else "text",
#         }

#     if isinstance(message, ModelRequest):
#         return {
#             "type": "model_request",
#             "parts": [part_to_dict(part) for part in message.parts],
#             "kind": message.kind,
#         }
#     else:  # ModelResponse
#         return {
#             "type": "model_response",
#             "parts": [part_to_dict(part) for part in message.parts],
#             "model_name": message.model_name,
#             "timestamp": message.timestamp.isoformat() if message.timestamp else None,
#             "kind": message.kind,
#         }


def dict_to_model_message(data: dict) -> Union[ModelRequest, ModelResponse]:
    """Convert a dictionary back to a ModelRequest or ModelResponse"""

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
            parts.append(
                ToolCallPart(
                    tool_name=part_data["content"].get("name"),
                    args=part_data["content"].get("args"),
                    tool_call_id=part_data["content"].get("tool_call_id"),
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
            parts.append(
                ToolReturnPart(
                    tool_name=part_data["content"].get("name"),
                    content=part_data["content"].get("content"),
                    tool_call_id=part_data["content"].get("tool_call_id"),
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
