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
import ChatInput from "../components/ChatInput";
import MessageItem from "../components/ChatMessageItem";
import { MessageCache } from "../utils/memory_cache";
import { Skeleton } from "@/components/ui/skeleton";
import { convertToChatMessages, HOST } from "../utils/utils";
import ToolMessageRenderer, { ToolCallMap } from "../components/ToolMessageRenderer";
import NewChat from "../components/NewChat";

// Component to render user message content

function ChatWindow() {
  // Lightweight streaming debug logger. Enable with: localStorage.setItem('debug_stream','1')
  const DEBUG_STREAM = typeof window !== 'undefined' && localStorage.getItem('debug_stream') === '1'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const debug = (...args: any[]) => {
    if (DEBUG_STREAM) {
      // eslint-disable-next-line no-console
      console.log('[chat-stream]', ...args)
    }
  }
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
  const [showScrollToBottom, setShowScrollToBottom] = createSignal<boolean>(false);
  const [scrollBtnLeft, setScrollBtnLeft] = createSignal<number | undefined>(undefined);
  // WebSocket management for bidirectional, resumable sessions
  let ws: WebSocket | null = null;
  let shouldReconnect = true;
  let reconnectTimeout: number | undefined;
  const { chats, setChats } = useChatContext();
  const navigate = useNavigate();
  // Track scroll positions for each conversation
  const [scrollPositions, setScrollPositions] = createSignal<
    Record<string, number>
  >({});

  // Reference to the chat container
  let chatContainerRef: HTMLDivElement | undefined;
  // Reference to input container to position the floating button above it
  let inputContainerRef: HTMLDivElement | undefined;

  // Memoize the messages to prevent unnecessary re-renders
  const memoizedMessages = createMemo(() => messages());
  // Track the index of the last user message for scrolling
  const lastUserIndex = createMemo(() => {
    const arr = memoizedMessages();
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i]?.role === "user") return i;
    }
    return -1;
  });
  
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
    // Prefer last user message if present; else fall back to last message sentinel
    const lastUser = document.getElementById("last-user-message");
    const target = lastUser || document.getElementById("last-message");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // Instant scroll to bottom without animation (for chat switching)
  function instantScrollToBottom() {
    const lastUser = document.getElementById("last-user-message");
    const target = lastUser || document.getElementById("last-message");
    if (target) {
      target.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }

  // Scroll chat container to absolute bottom
  function scrollContainerToBottom() {
    if (!chatContainerRef) return;
    // Instant jump to bottom
    chatContainerRef.scrollTop = chatContainerRef.scrollHeight;
    // Hide button immediately
    setShowScrollToBottom(false);
  }

  // Save the current scroll position
  function saveScrollPosition() {
    if (chatContainerRef && conversationId()) {
      const newScrollPositions = { ...scrollPositions() };
      newScrollPositions[conversationId()] = chatContainerRef.scrollTop;
      setScrollPositions(newScrollPositions);
    }
  }

  // Update visibility of the "Scroll to bottom" button based on position
  function updateScrollBottomVisibility() {
    if (!chatContainerRef) return;
    const distanceFromBottom =
      chatContainerRef.scrollHeight - chatContainerRef.scrollTop - chatContainerRef.clientHeight;
    setShowScrollToBottom(distanceFromBottom > 120);
    // Also keep the button horizontally centered to the chat body
    updateScrollButtonPosition();
  }

  function updateScrollButtonPosition() {
    try {
      const rect = inputContainerRef?.getBoundingClientRect();
      if (rect) {
        setScrollBtnLeft(rect.left + rect.width / 2);
      }
    } catch {}
  }

  onMount(async () => {
    // initialize scroll button visibility on mount
    queueMicrotask(() => updateScrollBottomVisibility());
    // Recompute on window resize
    const onResize = () => updateScrollButtonPosition();
    window.addEventListener('resize', onResize);

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
      try { window.removeEventListener('resize', onResize); } catch {}
    });


    // Subscribe to any running conversations via multiplexed WS so the stop button restores after reload
    try {
      const { authFetch } = await import("@/lib/utils");
      const runningResp = await authFetch(`${HOST}/api/v1/chats/running`);
      if (runningResp.ok) {
        const { running } = await runningResp.json();
        if (Array.isArray(running) && running.length > 0) {
          const wsUrlBase = HOST.startsWith("https") ? HOST.replace("https", "wss") : HOST.replace("http", "ws");
          const wsUrl = `${wsUrlBase}/api/v1/chats/ws-all?conversation_ids=${encodeURIComponent(running.join(","))}`;
          const mux = new WebSocket(wsUrl);
          mux.onmessage = (evt) => {
            try {
              const data = JSON.parse(evt.data);
              // Only toggle UI state for the active conversation view
              if (data?.conversation_id === conversationId()) {
                if (data?.type === "part_start" || data?.type === "part_delta") {
                  setGettingResponse(true);
                } else if (data?.type === "done" || data?.type === "stopped") {
                  setGettingResponse(false);
                }
              }
            } catch {}
          };
          // Best-effort, don't persist this connection reference
        }
      }
    } catch {}

    // Original onMount logic (as inferred from initial attempts)
    if (id()) {
      setConversationId(id());
      setLoading(true);
      await fetchMessageHistory(id());
      setLoading(false);
      instantScrollToBottom();
      Prism.highlightAll();
      // Verify and sync with server state after initial load
      import("../utils/memory_cache").then(({ DB }) => DB.verifyAndSync(id()!));
    } else {
      console.log("onMount: On new chat route (/chat)");
      setMessages([]);
      setConversationId(crypto.randomUUID().toString());
    }
  });

  onCleanup(() => {
    shouldReconnect = false;
    if (reconnectTimeout !== undefined) {
      clearTimeout(reconnectTimeout);
    }
    try {
      ws?.close();
    } catch {}
    ws = null;
  });

  createEffect(() => {
    if (messages().length > 0) {
      Prism.highlightAll();
    }
    // update scroll button visibility when content changes
    queueMicrotask(() => updateScrollBottomVisibility());
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
        // Verify and sync on navigation
        import("../utils/memory_cache").then(({ DB }) => DB.verifyAndSync(currentId));
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
    // Optimistic assistant placeholder so typing dots appear immediately
    const assistantPlaceholder: Message = { role: "assistant", content: "", reasoning: "" };
    const withAssistantPlaceholder = [...updatedMessages, assistantPlaceholder];
    setMessages(withAssistantPlaceholder);
    MessageCache.set(currentConversationId, withAssistantPlaceholder);
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

    // Revert: apply deltas immediately without rAF batching

    // Shared handler for incoming event JSON strings (WS)
    const handleEventJsonString = (jsonString: string) => {
      debug('ws:message', jsonString.slice(0, 180))
      try {
        const data = JSON.parse(jsonString);
        debug('event', data?.type, { cid: data?.conversation_id })
        let messagesChanged = false;
        let currentMessageState = [...messages()];
        let assistantMessageCreated =
          currentMessageState.length > 0 && currentMessageState[currentMessageState.length - 1]?.role === "assistant";

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
          const part = data.data?.part || data.data?.delta;
          if (part && lastMessage?.role === "assistant") {
            const updated = { ...lastMessage } as Message;
            if (part.part_kind === "text" && typeof lastMessage.content === "string") {
              const newContent = (lastMessage.content as string) + (part.content || "");
              updated.content = newContent;
              debug('text_delta', { addLen: (part.content || '').length, totalLen: newContent.length })
              messagesChanged = true;
            }
            if (part.part_kind === "reasoning") {
              const prevReasoning = typeof lastMessage.reasoning === "string" ? lastMessage.reasoning : "";
              updated.reasoning = prevReasoning + (part.reasoning || "");
              debug('reasoning_delta', { addLen: (part.reasoning || '').length, totalLen: updated.reasoning.length })
              messagesChanged = true;
            }
            if (messagesChanged) {
              currentMessageState[currentMessageState.length - 1] = updated;
            }
          }
        } else if (data.type === "tool_call" && data.data?.tool_call) {
          debug('tool_call', Object.keys(data.data.tool_call ?? {}))
          const newToolCallMessage: Message = { role: "tool_call", content: data.data.tool_call };
          currentMessageState.push(newToolCallMessage);
          messagesChanged = true;
        } else if (data.type === "tool_result" && data.data?.tool_result) {
          debug('tool_result', typeof data.data.tool_result)
          const newToolResultMessage: Message = { role: "tool_result", content: data.data.tool_result };
          currentMessageState.push(newToolResultMessage);
          messagesChanged = true;
        }

        if (messagesChanged) {
          setMessages([...currentMessageState]);
          MessageCache.set(currentConversationId, [...currentMessageState]);
        }
      } catch (e) {
        console.error("Error parsing WS JSON:", e, jsonString);
      }
    };

    // Ensure WebSocket connection for this conversation
    const ensureWebSocket = () => {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
      try {
        const wsUrlBase = HOST.startsWith("https") ? HOST.replace("https", "wss") : HOST.replace("http", "ws");
        const wsUrl = `${wsUrlBase}/api/v1/chats/ws?conversation_id=${currentConversationId}`;
        debug('ws:connect', wsUrl)
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          debug('ws:open')
          // connected
        };
        ws.onmessage = (evt) => {
          handleEventJsonString(evt.data);
          try {
            const parsed = JSON.parse(evt.data);
            if (parsed?.type === "done" || parsed?.type === "stopped") {
              setGettingResponse(false);
              debug('ws:done')
            }
          } catch {}
        };
        ws.onclose = (ev) => {
          debug('ws:close', { code: ev.code, reason: ev.reason })
          if (shouldReconnect) {
            // attempt reconnect after short delay
            reconnectTimeout = window.setTimeout(() => ensureWebSocket(), 1500);
          }
        };
        ws.onerror = (err) => {
          debug('ws:error', err)
          try { ws?.close(); } catch {}
        };
      } catch (e) {
        console.error("WS connect error", e);
      }
    };

    try {
      abortControllerRef.current = false;
      const { authFetch } = await import("@/lib/utils");

      debug('http:chat', url.toString(), requestBody)
      const response = await authFetch(url.toString(), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        setMessages(messages().slice(0, -1));
        const errorText = await response.text();
        alert(`Error sending message: ${response.statusText} - ${errorText}`);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      // Start or resume WS stream without holding the HTTP stream open
      ensureWebSocket();
    } catch (error) {
      console.error("Error sending message:", error);
      // Revert optimistic messages (user + assistant placeholder) if present
      setMessages(prev => {
          if (
            prev.length >= 2 &&
            prev[prev.length - 2] === newMessage &&
            prev[prev.length - 1]?.role === "assistant" &&
            typeof prev[prev.length - 1]?.content === "string" &&
            (prev[prev.length - 1]?.content as string) === ""
          ) {
            return prev.slice(0, -2);
          }
          if (prev.length > 0 && prev[prev.length - 1] === newMessage) {
            return prev.slice(0, -1);
          }
          return prev;
      });
       if (!(error instanceof DOMException && error.name === 'AbortError') && !abortControllerRef.current) {
            alert(`Error sending message: ${error instanceof Error ? error.message : String(error)}`);
       }
    } finally {
      // Keep gettingResponse true; it will flip false on WS 'done'/'stopped' events
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

  const handleStopRequest = async () => {
    abortControllerRef.current = true;
    try {
      const { authFetch } = await import("@/lib/utils");
      const url = new URL(`${HOST}/api/v1/chats/chat/stop`);
      url.searchParams.append("conversation_id", conversationId());
      await authFetch(url.toString(), { method: "POST" });
    } catch (e) {
      console.error("Failed to stop chat:", e);
    } finally {
      setGettingResponse(false);
    }
  };

  return (
    <div class="flex w-full h-full flex-col justify-between z-5 bg-background rounded-lg">
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
                  class={`flex-1 overflow-y-auto overscroll-contain Chat-Container scrollbar rounded-t-lg w-full`}
                  onScroll={() => { saveScrollPosition(); updateScrollBottomVisibility(); }}
                >

                  {/* Inner div for message content centering and padding - REMOVED PADDING  md:max-w-[900px] mx-auto pt-20*/}
                  <div class="mx-auto flex w-full max-w-3xl flex-col space-y-12 px-4 pb-10 pt-safe-offset-10 ">
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
                            isLastUser={index() === lastUserIndex()}
                          />
                        </Show>
                      )}
                    </For>
                    <Show
                      when={
                        gettingResponse() &&
                        memoizedMessages().length > 0 &&
                        memoizedMessages()[memoizedMessages().length - 1].role === "user"
                      }
                    >
                      <div class="pl-5 pt-2">
                        <span class="loading-dots">
                          <span></span>
                          <span></span>
                          <span></span>
                        </span>
                      </div>
                    </Show>
                    <div id="last-message" class="h-1"></div> 
                  </div>
                </div>
                {/* Floating Scroll to bottom button (positioned above input bar, centered to chat body) */}
                <Show when={showScrollToBottom()}>
                  <div
                    class="fixed z-[1050]"
                    style={{ bottom: `${((inputContainerRef?.offsetHeight ?? 84) + 12)}px`, left: `${scrollBtnLeft() ?? window.innerWidth / 2}px`, transform: 'translateX(-50%)' }}
                  >
                    <button
                      type="button"
                      class="px-3 py-1.5 rounded-full bg-card/70 backdrop-blur border border-border/60 shadow-sm text-xs text-foreground hover:bg-card/90 transition-colors flex items-center gap-1.5"
                      onClick={() => scrollContainerToBottom()}
                    >
                      <span>Scroll to bottom</span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="opacity-80">
                        <path d="M12 16a1 1 0 0 1-.707-.293l-6-6a1 1 0 1 1 1.414-1.414L12 13.586l5.293-5.293a1 1 0 0 1 1.414 1.414l-6 6A1 1 0 0 1 12 16z"/>
                      </svg>
                    </button>
                  </div>
                </Show>
              </Show>
            </Show>
          </div>
        </Show>
      </div>

      {/* Chat Input Area: Rendered below the main content area */}
      <Show when={!isListening()}>
        <div class="w-full md:max-w-[760px] mx-auto" ref={inputContainerRef}>
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