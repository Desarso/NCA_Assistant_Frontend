from datetime import datetime
import json
import os
import logging
from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect
from requests import Session
import asyncio

from ai.core.agent_factory import MyDeps
from ai.core.prompts import get_system_prompt
from ai.assistant_functions.memory_functions import get_memory_no_context
from pydantic_ai.messages import (
    ImageUrl,  # noqa: F401
    ModelRequest,
    SystemPromptPart,
    UserPromptPart,
)
from helpers.helper_funcs import geminiParts
from database.models import get_session, User, Conversation, Message as DBMessage, MessageType
from fastapi.responses import JSONResponse
from services.chat_events import get_message_history, model_message_to_dict, CLIENT_PREVIEW_REASON
from services.chat_session import get_or_create_session, chat_sessions



from models.chat_models import (
    DocumentUrlContent,
    ChatRequest,
)


chats_router = APIRouter(prefix="/chats")
ws_chats_router = APIRouter(prefix="/chats")

# Streaming debug flag and logger (enable with env STREAM_DEBUG=1)
def STREAM_DEBUG() -> bool:
    # Evaluate at call time so .env loaded later still works
    return os.getenv("STREAM_DEBUG", "0") == "1"

stream_logger = logging.getLogger("chat.stream")

# Chat session state and helpers moved to services.chat_session
@chats_router.get("/running", response_model=dict)
def list_running_conversations(
    request: Request,
    session: Session = Depends(get_session),
):
    """Return conversation_ids currently running for this user."""
    current_user = request.state.user
    running: list[str] = []
    for conv_id, chat_session in chat_sessions.items():
        try:
            if not chat_session.is_running():
                continue
            convo = session.get(Conversation, conv_id)
            if convo and convo.user_id == current_user.uid:
                running.append(conv_id)
        except Exception:
            continue
    return {"status": "success", "running": running}



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
    try:


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
            # Inherit model from user at creation
            conversation = Conversation(
                id=conversation_id,
                title=title,
                user_id=current_user.uid,
                model=user.preferred_model,
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

        system_prompt_value = get_system_prompt(request.state.user, memory)

        if len(message_history) > 0:
            system_prompt = message_history[0].parts[0].content
            if system_prompt:
                message_history[0].parts[0].content = system_prompt_value

        # In the chat endpoint, before creating the agent:
        has_pdfs = any(
            isinstance(item.content, DocumentUrlContent)
            for item in chat_request.content
            if hasattr(item, 'content') and hasattr(item.content, 'kind')
        )

        user_content = chat_request.to_user_content()

        preview_message_id: int | None = None
        if user_content:
            preview_request = ModelRequest(
                parts=[
                    SystemPromptPart(content=system_prompt_value),
                    UserPromptPart(content=user_content),
                ],
                kind="request",
            )
            preview_payload = model_message_to_dict(preview_request)
            preview_message = DBMessage(
                content=json.dumps(preview_payload),
                message_type=MessageType.USER,
                conversation_id=conversation_id,
                reasoning=CLIENT_PREVIEW_REASON,
            )
            session.add(preview_message)
            conversation.updated_at = datetime.now()
            session.add(conversation)
            session.commit()
            session.refresh(preview_message)
            preview_message_id = preview_message.id

        # Start or resume background chat session
        if STREAM_DEBUG():
            try:
                # Brief content summary without heavy data
                kinds = []
                for item in chat_request.content:
                    c = getattr(item, "content", None)
                    if isinstance(c, str):
                        kinds.append("text")
                    elif hasattr(c, "kind"):
                        kinds.append(str(getattr(c, "kind", "unknown")))
                    else:
                        kinds.append(type(c).__name__)
                stream_logger.info(
                    "chat:start user=%s conv=%s kinds=%s",
                    getattr(current_user, "uid", None),
                    conversation_id,
                    ",".join(kinds),
                )
            except Exception:
                pass
        chat_session = get_or_create_session(conversation_id)
        await chat_session.start(
            current_user,
            user_content,
            has_pdfs=has_pdfs,
            memory=memory,
            pending_user_message_id=preview_message_id,
        )

        # Do not hold the HTTP request open; background session streams via WebSocket

        return JSONResponse({"status": "started", "conversation_id": conversation_id}, status_code=202)

    except Exception:
        raise


@chats_router.post("/chat/stop")
async def stop_chat(
    request: Request,
    conversation_id: str,
):
    """Stop a running chat session for the given conversation."""
    try:
        current_user = request.state.user  # Reserved for future authorization checks per conversation
        _ = getattr(current_user, 'uid', None)

        

        chat_session = get_or_create_session(conversation_id)
        if not chat_session.is_running():
            return JSONResponse({"status": "not_running", "conversation_id": conversation_id})

        await chat_session.stop()

        

        return JSONResponse({"status": "stopped", "conversation_id": conversation_id})

    except Exception:
        raise

async def get_user_confirmation(node, deps: MyDeps) -> bool:
    # Placeholder: actual confirmation should be driven by WebSocket messages
    return False





@ws_chats_router.websocket("/ws")
async def chat_ws(websocket: WebSocket, conversation_id: str):
    """
    WebSocket endpoint for single conversation chat streaming.
    Handles the main chat WebSocket connection for a specific conversation.
    """
    # Manual auth for WebSocket: read token from headers or query param
    token_header = websocket.headers.get('authorization')
    token_param = websocket.query_params.get('token')
    _token = None
    if token_header and token_header.lower().startswith('bearer '):
        _token = token_header.split(' ', 1)[1]
    elif token_param:
        _token = token_param

    try:
        # Accept the WebSocket connection (reduced logging to prevent spam)
        await websocket.accept()

        if STREAM_DEBUG():
            stream_logger.info("ws:open conv=%s", conversation_id)

        chat_session = get_or_create_session(conversation_id)

        # Define nested function for forwarding events
        async def forward_events():
            """Forward events from session queue to WebSocket with error handling."""
            messages_sent = 0
            try:
                while True:
                    try:
                        chunk = await chat_session.queue.get()
                        messages_sent += 1

                        if chunk.startswith("data: "):
                            payload = chunk[len("data: ") :].strip()
                            if STREAM_DEBUG():
                                try:
                                    d = json.loads(payload)
                                    et = d.get("type")
                                    kind = None
                                    data = d.get("data") or {}
                                    if isinstance(data, dict):
                                        if "part" in data and isinstance(data["part"], dict):
                                            kind = data["part"].get("part_kind")
                                        elif "delta" in data and isinstance(data["delta"], dict):
                                            kind = data["delta"].get("part_kind")
                                    stream_logger.info("ws:send conv=%s type=%s kind=%s", conversation_id, et, kind)
                                except Exception as e:
                                    stream_logger.warning("ws:send_parse_error conv=%s error=%s", conversation_id, str(e))
                            await websocket.send_text(payload)
                            # Proactively close the websocket after terminal events
                            try:
                                term_type = None
                                try:
                                    d = json.loads(payload)
                                    term_type = d.get("type")
                                except Exception:
                                    term_type = None
                                if term_type in {"done", "stopped", "error"}:
                                    if STREAM_DEBUG():
                                        stream_logger.info("ws:close_after_terminal conv=%s type=%s", conversation_id, term_type)
                                    await websocket.close()
                                    break
                            except Exception:
                                pass
                        else:
                            await websocket.send_text(chunk)

                    except Exception as e:
                        # Stop forwarding on send errors to avoid infinite loops after disconnect
                        if STREAM_DEBUG():
                            stream_logger.warning("ws:send_error conv=%s: %s", conversation_id, str(e))
                        break

            except asyncio.CancelledError:
                if STREAM_DEBUG():
                    stream_logger.info("ws:forward_cancelled conv=%s", conversation_id)
                return
            except Exception as e:
                if STREAM_DEBUG():
                    stream_logger.error("ws:forward_critical_error conv=%s: %s", conversation_id, str(e))
                raise

            return

        producer = asyncio.create_task(forward_events())

        try:
            messages_received = 0
            while True:
                try:
                    raw = await websocket.receive_text()  # Receive message
                    messages_received += 1

                    # Log received message for debugging
                    if STREAM_DEBUG():
                        stream_logger.info("ws:recv conv=%s msg_num=%s", conversation_id, messages_received)

                    # Always ack
                    await websocket.send_text(json.dumps({"type": "ack"}))

                    # Best-effort parse client message and reply with terminal state if session is over
                    try:
                        data = json.loads(raw)
                        if isinstance(data, dict) and data.get("type") == "ping":
                            # If session is no longer running/started, tell client to stop
                            if not chat_session.is_running() or not getattr(chat_session, 'started', False):
                                await websocket.send_text(json.dumps({
                                    "type": "stopped",
                                    "conversation_id": conversation_id
                                }))
                                # Close the websocket to prevent further pings
                                try:
                                    await websocket.close()
                                except Exception:
                                    pass
                                break
                    except Exception:
                        # ignore malformed client messages
                        pass

                except WebSocketDisconnect:
                    # Propagate to outer handler where we cancel producer
                    raise
                except Exception as e:
                    # Stop loop on generic receive errors to avoid tight error spin
                    if STREAM_DEBUG():
                        stream_logger.warning("ws:receive_error conv=%s: %s", conversation_id, str(e))
                    break

            # Ensure forwarder stops when receive loop ends
            producer.cancel()

        except WebSocketDisconnect:
            # Reduced logging for normal disconnects
            if STREAM_DEBUG():
                stream_logger.info("ws:close conv=%s", conversation_id)
            producer.cancel()

        except Exception as e:
            # Only log critical connection errors
            if STREAM_DEBUG():
                stream_logger.error("ws:connection_error conv=%s: %s", conversation_id, str(e))
            producer.cancel()
            raise

    except Exception as e:
        # Only log setup errors in debug mode to prevent spam
        if STREAM_DEBUG():
            stream_logger.error("ws:setup_error conv=%s: %s", conversation_id, str(e))
        raise


@ws_chats_router.websocket("/ws-all")
async def chat_ws_all(websocket: WebSocket, conversation_ids: str | None = None):
    """Single multiplexed WebSocket for all chat updates.

    Behaviors:
    - Accepts optional initial subscriptions via `conversation_ids` query param (comma-separated).
    - Supports dynamic subscribe/unsubscribe over the socket by sending JSON messages:
        {"type": "subscribe", "conversation_ids": ["id1", "id2"]}
        {"type": "unsubscribe", "conversation_ids": ["id1"]}
      Also accepts single string as `conversation_id` for convenience.
    - Echoes {"type": "ack"} for all well-formed client messages.
    - Forwards all server-side events for subscribed conversations with `conversation_id` injected.
    """
    await websocket.accept()

    # Track forwarder tasks per conversation id
    forwarders: dict[str, asyncio.Task] = {}

    async def make_forwarder(conv_id: str) -> asyncio.Task:
        # Avoid duplicate forwarders
        if conv_id in forwarders:
            return forwarders[conv_id]
        session_obj = get_or_create_session(conv_id)

        async def forward_events():
            try:
                while True:
                    chunk = await session_obj.queue.get()
                    payload = chunk
                    if chunk.startswith("data: "):
                        payload = chunk[len("data: ") :].strip()
                    # Attempt to merge conversation_id into JSON events
                    try:
                        d = json.loads(payload)
                        d["conversation_id"] = conv_id
                        await websocket.send_text(json.dumps(d))
                    except Exception:
                        await websocket.send_text(json.dumps({"conversation_id": conv_id, "raw": payload}))
            except asyncio.CancelledError:
                return

        task = asyncio.create_task(forward_events())
        forwarders[conv_id] = task
        return task

    # Seed initial subscriptions from query param if provided
    if conversation_ids:
        ids = [c.strip() for c in conversation_ids.split(",") if c.strip()]
        for cid in ids:
            await make_forwarder(cid)

    try:
        while True:
            raw = await websocket.receive_text()
            # Default ACK for any message
            try:
                data = json.loads(raw)
            except Exception:
                data = None

            if isinstance(data, dict):
                msg_type = data.get("type")
                # Normalize payload to list[str]
                convs: list[str] = []
                if "conversation_ids" in (data or {}):
                    payload = data.get("conversation_ids")
                    if isinstance(payload, list):
                        convs = [str(x) for x in payload if isinstance(x, (str, int))]
                    elif isinstance(payload, (str, int)):
                        convs = [str(payload)]
                elif "conversation_id" in (data or {}):
                    payload = data.get("conversation_id")
                    if isinstance(payload, (str, int)):
                        convs = [str(payload)]

                if msg_type == "subscribe" and convs:
                    for cid in convs:
                        await make_forwarder(cid)
                    await websocket.send_text(json.dumps({"type": "ack", "subscribed": list(convs)}))
                    continue
                if msg_type == "unsubscribe" and convs:
                    for cid in convs:
                        t = forwarders.pop(cid, None)
                        if t:
                            t.cancel()
                    await websocket.send_text(json.dumps({"type": "ack", "unsubscribed": list(convs)}))
                    continue
                if msg_type == "ping":
                    # Return active sessions (by id) from running forwarders and global sessions
                    active_ids: list[str] = []
                    try:
                        # forwarders we are subscribed to are considered active if their session is running
                        for cid in list(forwarders.keys()):
                            try:
                                sess = get_or_create_session(cid)
                                if sess.is_running() or getattr(sess, 'started', False):
                                    active_ids.append(cid)
                            except Exception:
                                pass
                    except Exception:
                        pass
                    await websocket.send_text(json.dumps({"type": "pong", "active_conversations": active_ids}))
                    continue

            # Default ACK for keepalives/unknown messages
            await websocket.send_text(json.dumps({"type": "ack"}))
    except WebSocketDisconnect:
        # Cancel all forwarders on disconnect
        for t in list(forwarders.values()):
            t.cancel()
    except Exception:
        for t in list(forwarders.values()):
            t.cancel()
