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
  onCleanup,
} from "solid-js";
import Prism from "prismjs";
import "../styles/index.css";
import "../styles/prisma/prisma.css";
import "../styles/prisma-dark/prisma-dark.css";
// Import ImageData and PdfData for type guards
import { ContentItem, Message, ImageData, PdfData } from "../models/models";
import MicrophoneVisualizer from "../../components/MicrophoneVisualizer";
import { useSidebar } from "@/components/ui/sidebar";
import { useChatContext } from "@/layout";
import { useNavigate, useParams } from "@solidjs/router";
import AssistantMessageRenderer from "../components/AssitantMessageRenderer";
import ChatInput from "../components/ChatInput";
import MessageItem from "../components/ChatMessageItem";
import { MessageCache } from "../utils/memory_cache";
import { Skeleton } from "@/components/ui/skeleton";
import { convertToChatMessages, HOST } from "../utils/utils";
import ToolMessageRenderer, { ToolCallMap } from "../components/ToolMessageRenderer";
import NewChat from "../components/NewChat";

// Component to render user message content

function ChatWindow() {
  const { open, openMobile, isMobile } = useSidebar();
  const [gettingResponse, setGettingResponse] = createSignal<boolean>(false);
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [isListening, setIsListening] = createSignal<boolean>(false);
  const [loading, setLoading] = createSignal<boolean>(false);
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
  
  // Create a memoized map of tool_call_id to the tool_call message
  const toolCallMap = createMemo<ToolCallMap>(() => {
    const map: ToolCallMap = new Map();
    // Use memoizedMessages here for consistency
    for (const msg of memoizedMessages()) { 
      // Check role first, then check if content is an object (basic check)
      if (msg.role === 'tool_call' && typeof msg.content === 'object' && msg.content !== null) {
         // Use type assertion to access potential properties like tool_call_id
        const contentObj = msg.content as any; 
        if (contentObj.tool_call_id) { 
          // Ensure tool_call_id is treated as a string
          const toolCallId = String(contentObj.tool_call_id);
          // Validate the ID format before adding to the map
          if (toolCallId.startsWith('pyd_ai_')) { 
            map.set(toolCallId, msg);
          }
        }
      }
    }
    return map;
  });

  // Scroll to bottom with smooth animation (for new messages)
  function scrollToBottom() {
    const lastMessage = document.getElementById("last-message");
    if (lastMessage && chatContainerRef) {
      const containerRect = chatContainerRef.getBoundingClientRect();
      const elementRect = lastMessage.getBoundingClientRect();
      const offset = elementRect.top - containerRect.top;
      
      chatContainerRef.scrollTo({
        top: chatContainerRef.scrollTop + offset,
        behavior: "smooth"
      });
    }
  }

  // Instant scroll to bottom without animation (for chat switching)
  function instantScrollToBottom() {
    const lastMessage = document.getElementById("last-message");
    if (lastMessage && chatContainerRef) {
      const containerRect = chatContainerRef.getBoundingClientRect();
      const elementRect = lastMessage.getBoundingClientRect();
      const offset = elementRect.top - containerRect.top;
      
      chatContainerRef.scrollTop = chatContainerRef.scrollTop + offset;
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

     // Set up cache invalidation listenerAdd commentMore actions
     const cleanup = MessageCache.addInvalidationListener((invalidatedConversationId) => {
      const currentId = conversationId();
      if (currentId === invalidatedConversationId) {
        console.log(`Cache invalidated for current conversation ${currentId}, refetching messages`);
        // Refetch messages for the current conversation
        fetchMessageHistory(currentId);
      }
    });

    // Store cleanup function for later use
    const cleanupRef = { cleanup };
    
    // Clean up listener when component unmounts
    onCleanup(() => {
      cleanupRef.cleanup();
    });


    // Original onMount logic (as inferred from initial attempts)
    if (id()) {
      setConversationId(id());
      setLoading(true);
      await fetchMessageHistory(id());
      setLoading(false);
      instantScrollToBottom();
      Prism.highlightAll();
    } else {
      console.log("onMount: On new chat route (/chat)");
      setMessages([]);
      setConversationId(crypto.randomUUID().toString());
    }
  });

  createEffect(() => {
    if (messages().length > 0) {
      Prism.highlightAll();
    }
  });

  //if ID changes normally from navigating to old conversation
  createEffect(async () => {
    const currentId = id();
    // Original effect logic (as inferred from initial attempts)
    if (currentId && currentId !== conversationId()) {
        setMessages([]);
        setConversationId(currentId);
        const startTime = performance.now(); 

        setLoading(true);
        await fetchMessageHistory(currentId); 
        setLoading(false);

        const endTime = performance.now(); 
        const executionTime = endTime - startTime; 

        console.log(
          `fetchMessageHistory execution time: ${executionTime} milliseconds`
        );
        console.log(messages());

        instantScrollToBottom();
        Prism.highlightAll();
    }
  });

  //if ID changes to undefined because new chat button clicked
  createEffect(() => {
    if (!id()) {
      setMessages([]);
      setConversationId(crypto.randomUUID().toString());
    }
  });

  const handleSubmit = async (content: string | ContentItem[]) => {
    if (gettingResponse()) return;
    setGettingResponse(true);

    // If it's the first message in a new chat, update the URL and sidebar
    const isNewChat = !id();
    const currentConversationId = conversationId();

    if (isNewChat) {
      console.log("isNewChat", currentConversationId);
      console.log("currentConversationId", currentConversationId);
      console.log("id", id());
      navigate(`/chat/${currentConversationId}`, { replace: true }); 
      const newChats = [...chats()];
      newChats.unshift({
        id: currentConversationId,
        title: "New Chat",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setChats(newChats);
    }

    const newMessage: Message = {
      role: "user",
      content: content,
    };
    // Get current messages and add the new user message
    const currentMessages = untrack(() => messages());
    const updatedMessages = [...currentMessages, newMessage];

    setMessages(updatedMessages);
    // Delay scroll slightly to ensure DOM update
    queueMicrotask(scrollToBottom);

    const url = new URL(`${HOST}/api/v1/chats/chat`);

    // --- Start of moved-back logic ---
    // Map the internal ContentItem[] or string to the BackendChatContent[] structure
    let mappedContentForBackend: {
      content: string | { url: string; media_type: string; kind: string };
    }[];

    if (typeof content === "string") {
      mappedContentForBackend = [{ content: content }];
    } else {
      // Type guard for ImageData
      const isImageData = (c: any): c is ImageData =>
        typeof c === "object" && c !== null && c.kind === "image-url";
      // Type guard for PdfData
      const isPdfData = (c: any): c is PdfData =>
        typeof c === "object" && c !== null && c.kind === "pdf-file";

      mappedContentForBackend = content
        .map((item) => {
          if (typeof item.content === "string") {
            return { content: item.content };
          } else if (isImageData(item.content) && item.content.serverUrl) {
            return {
              content: {
                url: item.content.serverUrl,
                media_type: item.content.media_type,
                kind: "image-url",
              },
            };
          } else if (isPdfData(item.content) && item.content.serverUrl) {
            return {
              content: {
                url: item.content.serverUrl,
                media_type: item.content.media_type,
                kind: "document-url",
              },
            };
          } else {
            console.error("Encountered incomplete or unexpected content item:", item);
            return null;
          }
        })
        .filter((item) => item !== null) as {
        content: string | { url: string; media_type: string; kind: string };
      }[];
    }

    if (mappedContentForBackend.length === 0) {
      console.error("No valid content to send after mapping.");
      setGettingResponse(false);
      // Maybe remove optimistic message? setMessages(currentMessages);
      return;
    }

    const requestBody = {
      content: mappedContentForBackend,
    };
    url.searchParams.append("conversation_id", currentConversationId);
    // --- End of moved-back logic ---

    let seenPartStart = false;
    let seenPartDelta = false;

    try {
      abortControllerRef.current = false;
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
        setMessages(messages().slice(0, -1)); // Revert optimistic user message
        const errorText = await response.text();
        alert(`Error sending message: ${response.statusText} - ${errorText}`);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantMessageCreated = false;

      while (true) {
        console.log("one loop");
        if (abortControllerRef.current) {
          reader.cancel();
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        let currentMessageState = [...messages()];

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          try {
            const jsonString = line.slice(6);
            const data = JSON.parse(jsonString);
            let messagesChanged = false;

            if (!assistantMessageCreated && (data.type === "part_start" || data.type === "part_delta")) {
              const newAssistantMessage: Message = { role: "assistant", content: "", reasoning: "" };
              currentMessageState = [...currentMessageState, newAssistantMessage];
              assistantMessageCreated = true;
              messagesChanged = true;
            }

            const lastMessage = currentMessageState[currentMessageState.length - 1];

            if (data.type === "part_start" || data.type === "part_delta") {
              if (data.type === "part_start") seenPartStart = true;
              if (data.type === "part_delta") seenPartDelta = true;
              console.log("here");
              const part = data.data?.part || data.data?.delta;
              console.log("part", part);
              console.log("lastMessage role", lastMessage?.role);
              if (part && lastMessage?.role === "assistant") {
                 if (part.part_kind === "text" && typeof lastMessage.content === "string") {
                     lastMessage.content += part.content || "";
                     messagesChanged = true;
                 } else if (part.part_kind === "reasoning" && typeof lastMessage.reasoning === "string") {
                     lastMessage.reasoning += part.reasoning || "";
                     messagesChanged = true;
                 }
              }
            } else if (data.type === "tool_call" && data.data?.tool_call) {
               const newToolCallMessage: Message = { role: "tool_call", content: data.data.tool_call };
               currentMessageState.push(newToolCallMessage);
               assistantMessageCreated = false;
               messagesChanged = true;
            } else if (data.type === "tool_result" && data.data?.tool_result) {
              const newToolResultMessage: Message = { role: "tool_result", content: data.data.tool_result };
              currentMessageState.push(newToolResultMessage);
              messagesChanged = true;
            }


            //update message state
            if (messagesChanged) {
              console.log("setting messages", currentMessageState);
               setMessages([...currentMessageState]);
               MessageCache.set(currentConversationId, [...currentMessageState]);
            }

          } catch (e) {
            console.error("Error parsing JSON:", e, "Raw line:", line);
          }
        }
      }

      
    } catch (error) {
      console.error("Error sending message:", error);
      // Revert optimistic user message if it's still the last one
      setMessages(prev => {
          if (prev.length > 0 && prev[prev.length - 1] === newMessage) {
              return prev.slice(0, -1);
          }
          return prev;
      });
       if (!(error instanceof DOMException && error.name === 'AbortError') && !abortControllerRef.current) {
            alert(`Error sending message: ${error instanceof Error ? error.message : String(error)}`);
       }
    } finally {
      if (!abortControllerRef.current) {
        if (seenPartStart && !seenPartDelta) {
          let currentMessageState = [...messages()];
          const lastMessage = currentMessageState[currentMessageState.length - 1];
          lastMessage.content += " ";
          setMessages([...currentMessageState]);
          setTimeout(() => setGettingResponse(false), 200);
        } else {
          setGettingResponse(false);
        }
      }
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
        const validMessages = messagesFromCache.filter(
          (msg) =>
            msg &&
            typeof msg === "object" &&
            "role" in msg &&
            msg.content !== undefined
        );

        setMessages(validMessages);
      } else {
        // If cache is invalid or empty, set messages to empty array
        console.warn(
          "Invalid messages format from cache or cache empty:",
          messagesFromCache
        );
        setMessages([]);
      }
    } catch (error) {
      console.error("Error fetching message history:", error);
      setMessages([]); // Ensure messages are cleared on error
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
    <div class="flex w-full h-full flex-col justify-between z-5 bg-background dark:bg-background mt-3.5 rounded-lg ">
      {/* Main Content Area: Takes full width, allows vertical flex. NO CENTERING HERE. */}
      <div class="flex-1 w-full overflow-hidden flex flex-col">
        {/* Show existing chat content OR NewChat component in fallback */}
        <Show
          when={id()} // Only show existing chat history/loading/mic if ID exists
          fallback={ // Render NewChat centered using flexbox and margins
            <div class="flex-1 flex flex-col w-full md:max-w-[900px] mx-auto justify-center">
                <NewChat onPromptClick={handleSubmit} />
            </div>
          }
        >
          {/* Container for Existing Chat UI (Loading/Messages/Mic): Takes full width/height */} 
          <div class="w-full h-full flex flex-col flex-1">
            <Show
              when={!loading()}
              fallback={
                // Skeleton Loading UI: Centered with max-width
                <div class="w-full h-full flex flex-col gap-6 p-4 md:max-w-[900px] mx-auto">
                  <For each={[...Array(5)]}>
                    {(_, index) => (
                      <div
                        class={`flex gap-4 ${
                          index() % 2 === 0 ? "justify-start" : "justify-end"
                        }`}
                      >
                        {index() % 2 !== 0 && (
                          <div class="flex-1 space-y-2">
                            <Skeleton class="h-4 w-[200px] ml-auto" />
                            <Skeleton class="h-4 w-[350px] ml-auto" />
                          </div>
                        )}
                        <Skeleton class="h-10 w-10 rounded-full" />
                        {index() % 2 === 0 && (
                          <div class="flex-1 space-y-2">
                            <Skeleton class="h-4 w-[250px]" />
                            <Skeleton class="h-4 w-[400px]" />
                          </div>
                        )}
                      </div>
                    )}
                  </For>
                </div>
              }
            >
              {/* Show Messages or Microphone Visualizer */}
              <Show
                when={!isListening()} // Show chat messages when not listening
                fallback={
                  // Microphone Visualizer UI
                  <div class="flex-1 flex items-center justify-center">
                    <MicrophoneVisualizer
                      isListening={!isMuted()}
                      onClose={handleMicrophoneClose}
                      onMute={handleMicrophoneMute}
                    />
                  </div>
                }
              >
                {/* Chat messages container: Full width scrollable area, content centered with max-width */}
                <div
                  ref={chatContainerRef}
                  class={`flex-1 overflow-y-auto Chat-Container scrollbar rounded-t-lg w-full`}
                  onScroll={() => saveScrollPosition()}
                >
                  {/* Inner div for message content centering and padding - REMOVED PADDING */}
                  <div class="md:max-w-[900px] mx-auto pt-20">
                    <For each={memoizedMessages()}>
                      {(message, index) => (
                        <Show
                          when={
                            message.role === "user" || message.role === "assistant"
                          }
                          fallback={
                            <ToolMessageRenderer
                              message={message}
                              messages={messages}
                              index={index}
                              toolCallMap={toolCallMap}
                            />
                          }
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
                          <Show when={index() === memoizedMessages().length - 1 && message.role === "user" && gettingResponse()}>
                            <div class="pl-5">
                              <span class="loading-dots">
                                <span></span>
                                <span></span>
                                <span></span>
                              </span>
                            </div>
                          </Show>
                        </Show>
                      )}
                    </For>
                    <div id="last-message" class="h-1"></div> 
                  </div>
                </div>
              </Show>
            </Show>
          </div>
        </Show>
      </div>

      {/* Chat Input Area: Rendered below the main content area */}
      {/* Remove the relative container */}
      <Show when={!isListening()}>
          <div class="border-t md:border md:rounded-lg md:shadow-md border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 w-full md:max-w-[900px] mx-auto mb-3.5">
              <ChatInput
                  onSubmit={handleSubmit}
                  gettingResponse={gettingResponse()}
                  setIsListening={setIsListening}
                  handleStopRequest={handleStopRequest}
              />
          </div>
      </Show>
    </div>
  );
}

export default ChatWindow;