import {
  Accessor,
  Component,
  createEffect,
  createMemo,
  createSignal,
  Show,
} from "solid-js";
import { Message, ContentItem } from "../models/models";
import AssistantMessageRenderer from "./AssitantMessageRenderer";

// Component for rendering a chat message item
const MessageItem: Component<{
  message: Message;
  messages: Accessor<Message[]>;
  isLast: boolean;
  gettingResponse: boolean;
}> = (props) => {
  // Memoize values to prevent unnecessary re-renders
  const isUser = createMemo(() => props.message.role === "user");
  const isLast = createMemo(() => props.isLast);

  // Create reactive signals for the message content
  const [messageContent, setMessageContent] = createSignal<
    string | ContentItem[] | { name: string }
  >(props.message.content);
  const [messageReasoning, setMessageReasoning] = createSignal<
    string | undefined
  >(props.message.reasoning);

  // this update message as it streams in
  createEffect(() => {
    if (!isLast()) return;

    if (isLast() && props.messages().length > 0) {
      const lastMsg = props.messages()[props.messages().length - 1];
      if (lastMsg.role === props.message.role) {
        setMessageContent(lastMsg.content);
        setMessageReasoning(lastMsg.reasoning);
      }
    }
  });

  // Helper function to render user content
  const renderUserContent = () => {
    const content = messageContent();
    console.log("MessageItem content type:", typeof content, content);
    
    if (typeof content === "string") {
      return content;
    } else if (Array.isArray(content)) {
      if (content.length === 0) {
        return "";
      }
      
      return content
        .map((item) => {
          if (typeof item === "object" && item !== null) {
            if (typeof item.content === "string") {
              return item.content;
            } else if (item.content && typeof item.content === "object") {
              // Handle image content or other complex types
              return "[Complex content]";
            }
          }
          return "";
        })
        .join(" ");
    } else if (content && typeof content === "object") {
      if ("name" in content) {
        return content.name || "[No name provided]";
      } else {
        // Unknown object format, try to stringify
        try {
          return JSON.stringify(content);
        } catch (e) {
          return "[Complex object]";
        }
      }
    }
    return "[Unknown content format]";
  };

  return (
    <div
      class={`md:max-w-[900px] w-full flex message pt-3 pl-3 pr-3 ${
        isUser()
          ? " user justify-end items-start pt-4"
          : " assistant justify-start items-start"
      } ${isLast() ? "" : ""}`}
      id={isLast() ? "last-message" : ""}
    >
      <div
        class={`message-content ${
          isUser() ? "max-w-[85%] flex items-end self-start" : "w-full"
        } rounded-tl-3xl rounded-tr-3xl rounded-bl-3xl rounded-br-[6px] pl-2 pr-2 ${
          isUser()
            ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            : "bg-transparent"
        } break-words overflow-hidden`}
      >
        <Show
          when={isUser()}
          fallback={
            <AssistantMessageRenderer
              fullContent={messageContent}
              gettingResponse={props.gettingResponse && isLast()}
              isLast={isLast}
              reasoning={messageReasoning}
            />
          }
        >
          <div class="text-sm md:text-base flex flex-col gap-8 w-full items-end">
            <div class="p-2">{renderUserContent()}</div>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default MessageItem;
