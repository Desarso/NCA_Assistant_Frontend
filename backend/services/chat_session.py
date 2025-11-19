import asyncio
import json
import os
import logging
import re
from datetime import datetime
from typing import List, Union, Dict

from pydantic_ai.messages import (
    PartDeltaEvent,
    PartStartEvent,
    ReasoningPart,
    ImageUrl,
    AudioUrl,
    DocumentUrl,
    BinaryContent,
)

from pydantic_ai._agent_graph import ModelRequestNode, CallToolsNode
from pydantic_graph import End

from ai.core.agent_factory import MyDeps, create_agent
from ai.core.prompts import get_system_prompt
from database.models import Conversation, Message as DBMessage, MessageType, engine
from sqlmodel import Session as DBSession

from services.chat_events import (
    event_to_json_string,
    model_message_to_dict,
    get_message_history,
    CLIENT_PREVIEW_REASON,
)


class ChatSession:
    def __init__(self, conversation_id: str):
        self.conversation_id = conversation_id
        self.queue: asyncio.Queue[str] = asyncio.Queue(maxsize=1000)
        self.task: asyncio.Task | None = None
        self.deps_instance: MyDeps | None = None
        self.started: bool = False
        self.pending_user_message_id: int | None = None
        # Streaming debug logger (enable with env STREAM_DEBUG=1)
        self._stream_debug = os.getenv("STREAM_DEBUG", "0") == "1"
        self._logger = logging.getLogger("chat.stream")
        # Content accumulation for optimized streaming
        self._content_buffer = ""
        self._table_detected = False
        self._chunk_size = 500  # Characters per chunk
        self._table_chunk_size = 1000  # Larger chunks for tables
        # Track last emit time for debugging idle periods
        self._last_emit_ts: float | None = None

    def is_running(self) -> bool:
        return self.task is not None and not self.task.done()

    def _detect_table_context(self, content: str) -> bool:
        """Detect if content contains table markdown"""
        return '|' in content and '\n|' in content

    def _find_table_row_boundary(self, content: str) -> int:
        """Find the end of a complete table row"""
        lines = content.split('\n')
        in_table = False
        table_rows = 0

        for i, line in enumerate(lines):
            line = line.strip()
            if line.startswith('|') and line.endswith('|'):
                in_table = True
                table_rows += 1

                # If we have a header + separator + at least one data row, consider it complete
                if table_rows >= 3:
                    return len('\n'.join(lines[:i+1]))
            elif in_table and line == '':
                # Empty line after table - good boundary
                return len('\n'.join(lines[:i]))
            elif in_table and not line.startswith('|'):
                # Left table context
                return len('\n'.join(lines[:i]))

        return len(content)  # No boundary found

    def _find_code_block_boundary(self, content: str) -> int:
        """Find the end of a complete code block"""
        code_block_pattern = r'```[\s\S]*?```'
        match = re.search(code_block_pattern, content)
        if match:
            return match.end()
        return len(content)

    def _find_paragraph_boundary(self, content: str) -> int:
        """Find paragraph boundaries (double newlines)"""
        double_newline = content.find('\n\n')
        if double_newline != -1:
            return double_newline + 2
        return len(content)

    def _should_flush_buffer(self, new_content: str) -> bool:
        """Determine if we should flush the accumulated buffer"""
        combined = self._content_buffer + new_content

        # Check for table boundaries
        if self._detect_table_context(combined):
            return self._find_table_row_boundary(combined) < len(combined)

        # Check for code block boundaries
        if '```' in combined:
            return self._find_code_block_boundary(combined) < len(combined)

        # Check for paragraph boundaries
        if '\n\n' in combined:
            return True

        # Check size limits
        chunk_size = self._table_chunk_size if self._table_detected else self._chunk_size
        return len(combined) >= chunk_size

    def _get_optimal_chunk(self, new_content: str) -> str:
        """Get the optimal chunk of content to send"""
        combined = self._content_buffer + new_content

        if self._detect_table_context(combined):
            self._table_detected = True
            boundary = self._find_table_row_boundary(combined)
            if boundary < len(combined):
                chunk = combined[:boundary]
                self._content_buffer = combined[boundary:]
                return chunk

        if '```' in combined:
            boundary = self._find_code_block_boundary(combined)
            if boundary < len(combined):
                chunk = combined[:boundary]
                self._content_buffer = combined[boundary:]
                return chunk

        if '\n\n' in combined:
            boundary = self._find_paragraph_boundary(combined)
            chunk = combined[:boundary]
            self._content_buffer = combined[boundary:]
            return chunk

        # Default chunking based on size
        chunk_size = self._table_chunk_size if self._table_detected else self._chunk_size
        if len(combined) >= chunk_size:
            chunk = combined[:chunk_size]
            self._content_buffer = combined[chunk_size:]
            return chunk

        # Accumulate more content
        self._content_buffer = combined
        return ""

    async def stop(self) -> None:
        if self.task and not self.task.done():
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                try:
                    await self._emit(json.dumps({"type": "stopped"}))
                except Exception:
                    pass
            except Exception as e:
                # Unexpected error while stopping
                if self._stream_debug:
                    self._logger.exception("conv=%s stop_error=%s", self.conversation_id, e)
        self.task = None
        self.started = False

    async def start(
        self,
        current_user,
        user_content: List[Union[str, ImageUrl, AudioUrl, DocumentUrl, BinaryContent]],
        has_pdfs: bool,
        memory: str | None,
        pending_user_message_id: int | None = None,
    ) -> None:
        if self.is_running():
            if self._stream_debug:
                self._logger.info("conv=%s already_running user=%s", self.conversation_id, getattr(current_user, 'uid', None))
            return
        if self._stream_debug:
            try:
                kinds = []
                for item in user_content:
                    if isinstance(item, str):
                        kinds.append("text")
                    else:
                        kinds.append(type(item).__name__)
                self._logger.info(
                    "conv=%s start user=%s kinds=%s has_pdfs=%s",
                    self.conversation_id,
                    getattr(current_user, 'uid', None),
                    ",".join(kinds),
                    has_pdfs,
                )
            except Exception:
                pass
        self.deps_instance = MyDeps(user_object=current_user, user_rejection_flags={}, conversation_id=self.conversation_id)
        self.pending_user_message_id = pending_user_message_id
        self.task = asyncio.create_task(self._run(current_user, user_content, has_pdfs, memory))
        self.started = True

    async def _run(self, current_user, user_content: List[Union[str, ImageUrl, AudioUrl, DocumentUrl, BinaryContent]], has_pdfs: bool, memory: str | None) -> None:
        try:
            with DBSession(engine) as session:
                conversation = session.get(Conversation, self.conversation_id)
                if not conversation:
                    if self._stream_debug:
                        self._logger.error("conv=%s db_missing_conversation", self.conversation_id)
                    return
                message_history = get_message_history(conversation)

                if len(message_history) > 0:
                    system_prompt = message_history[0].parts[0].content
                    if system_prompt:
                        message_history[0].parts[0].content = get_system_prompt(current_user, memory)

                if self._stream_debug:
                    self._logger.info("conv=%s agent_create start", self.conversation_id)
                # Use conversation.model if set, otherwise agent_factory will use user/default
                model_key = conversation.model if getattr(conversation, 'model', None) else None
                agent = await create_agent(current_user, memory, has_pdfs=has_pdfs, model_key=model_key)
                if self._stream_debug:
                    self._logger.info("conv=%s agent_create done", self.conversation_id)

                async with agent.iter(
                    # deps=self.deps_instance, # deps are passed at agent creation now
                    user_prompt=user_content,
                    message_history=message_history,
                ) as run:
                        async for node in run:
                            if self._stream_debug:
                                try:
                                    node_name = type(node).__name__
                                    node_info = getattr(node, "name", None) or getattr(node, "tool_name", None)
                                    self._logger.info("conv=%s node=%s info=%s", self.conversation_id, node_name, node_info)
                                except Exception:
                                    self._logger.info("conv=%s node=%s", self.conversation_id, type(node).__name__)
                            if isinstance(node, End):
                                # Flush any remaining buffered content
                                if self._content_buffer:
                                    await self._emit(json.dumps({"type": "content_chunk", "data": self._content_buffer}))
                                    self._content_buffer = ""
                                break
                            if isinstance(node, ModelRequestNode):
                                if self._stream_debug:
                                    self._logger.info("conv=%s event=model_request", self.conversation_id)
                                if self.pending_user_message_id:
                                    existing_message = session.get(DBMessage, self.pending_user_message_id)
                                    if existing_message and getattr(existing_message, "reasoning", None) == CLIENT_PREVIEW_REASON:
                                        existing_message.content = json.dumps(model_message_to_dict(node.request))
                                        existing_message.reasoning = "" # Postgres cannot accept null in reasoning column
                                        existing_message.message_type = MessageType.USER
                                        session.add(existing_message)
                                        conversation_obj = session.get(Conversation, self.conversation_id)
                                        if conversation_obj:
                                            conversation_obj.updated_at = datetime.now()
                                        session.commit()
                                    self.pending_user_message_id = None
                                else:
                                    db_message_request = DBMessage(
                                        content=json.dumps(model_message_to_dict(node.request)),
                                        message_type=MessageType.USER,
                                        conversation_id=self.conversation_id,
                                    )
                                    session.add(db_message_request)
                                    conversation_obj = session.get(Conversation, self.conversation_id)
                                    if conversation_obj:
                                        conversation_obj.updated_at = datetime.now()
                                    session.commit()

                                async with node.stream(run.ctx) as request_stream:
                                    content_accumulator = ""

                                    async for event in request_stream:
                                        if self._stream_debug:
                                            try:
                                                self._logger.debug("conv=%s request_event=%s", self.conversation_id, type(event).__name__)
                                            except Exception:
                                                pass
                                        if isinstance(event, PartStartEvent):
                                            if self._stream_debug:
                                                kind = getattr(event.part, 'part_kind', type(event.part).__name__)
                                                self._logger.info("conv=%s event=part_start kind=%s", self.conversation_id, kind)
                                            await self._emit(event_to_json_string(event))
                                        elif isinstance(event, PartDeltaEvent):
                                            if self._stream_debug:
                                                kind = getattr(event.delta, 'part_delta_kind', type(event.delta).__name__)
                                                self._logger.info("conv=%s event=part_delta kind=%s", self.conversation_id, kind)

                                            # Handle text content specifically for chunking
                                            if (hasattr(event.delta, 'content_delta') and event.delta.content_delta) or \
                                               (hasattr(event.delta, 'part_delta_kind') and event.delta.part_delta_kind == 'text'):
                                                content_delta = getattr(event.delta, 'content_delta', None) or \
                                                              getattr(event.delta, 'content', '')
                                                if content_delta:
                                                    content_accumulator += content_delta

                                                    # Check if we should flush accumulated content
                                                    should_flush = self._should_flush_buffer(content_accumulator)
                                                    if self._stream_debug and should_flush:
                                                        try:
                                                            self._logger.debug("conv=%s flush_buffer size=%s", self.conversation_id, len(self._content_buffer + content_accumulator))
                                                        except Exception:
                                                            pass
                                                    if should_flush:
                                                        chunk = self._get_optimal_chunk(content_accumulator)
                                                        if chunk:
                                                            # Send chunked content instead of individual deltas
                                                            chunk_event = {
                                                                "type": "content_chunk",
                                                                "data": chunk,
                                                                "conversation_id": self.conversation_id
                                                            }
                                                            await self._emit(json.dumps(chunk_event))
                                                            content_accumulator = self._content_buffer
                                                            self._content_buffer = ""
                                                    else:
                                                        # Continue accumulating
                                                        pass
                                            else:
                                                # Non-text events (tool calls, etc.) send immediately
                                                await self._emit(event_to_json_string(event))

                                # Flush any remaining accumulated content
                                if content_accumulator:
                                    chunk = self._get_optimal_chunk(content_accumulator)
                                    if chunk:
                                        chunk_event = {
                                            "type": "content_chunk",
                                            "data": chunk,
                                            "conversation_id": self.conversation_id
                                        }
                                        await self._emit(json.dumps(chunk_event))
                                    # Send any remaining buffer
                                    if self._content_buffer:
                                        chunk_event = {
                                            "type": "content_chunk",
                                            "data": self._content_buffer,
                                            "conversation_id": self.conversation_id
                                        }
                                        await self._emit(json.dumps(chunk_event))
                                        self._content_buffer = ""
                            elif isinstance(node, CallToolsNode):
                                if self._stream_debug:
                                    self._logger.info("conv=%s event=call_tools_start", self.conversation_id)
                                async with node.stream(run.ctx) as handle_stream:
                                    async for event in handle_stream:
                                        if self._stream_debug:
                                            try:
                                                d = json.loads(event_to_json_string(event))
                                                et = d.get("type")
                                            except Exception:
                                                et = "tool_event"
                                            self._logger.info("conv=%s event=%s", self.conversation_id, et)
                                        await self._emit(event_to_json_string(event))

                                db_message = DBMessage(
                                    content=json.dumps(model_message_to_dict(node.model_response)),
                                    message_type=MessageType.ASSISTANT,
                                    conversation_id=self.conversation_id,
                                )
                                session.add(db_message)
                                conversation_obj = session.get(Conversation, self.conversation_id)
                                if conversation_obj:
                                    conversation_obj.updated_at = datetime.now()
                                session.commit()
                                if self._stream_debug:
                                    try:
                                        for part in node.model_response.parts:
                                            if isinstance(part, ReasoningPart) and getattr(part, "reasoning", ""):
                                                snippet = part.reasoning[:80].replace("\n", "\\n")
                                                self._logger.info(
                                                    "conv=%s event=reasoning_final len=%s snippet=%s",
                                                    self.conversation_id,
                                                    len(part.reasoning),
                                                    snippet,
                                                )
                                    except Exception:
                                        pass

            await self._emit(json.dumps({"type": "done"}))
            if self._stream_debug:
                self._logger.info("conv=%s event=done", self.conversation_id)
            # Mark session no longer started so callers can create a new one if needed
            self.started = False
            self.pending_user_message_id = None

        except asyncio.CancelledError:
            raise
        except Exception as e:
            try:
                await self._emit(json.dumps({"type": "error", "data": str(e)}))
            except Exception:
                pass
            if self._stream_debug:
                # Include additional context if available
                self._logger.exception("conv=%s event=error %s", self.conversation_id, e)
            # Ensure the client knows the stream is finished even on error
            try:
                await self._emit(json.dumps({"type": "done"}))
            except Exception:
                pass
            # Mark session no longer started so callers can create a new one if needed
            self.started = False
            self.pending_user_message_id = None

    async def _emit(self, data: str) -> None:
        try:
            self.queue.put_nowait("data: " + data + "\n\n")
            if self._stream_debug:
                try:
                    d = json.loads(data)
                    et = d.get("type")
                    self._logger.debug("conv=%s emit type=%s", self.conversation_id, et)
                except Exception:
                    pass
        except asyncio.QueueFull:
            _ = await self.queue.get()
            self.queue.put_nowait("data: " + data + "\n\n")
            if self._stream_debug:
                self._logger.warning("conv=%s emit_queue_full dropped_oldest=1", self.conversation_id)


chat_sessions: Dict[str, ChatSession] = {}


def get_or_create_session(conversation_id: str) -> ChatSession:
    session = chat_sessions.get(conversation_id)
    if session is None:
        session = ChatSession(conversation_id)
        chat_sessions[conversation_id] = session
    return session


