import {
  Accessor,
  Component,
  createEffect,
  createMemo,
  createSignal,
  Show,
} from "solid-js";
import {
  Message,
  ContentItem,
  ImageData as CustomImageData,
  PdfData,
} from "../models/models"; // Import PdfData
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
    if (typeof content === "string") {
      return content;
    } else if (Array.isArray(content)) {
      if (content.length === 0) {
        return "";
      }

      const elements = content.map((item) => {
        if (typeof item === "object" && item !== null) {
          if (typeof item.content === "string") {
            return <span class="mr-1">{item.content}</span>;
          } else if (item.content && typeof item.content === "object") {
            // Handle image content
            if (
              item.type === "ImageUrl" ||
              (item.content as any).kind === "image-url"
            ) {
              const imageContent = item.content as CustomImageData;
              return (
                <div class="my-2 w-full flex justify-end">
                  <img
                    src={imageContent.serverUrl || imageContent.url}
                    alt="User uploaded image"
                    class="max-w-full h-auto rounded-lg shadow-lg hover:shadow-xl transition-shadow"
                  />
                </div>
              );
            } else if (
              item.content &&
              typeof item.content === "object" &&
              (item.content as any).kind === "pdf-file"
            ) {
              // Handle PDF content
              const pdfContent = item.content as PdfData;
              // Display placeholder text for PDF, maybe add an icon later
              return (
                <div class="my-1 p-2 bg-gray-200 dark:bg-gray-600 rounded text-sm flex items-center gap-2">
                  {/* Placeholder for a PDF icon */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5 text-red-600"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 11-2 0V4H6v12a3 3 0 106 0V4a.5.5 0 01.5-.5h.5a.5.5 0 01.5.5v12a5 5 0 11-10 0V4z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  <span>{pdfContent.filename || "PDF File"}</span>
                </div>
              );
            }
            // Fallback for other unsupported object types within the array
            return "[Unsupported content type]";
          }
        }
        // Fallback for non-object items in the array (shouldn't happen with current structure)
        return "";
      });

      return <div class="flex flex-col w-full">{elements}</div>;
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
      // id={isLast() ? "last-message" : ""}
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
