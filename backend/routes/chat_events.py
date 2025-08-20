from datetime import datetime
import json
import uuid
from typing import Union, List, Dict

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


# Map between event.call_id and tool_call_id to normalize tools across providers
tool_call_mapping: Dict[str, str] = {}


def generate_tool_call_id() -> str:
    return f'pyd_ai_{uuid.uuid4().hex}'


def event_to_json_string(event) -> str:
    global tool_call_mapping

    if isinstance(event, FunctionToolCallEvent):
        if not event.part.tool_call_id:
            event.part.tool_call_id = generate_tool_call_id()
            event.call_id = event.part.tool_call_id
        tool_call_mapping[event.call_id] = event.part.tool_call_id
    elif isinstance(event, FunctionToolResultEvent):
        if event.tool_call_id in tool_call_mapping:
            tool_call_id = tool_call_mapping[event.tool_call_id]
            event.tool_call_id = tool_call_id
            if hasattr(event.result, 'tool_call_id'):
                event.result.tool_call_id = tool_call_id

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
        print(f"JSON serialization error: {e}")
        event_dict["data"] = str(event_dict["data"])
        return json.dumps(event_dict)


def event_from_json_string(json_str):
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
        tool_call_id = event_data["tool_call"].get("tool_call_id")
        call_id = event_data.get("call_id")
        if not tool_call_id:
            tool_call_id = generate_tool_call_id()
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
        if event.call_id != tool_call_id:
            tool_call_mapping[event.call_id] = tool_call_id
        return event
    elif data["type"] == "tool_result":
        tool_result = event_data["tool_result"]
        original_tool_call_id = event_data.get("tool_call_id")
        tool_call_id = original_tool_call_id
        if original_tool_call_id in tool_call_mapping:
            tool_call_id = tool_call_mapping[original_tool_call_id]
        if "content" in tool_result:
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
        tool_call_id = event.part.tool_call_id
        if not tool_call_id:
            tool_call_id = generate_tool_call_id()
            event.part.tool_call_id = tool_call_id
            event.call_id = tool_call_id
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
        if event.tool_call_id in tool_call_mapping:
            tool_call_id = tool_call_mapping[event.tool_call_id]
            event.tool_call_id = tool_call_id
            if hasattr(event.result, 'tool_call_id'):
                event.result.tool_call_id = tool_call_id

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
    def part_to_dict(part):
        cls_name = part.__class__.__name__
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
            tool_call_id = part.tool_call_id
            if not tool_call_id:
                tool_call_id = generate_tool_call_id()
                part.tool_call_id = tool_call_id
            args_data = part.args
            if isinstance(args_data, str):
                try:
                    args_data = json.loads(args_data)
                except json.JSONDecodeError:
                    print(
                        f"Warning: ToolCallPart args was a string but not valid JSON: {args_data}"
                    )
            return {
                "type": "ToolCallPart",
                "content": {
                    "name": part.tool_name,
                    "args": args_data,
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
        if cls_name == "CallToolResult":
            return {"type": "CallToolResult", "content": str(part), "part_kind": "text"}
        return {
            "type": cls_name,
            "content": str(part),
            "part_kind": getattr(part, "part_kind", "text"),
        }

    if isinstance(message, ModelRequest):
        return {"type": "model_request", "parts": [part_to_dict(part) for part in message.parts], "kind": message.kind}
    else:
        return {
            "type": "model_response",
            "parts": [part_to_dict(part) for part in message.parts],
            "model_name": message.model_name,
            "timestamp": message.timestamp.isoformat() if message.timestamp else None,
            "kind": message.kind,
        }


def dict_to_model_message(data: dict) -> Union[ModelRequest, ModelResponse]:
    global tool_call_mapping
    data.pop('user_rejected', None)
    message_tool_call_mapping = {}

    def convert_content(content_data):
        if isinstance(content_data, list):
            return [convert_content(item) for item in content_data]
        if isinstance(content_data, dict):
            if content_data.get("part_kind") == "image-url":
                return ImageUrl(url=content_data["url"])
            if content_data.get("part_kind") == "audio-url":
                return AudioUrl(url=content_data["url"])
            if content_data.get("part_kind") == "document-url":
                return DocumentUrl(url=content_data["url"])
            if content_data.get("part_kind") == "binary":
                return BinaryContent(data=content_data["data"], media_type=content_data["media_type"])
            if content_data.get("part_kind") == "text":
                return content_data.get("content")
        return content_data

    parts = []
    for part_data in data["parts"]:
        if part_data["type"] == "ToolCallPart":
            tool_call_id = part_data["content"].get("tool_call_id")
            if not tool_call_id:
                tool_call_id = generate_tool_call_id()
            if "call_id" in part_data:
                message_tool_call_mapping[part_data["call_id"]] = tool_call_id
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
            parts.append(UserPromptPart(content=content, part_kind=part_data.get("part_kind", "text")))
        elif part_data["type"] == "TextPart":
            parts.append(TextPart(content=part_data["content"], part_kind=part_data.get("part_kind", "text")))
        elif part_data["type"] == "SystemPromptPart":
            parts.append(SystemPromptPart(content=part_data["content"], part_kind=part_data.get("part_kind", "text")))
        elif part_data["type"] == "RetryPromptPart":
            parts.append(RetryPromptPart(content=part_data["content"], part_kind=part_data.get("part_kind", "text")))
        elif part_data["type"] == "ToolReturnPart":
            original_tool_call_id = part_data["content"].get("tool_call_id")
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
            timestamp=datetime.fromisoformat(data["timestamp"]) if data.get("timestamp") else datetime.now(),
            kind=data.get("kind", "response"),
        )


def get_message_history(conversation) -> List[ModelMessage]:
    message_history: List[ModelMessage] = []
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


