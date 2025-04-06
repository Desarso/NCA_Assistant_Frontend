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
  createResource,
} from "solid-js";
import Prism from "prismjs";
import "../styles/index.css";
import "../styles/prisma/prisma.css";
import "../styles/prisma-dark/prisma-dark.css";
import { ContentItem, Message } from "../models/models";
import MicrophoneVisualizer from "../../components/MicrophoneVisualizer";
import { useSidebar } from "@/components/ui/sidebar";
import { useChatContext } from "@/layout";
import { useNavigate, useParams } from "@solidjs/router";
import AssistantMessageRenderer from "../components/AssitantMessageRenderer";
import ChatInput from "../components/ChatInput";
import MessageItem from "../components/ChatMessageItem";
import {  MessageCache } from "../utils/memory_cache";

import { convertToChatMessages, HOST } from "../utils/utils";

// Component to render user message content

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
  const { chats, setChats } = useChatContext();
  const navigate = useNavigate();
  // Track scroll positions for each conversation
  const [scrollPositions, setScrollPositions] = createSignal<
    Record<string, number>
  >({});

  // Reference to the chat container
  let chatContainerRef: HTMLDivElement | undefined;

  // Memoize the messages to prevent unnecessary re-renders
  const memoizedMessages = createMemo(() => messages());

  // Scroll to bottom with smooth animation (for new messages)
  function scrollToBottom() {
    const lastMessage = document.getElementById("last-message");
    if (lastMessage) {
      lastMessage.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }
  }

  // Instant scroll to bottom without animation (for chat switching)
  function instantScrollToBottom() {
    const lastMessage = document.getElementById("last-message");
    if (lastMessage) {
      lastMessage.scrollIntoView({
        behavior: "auto",
        block: "end",
      });
    }
  }

  // Save the current scroll position
  function saveScrollPosition() {
    if (chatContainerRef && conversationId()) {
      const newScrollPositions = { ...scrollPositions() };
      newScrollPositions[conversationId()] = chatContainerRef.scrollTop;
      setScrollPositions(newScrollPositions);
    }
  }

  onMount(async () => {
    if (id()) {
      setConversationId(id());
      await fetchMessageHistory(id());
    } else {
      setMessages([]);
      setConversationId(crypto.randomUUID().toString());
      await fetchMessageHistory(conversationId());
      //I want to remove the padding from last message when were navigating to old conversation
      const lastMessage = document.getElementById("last-message");
      if (lastMessage) {
        lastMessage.style.paddingBottom = "1rem";
      }
    }
    instantScrollToBottom();
    Prism.highlightAll();
  });

  createEffect(() => {
    if (messages().length > 0) {
      Prism.highlightAll();
    }
  });

  //if ID changes normally from navigatig to old conversation
  createEffect(async () => {
    const currentId = id();
    if (currentId !== conversationId()) {
      if (currentId) {
        setMessages([]);
        setConversationId(currentId);
        await fetchMessageHistory(currentId);
        //I want to remove the padding from last message when were navigating to old conversation
        const lastMessage = document.getElementById("last-message");
        if (lastMessage) {
          lastMessage.style.paddingBottom = "1rem";
        }
        instantScrollToBottom();
      }
    }
  });

  //if ID changes to undefined because new chat
  createEffect(() => {
    if (!id()) {
      setMessages([]);
      setConversationId(crypto.randomUUID().toString());
    }
  });

  const handleSubmit = async (content: string | ContentItem[]) => {
    if (gettingResponse()) return;
    setGettingResponse(true);
    const newMessage: Message = {
      role: "user",
      content: content,
    };
    // Get current messages and add the new user message
    const currentMessages = untrack(() => messages());
    const updatedMessages = [...currentMessages, newMessage];

    if (!id()) {
      window.history.replaceState({}, "", `/chat/${conversationId()}`);
      navigate(`/chat/${conversationId()}`);
      const newChats = [...chats()];
      newChats.push({
        id: conversationId(),
        title: "New Chat",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setChats(newChats);
    }

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
        setMessages(messages().slice(0, -1));
        alert(`Error sending message: ${response.statusText}`);
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
              // Ensure we're using the most up-to-date messages array that includes the user message
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
            setMessages([...currentMessageState]);
            MessageCache.set(conversationId(), [...currentMessageState]);

            // Scroll to bottom with a small delay to allow rendering
          } catch (e) {
            console.error("Error parsing JSON:", e);
          }
        }
      }

      // Update URL and fetch conversations for new conversations
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages(messages().slice(0, -1));
      alert(`Error sending message: ${error}`);
    } finally {
      setGettingResponse(false);
    }
  };

  const fetchMessageHistory = async (id: string = conversationId()) => {
    // Return early if id is empty
    if (!id) {
      setMessages([]);
      return;
    }
    
    try {
      const messagesFromCache = await MessageCache.get(id);
      // Check if messages have valid content
      if (Array.isArray(messagesFromCache)) {
        // Simple validation that won't unnecessarily modify the data
        const validMessages = messagesFromCache.filter(msg => 
          msg && typeof msg === 'object' && 'role' in msg && msg.content !== undefined
        );
        
        setMessages(validMessages);
      } else {
        console.error("Invalid messages format from cache, not an array:", messagesFromCache);
        setMessages([]);
      }
    } catch (error) {
      console.error("Error fetching message history:", error);
      setMessages([]);
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
    <div class="flex w-full h-full flex-col justify-start z-5 items-center bg-background dark:bg-background mt-3.5 rounded-lg ">
      <Show
        when={isListening()}
        fallback={
          <>
            <div
              ref={chatContainerRef}
              class={`flex flex-1 flex-col items-center overflow-y-auto Chat-Container scrollbar rounded-t-lg pl-2 pr-2 
              max-h-[calc(100vh)] 
              md:max-h-[calc(100vh)] 
              ${
                isMobile()
                  ? openMobile()
                    ? "w-full"
                    : "w-full"
                  : open()
                  ? "w-[calc(100vw-var(--sidebar-width))]"
                  : "w-full"
              }
              ${memoizedMessages().length === 0 ? "h-full" : ""}
              `}
              onScroll={() => saveScrollPosition()}
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
              <div id="messages-end-ref" />
            </div>

            <div class="border-t md:border md:rounded-lg md:shadow-md border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 w-full md:max-w-[900px] mb-3.5">
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
