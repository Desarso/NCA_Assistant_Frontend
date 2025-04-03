import {
  createSignal,
  createEffect,
  onMount,
  For,
  Show,
  untrack,
  createMemo,
  Component,
  Accessor,
} from "solid-js";
import Prism from "prismjs";
import "./index.css";
import { ContentItem, Message } from "../models/models";
import MicrophoneVisualizer from "../../components/MicrophoneVisualizer";
import { useSidebar } from "@/components/ui/sidebar";
import { useChatContext } from "@/layout";
import { useParams } from "@solidjs/router";
import AssistantMessageRenderer from "../components/AssitantMessageRenderer";
import ChatInput from "../components/ChatInput";

const HOST = import.meta.env.VITE_CHAT_HOST;

interface DBMessage {
  id: number;
  created_at: string;
  conversation_id: number;
  content: string;
  is_user_message: boolean;
  updated_at: string;
}

type ChatMessage = Message;

// Helper function to check if content is an array of ContentItems
function isContentItemArray(content: any): content is ContentItem[] {
  return Array.isArray(content);
}

// Helper function to check if content has a name property
function isNameObject(content: any): content is { name: string } {
  return typeof content === "object" && content !== null && "name" in content;
}

// Component to render user message content
const UserMessage: Component<{
  content: string | ContentItem[] | { name: string };
}> = (props) => {
  // Memoize the content to prevent re-renders
  const memoizedContent = createMemo(() => props.content);

  const renderContent = () => {
    const content = memoizedContent();

    if (isContentItemArray(content)) {
      return (
        <For each={content}>
          {(item) => (
            <Show
              when={typeof item.content === "string"}
              fallback={
                <Show
                  when={
                    typeof item.content === "object" &&
                    item.content !== null &&
                    "kind" in item.content &&
                    item.content.kind === "image-url"
                  }
                >
                  <div class="flex justify-end">
                    <img
                      src={
                        typeof item.content === "object" &&
                        item.content !== null &&
                        "url" in item.content
                          ? (item.content.url as string)
                          : ""
                      }
                      alt="Uploaded content"
                      class="h-80 w-80 object-cover rounded-xl shadow-lg hover:shadow-xl transition-shadow mt-4 ml-4 mr-4"
                    />
                  </div>
                </Show>
              }
            >
              <div class="text-base leading-relaxed m-2">
                {item.content as string}
              </div>
            </Show>
          )}
        </For>
      );
    } else if (typeof content === "string") {
      return <div class="text-base leading-relaxed m-2">{content}</div>;
    } else {
      return (
        <div class="text-base leading-relaxed m-2">
          {JSON.stringify(content)}
        </div>
      );
    }
  };

  return <>{renderContent()}</>;
};

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
  const [messageContent, setMessageContent] = createSignal(
    props.message.content
  );
  const [messageReasoning, setMessageReasoning] = createSignal(
    props.message.reasoning
  );

  createEffect(() => {
    if (isLast()) {
      setMessageContent(props.messages()[props.messages().length - 1].content);
      setMessageReasoning(
        props.messages()[props.messages().length - 1].reasoning
      );
    }
  });

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
              reasoning={messageReasoning}
            />
          }
        >
          <div class="text-sm md:text-base flex flex-col gap-8 w-full items-end">
            <UserMessage content={messageContent()} />
          </div>
        </Show>
      </div>
    </div>
  );
};

function convertToChatMessages(messages: DBMessage[]): ChatMessage[] {
  return messages
    .map((message) => {
      try {
        const parsed = JSON.parse(message.content);
        const messageType = parsed.kind || parsed.type;

        // Handle model requests
        if (messageType === "request") {
          // Find the UserPromptPart in the parts array
          const userPart = parsed.parts.find(
            (part: any) => part.type === "UserPromptPart"
          );
          if (userPart) {
            // Handle array content (mixed content including ImageUrl)
            if (Array.isArray(userPart.content)) {
              return {
                role: "user",
                content: userPart.content.map((item: any) => {
                  // Handle string type items
                  if (item.type === "str") {
                    return {
                      type: "str",
                      content: item.content,
                      part_kind: "text",
                    };
                  }
                  // Handle ImageUrl, AudioUrl, DocumentUrl objects
                  if (
                    item.type &&
                    item.content &&
                    item.part_kind &&
                    item.part_kind.endsWith("-url")
                  ) {
                    return {
                      content: {
                        url: item.content.url,
                        media_type: item.part_kind.replace("-url", "/*"),
                        kind: item.part_kind,
                        serverUrl: item.content.url,
                      },
                    };
                  }
                  return { content: JSON.stringify(item) };
                }),
              };
            }
            // Handle single string content
            if (typeof userPart.content === "string") {
              return {
                role: "user",
                content: userPart.content,
              };
            }
            // Handle single object content
            return {
              role: "user",
              content: [
                {
                  content: userPart.content,
                },
              ],
            };
          }
          const toolReturnPart = parsed.parts.find(
            (part: any) => part.type === "ToolReturnPart"
          );
          if (toolReturnPart) {
            return {
              role: "tool_result",
              content: JSON.stringify(toolReturnPart.content),
            };
          }
          return null;
        }

        // Handle model responses
        if (messageType === "response") {
          let result = {
            role: "assistant",
            content: "",
            reasoning: "",
          };

          for (const part of parsed.parts) {
            if (part.type === "TextPart") {
              result.content += part.content;
            }
            if (part.type === "ReasoningPart") {
              result.reasoning += part.content;
            }
            if (parsed.parts[0].type === "ToolCallPart") {
              return {
                role: "tool_call",
                content: JSON.stringify(parsed.parts[0].content),
              };
            }
          }

          return result;
        }

        return null;
      } catch (e) {
        console.error("Error parsing message:", e);
        return null;
      }
    })
    .filter((message): message is ChatMessage => message !== null);
}

function ChatWindow() {
  const { open, openMobile, isMobile } = useSidebar();
  const [gettingResponse, setGettingResponse] = createSignal<boolean>(false);
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [isListening, setIsListening] = createSignal<boolean>(false);

  const params = useParams();
  const id = createMemo(() => params.id);
  const [conversationId, setConversationId] = createSignal<string>(
    id() || crypto.randomUUID().toString()
  );
  const [isMuted, setIsMuted] = createSignal<boolean>(false);
  const abortControllerRef = { current: false };
  const { fetchConversations } = useChatContext();

  // Memoize the messages to prevent unnecessary re-renders
  const memoizedMessages = createMemo(() => messages());

  function scrollToBottom() {
    const lastMessage = document.getElementById("last-message");
    if (lastMessage) {
      lastMessage.scrollIntoView({
        behavior: "smooth",
        block: "end"
      });
    }
  }

  onMount(async () => {
    if (id()) {
      setConversationId(id());
    }
    await fetchMessageHistory(id());
    scrollToBottom();
    window.Prism = Prism;
    Prism.highlightAll();
  });

  createEffect(() => {
    if (messages().length > 0) {
      Prism.highlightAll();
    }
  });

  createEffect(async () => {
    const currentId = id();
    if (currentId && currentId !== conversationId()) {
      setConversationId(currentId);
      await fetchMessageHistory(currentId);
      scrollToBottom();
    }
  });

  const handleSubmit = async (content: string | ContentItem[]) => {
    if (gettingResponse()) return;

    setGettingResponse(true);

    const newMessage: Message = {
      role: "user",
      content: content,
    };

    const currentMessages = untrack(() => messages());
    const updatedMessages = [...currentMessages, newMessage];
    setMessages(updatedMessages);
    scrollToBottom();

    const url = new URL(`${HOST}/api/v1/chats/chat`);
    const requestBody = {
      content:
        typeof content === "string"
          ? [{ content: content }]
          : content.map((item) => {
              if (typeof item.content === "string") {
                return {
                  content: item.content,
                };
              } else if (item.content.serverUrl) {
                return {
                  content: {
                    url: item.content.serverUrl,
                    media_type: item.content.media_type,
                    kind: "image-url",
                  },
                };
              } else {
                throw new Error("Image upload data is incomplete.");
              }
            }),
    };
    url.searchParams.append("conversation_id", conversationId());

    try {
      // Reset abort flag at start of new request
      abortControllerRef.current = false;

      // Import authFetch to add auth token to the request
      const { authFetch } = await import("@/lib/utils");

      const response = await authFetch(url.toString(), {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";

      // Initialize the assistant message to avoid repeated creations
      let assistantMessageCreated = false;

      while (true) {
        // Check if request was aborted
        if (abortControllerRef.current) {
          console.log("Request aborted");
          reader.cancel();
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages from buffer
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || ""; // Keep the last incomplete chunk in the buffer

        // Get current messages only once per processing cycle
        let currentMessageState = [...messages()];

        // Process each line in the stream
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          try {
            const jsonString = line.slice(6);
            const data = JSON.parse(jsonString);

            // Check if we need to create a new assistant message
            if (
              !assistantMessageCreated &&
              (data.type === "part_start" || data.type === "part_delta")
            ) {
              // Create the assistant message if it doesn't exist or we're starting a new response
              const newAssistantMessage = {
                role: "assistant",
                content: "",
                reasoning: "",
              };

              // Make a copy to avoid directly modifying the current state
              const updatedMessages = [
                ...currentMessageState,
                newAssistantMessage,
              ];
              currentMessageState = updatedMessages;
              assistantMessageCreated = true;
            }

            // Always work with the last message for updates
            const lastMessage =
              currentMessageState[currentMessageState.length - 1];

            // Process different message types
            if (data.type === "part_start") {
              if (
                data.data?.part?.part_kind === "text" &&
                lastMessage?.role === "assistant"
              ) {
                if (typeof lastMessage.content === "string") {
                  lastMessage.content += data.data.part.content || "";
                }
              } else if (
                data.data?.part?.part_kind === "reasoning" &&
                lastMessage?.role === "assistant"
              ) {
                if (typeof lastMessage.reasoning === "string") {
                  lastMessage.reasoning += data.data.part.reasoning || "";
                }
              }
            } else if (data.type === "part_delta") {
              if (
                data.data?.delta?.part_kind === "text" &&
                lastMessage?.role === "assistant"
              ) {
                if (typeof lastMessage.content === "string") {
                  lastMessage.content += data.data.delta.content || "";
                }
              } else if (
                data.data?.delta?.part_kind === "reasoning" &&
                lastMessage?.role === "assistant"
              ) {
                if (typeof lastMessage.reasoning === "string") {
                  lastMessage.reasoning += data.data.delta.reasoning || "";
                }
              }
            } else if (data.type === "tool_call") {
              if (data.data?.tool_call) {
                const newToolCallMessage = {
                  role: "tool_call",
                  content: data.data.tool_call,
                };
                currentMessageState.push(newToolCallMessage);
                assistantMessageCreated = false; // Reset to allow future assistant messages
              }
            } else if (data.type === "tool_result") {
              if (data.data?.tool_result) {
                const newToolResultMessage = {
                  role: "tool_result",
                  content: data.data.tool_result,
                };
                currentMessageState.push(newToolResultMessage);
              }
            }

            // Update the messages state with new messages using a new array to ensure reactivity
            // Only update when necessary
            // console.log("currentMessageState", currentMessageState);
            setMessages([...currentMessageState]);

            // Scroll to bottom with a small delay to allow rendering
          } catch (e) {
            console.error("Error parsing JSON:", e);
          }
        }
      }

      if (window.location.pathname === "/") {
        window.history.pushState({}, "", `/chat/${conversationId()}`);
        fetchConversations();
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setGettingResponse(false);
    }
  };

  const fetchMessageHistory = async (id: string = conversationId()) => {
    const url = new URL(`${HOST}/api/v1/chats/conversations/${id}/messages`);
    try {
      const { authFetch } = await import("@/lib/utils");

      const response = await authFetch(url.toString(), {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const chatMessages = convertToChatMessages(data.messages);
      // console.log("chatMessages", chatMessages);
      setMessages(chatMessages);
    } catch (error) {
      console.error("Failed to fetch chat history:", error);
    }
  };

  const handleFileAttachment = () => {
    console.log("File attachment initiated");
  };

  const handleMicrophoneClose = () => {
    if (navigator.mediaDevices) {
      console.log("Stopping microphone");
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          console.log(stream.getTracks());
          stream.getTracks().forEach((track) => track.stop());
        })
        .catch((err) => console.error("Error accessing microphone:", err));
    }
    setIsListening(false);
  };

  const handleMicrophoneMute = () => {
    if (navigator.mediaDevices) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          stream.getTracks().forEach((track) => track.stop());
        })
        .catch((err) => console.error("Error accessing microphone:", err));
    }
    setIsMuted(!isMuted());
  };

  const handleStopRequest = () => {
    abortControllerRef.current = true;
    setGettingResponse(false);
  };

  return (
    <div class="flex w-full h-full flex-col justify-center items-center bg-gray-50 dark:bg-gray-900">
      <Show
        when={isListening()}
        fallback={
          <>
            <div
              class={`flex-1 flex flex-col items-center overflow-y-auto space-y-6 Chat-Container
              max-h-[calc(100vh-134px)] 
              md:max-h-[calc(100vh-136px)] 
              ${
                isMobile()
                  ? openMobile()
                    ? "w-[calc(100vw-var(--sidebar-width))]"
                    : "w-full"
                  : open()
                  ? "w-[calc(100vw-var(--sidebar-width))]"
                  : "w-full"
              }
              ${memoizedMessages().length === 0 ? "h-full" : ""}
              `}
            >
              <For each={memoizedMessages()}>
                {(message, index) => (
                  <Show
                    when={
                      message.role === "user" || message.role === "assistant"
                    }
                    fallback={<></>}
                  >
                    <MessageItem
                      message={message}
                      messages={messages}
                      isLast={index() === memoizedMessages().length - 1}
                      gettingResponse={
                        gettingResponse() &&
                        index() === memoizedMessages().length - 1
                      }
                    />
                  </Show>
                )}
              </For>

              <Show
                when={
                  messages().length > 0 &&
                  messages()[messages().length - 1].role === "tool_call"
                }
              >
                <div class="md:max-w-[900px] w-full flex justify-start min-h-full">
                  <span class="wave-text ml-5 pl-4">
                    {((
                      messages()[messages().length - 1].content as {
                        name: string;
                      }
                    ).name as string) || "processing..."}
                  </span>
                </div>
              </Show>

              <Show
                when={
                  messages().length > 0 &&
                  messages()[messages().length - 1].role === "tool_result"
                }
              >
                <div class="md:max-w-[900px] w-full flex justify-start min-h-full">
                  <span class="wave-text ml-5 pl-4">processing...</span>
                </div>
              </Show>

              <style>
                {`
                  @keyframes continuous-wave-forward-smooth {
                    0% {
                      background-position: 0% 50%;
                    }
                    100% {
                      background-position: -600% 50%;
                    }
                  }
                  .wave-text {
                    font-size: 1rem;
                    font-weight: 500;
                    color: gray;
                    background: linear-gradient(
                      90deg,
                      gray 0%,
                      gray 40%,
                      black 50%,
                      gray 60%,
                      gray 100%
                    );
                    background-size: 300% 100%;
                    background-clip: text;
                    -webkit-background-clip: text;
                    color: transparent;
                    animation: continuous-wave-forward-smooth 5s infinite linear;
                  }

                  @keyframes fadeIn {
                    from {
                      opacity: 0;
                      transform: translateY(10px);
                    }
                    to {
                      opacity: 1;
                      transform: translateY(0);
                    }
                  }

                  .message {
                    animation: fadeIn 0.3s ease-out forwards;
                  }

                  .message-content {
                    animation: fadeIn 0.3s ease-out forwards;
                  }

                  #last-message {
                    padding-bottom: calc(100vh - 250px);
                  }
                `}
              </style>
              <div id="messages-end-ref" />
            </div>

            <div class="border-t md:border md:rounded-lg md:mb-4 md:shadow-md border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 w-full md:max-w-[900px]">
              <ChatInput
                onSubmit={handleSubmit}
                gettingResponse={gettingResponse()}
                handleFileAttachment={handleFileAttachment}
                setIsListening={setIsListening}
                handleStopRequest={handleStopRequest}
              />
            </div>
          </>
        }
      >
        <div class="flex-1 flex items-center justify-center">
          <MicrophoneVisualizer
            isListening={!isMuted()}
            onClose={handleMicrophoneClose}
            onMute={handleMicrophoneMute}
          />
        </div>
        <div>Yo</div>
      </Show>
    </div>
  );
}

export default ChatWindow;
