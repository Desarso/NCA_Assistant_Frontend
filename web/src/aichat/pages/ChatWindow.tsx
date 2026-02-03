import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Prism from "prismjs";
import "../styles/index.css";
import "../styles/prisma/prisma.css";
import "../styles/prisma-dark/prisma-dark.css";
// Import ImageData and PdfData for type guards
import { ContentItem, Message, ImageData, PdfData } from "../models/models";
import { useSidebar } from "@/components/ui/sidebar";
import { useChatContext } from "@/layout";
import { useNavigate, useParams } from "react-router-dom";
import ChatInput from "../components/ChatInput";
import MessageItem from "../components/ChatMessageItem";
import { MessageCache } from "../utils/memory_cache";
import { Skeleton } from "@/components/ui/skeleton";
import { convertToChatMessages, HOST } from "../utils/utils";
import { createWSManager } from "../utils/ws";
import ToolMessageRenderer, { ToolCallMap } from "../components/ToolMessageRenderer";
import NewChat from "../components/NewChat";
import { processFrontendTool, isFrontendTool } from "../utils/frontend_tools";
import { handleFrontendToolPromptMessage } from "../utils/frontend_tool_prompts";

// Component to render user message content

const wsManager = createWSManager(HOST);

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
  const [gettingResponse, setGettingResponse] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const params = useParams();
  const id = params.id;
  const [conversationId, setConversationId] = useState<string>(
    id || crypto.randomUUID().toString()
  );
  const abortControllerRef = useRef(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState<boolean>(false);
  const [scrollBtnLeft, setScrollBtnLeft] = useState<number | undefined>(undefined);
  // Single multiplexed WebSocket via wsManager; per-conversation subscription only
  const unsubscribeWSRef = useRef<(() => void) | null>(null);
  const lastActivityAtRef = useRef(0);
  const { chats, setChats } = useChatContext();
  const navigate = useNavigate();
  // Track scroll positions for each conversation
  const [scrollPositions, setScrollPositions] = useState<
    Record<string, number>
  >({});

  // Reference to the chat container
  const chatContainerRef = useRef<HTMLDivElement>(null);
  // Reference to input container to position the floating button above it
  const inputContainerRef = useRef<HTMLDivElement>(null);

  // Memoize the messages to prevent unnecessary re-renders
  const memoizedMessages = useMemo(() => messages, [messages]);
  // Track the index of the last user message for scrolling
  const lastUserIndex = useMemo(() => {
    const arr = memoizedMessages;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i]?.role === "user") return i;
    }
    return -1;
  }, [memoizedMessages]);
  
  // Create a memoized map of tool_call_id to the tool_call message
  const toolCallMap = useMemo<ToolCallMap>(() => {
    const map: ToolCallMap = new Map();
    // Use memoizedMessages here for consistency
    for (const msg of memoizedMessages) { 
      // Check role first, then check if content is an object (basic check)
      if (msg.role === 'tool_call' && typeof msg.content === 'object' && msg.content !== null) {
         // Use type assertion to access potential properties like tool_call_id
        const contentObj = msg.content as any; 
        if (contentObj.tool_call_id) { 
          // Ensure tool_call_id is treated as a string
          const toolCallId = String(contentObj.tool_call_id);
          // Add any valid tool_call_id to the map
          if (toolCallId && toolCallId.length > 0) { 
            map.set(toolCallId, msg);
          }
        }
      }
    }
    return map;
  }, [memoizedMessages]);

  // Scroll to bottom with smooth animation (for new messages)
  const scrollToBottom = useCallback(() => {
    // Prefer last user message if present; else fall back to last message sentinel
    const lastUser = document.getElementById("last-user-message");
    const target = lastUser || document.getElementById("last-message");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // Instant scroll to bottom without animation (for chat switching)
  const instantScrollToBottom = useCallback(() => {
    const lastUser = document.getElementById("last-user-message");
    const target = lastUser || document.getElementById("last-message");
    if (target) {
      target.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }, []);

  // Scroll chat container to absolute bottom
  const scrollContainerToBottom = useCallback(() => {
    if (!chatContainerRef.current) return;
    // Instant jump to bottom
    chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    // Hide button immediately
    setShowScrollToBottom(false);
  }, []);

  // Verify conversation state only if it already exists server-side
  const verifyIfExists = useCallback(async (cid: string) => {
    try {
      const { authFetch } = await import("@/lib/utils");
      const resp = await authFetch(`${HOST}/api/v1/chats/conversations/${cid}`);
      if (resp.ok) {
        // TODO: Implement verifyAndSync in memory_cache.ts
        // import("../utils/memory_cache").then(({ DB }) => DB.verifyAndSync(cid));
      }
    } catch {
      // ignore 404/Network here; conversation may not be created yet
    }
  }, []);

  // Save the current scroll position
  const saveScrollPosition = useCallback(() => {
    if (chatContainerRef.current && conversationId) {
      const newScrollPositions = { ...scrollPositions };
      newScrollPositions[conversationId] = chatContainerRef.current.scrollTop;
      setScrollPositions(newScrollPositions);
    }
  }, [conversationId, scrollPositions]);

  // Update visibility of the "Scroll to bottom" button based on position
  const updateScrollBottomVisibility = useCallback(() => {
    if (!chatContainerRef.current) return;
    const distanceFromBottom =
      chatContainerRef.current.scrollHeight - chatContainerRef.current.scrollTop - chatContainerRef.current.clientHeight;
    setShowScrollToBottom(distanceFromBottom > 120);
    // Also keep the button horizontally centered to the chat body
    updateScrollButtonPosition();
  }, []);

  const updateScrollButtonPosition = useCallback(() => {
    try {
      const rect = inputContainerRef.current?.getBoundingClientRect();
      if (rect) {
        setScrollBtnLeft(rect.left + rect.width / 2);
      }
    } catch {}
  }, []);

  const fetchMessageHistory = useCallback(async (id: string = conversationId) => {
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
  }, [conversationId]);

  useEffect(() => {
    // initialize scroll button visibility on mount
    queueMicrotask(() => updateScrollBottomVisibility());
    // Recompute on window resize
    const onResize = () => updateScrollButtonPosition();
    window.addEventListener('resize', onResize);

     // Set up cache invalidation listener
     const cleanup = MessageCache.addInvalidationListener((invalidatedConversationId) => {
      const currentId = conversationId;
      if (currentId === invalidatedConversationId) {
        console.log(`Cache invalidated for current conversation ${currentId}, refetching messages`);
        // Refetch messages for the current conversation
        fetchMessageHistory(currentId);
      }
    });

    // Original onMount logic
    const initializeChat = async () => {
      if (id) {
        setConversationId(id);
        setLoading(true);
        await fetchMessageHistory(id);
        setLoading(false);
        instantScrollToBottom();
        Prism.highlightAll();
        // Verify only if conversation already exists (avoid 404 on brand new chats)
        verifyIfExists(id);
      } else {
        console.log("onMount: On new chat route (/chat)");
        setMessages([]);
        setConversationId(crypto.randomUUID().toString());
      }
    };

    initializeChat();

    // Clean up listener when component unmounts
    return () => {
      cleanup();
      try { window.removeEventListener('resize', onResize); } catch {}
    };
  }, []); // Empty deps - only run on mount

  useEffect(() => {
    // Cleanup WebSocket subscription on unmount
    return () => {
      if (unsubscribeWSRef.current) {
        try { unsubscribeWSRef.current(); } catch {}
        unsubscribeWSRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      Prism.highlightAll();
    }
    // update scroll button visibility when content changes
    queueMicrotask(() => updateScrollBottomVisibility());
  }, [messages, updateScrollBottomVisibility]);

  //if ID changes normally from navigating to old conversation
  useEffect(() => {
    const handleIdChange = async () => {
      const currentId = id;
      // Original effect logic
      if (currentId && currentId !== conversationId) {
          // Reset active state when switching chats
          setGettingResponse(false);
          setMessages([]);
          setConversationId(currentId);
          // Drop any existing subscription; do not auto-subscribe unless active
          if (unsubscribeWSRef.current) { 
            try { unsubscribeWSRef.current(); } catch {} 
            unsubscribeWSRef.current = null; 
          }
          const startTime = performance.now(); 

          setLoading(true);
          await fetchMessageHistory(currentId); 
          setLoading(false);

          const endTime = performance.now(); 
          const executionTime = endTime - startTime; 

          console.log(
            `fetchMessageHistory execution time: ${executionTime} milliseconds`
          );

          instantScrollToBottom();
          Prism.highlightAll();
          // Verify only if conversation already exists (avoid 404 on brand new chats)
          verifyIfExists(currentId);
      }
    };
    handleIdChange();
  }, [id, conversationId, fetchMessageHistory, instantScrollToBottom, verifyIfExists]);

  //if ID changes to undefined because new chat button clicked
  useEffect(() => {
    if (!id) {
      // Ensure no active indicator leaks into new chat view
      setGettingResponse(false);
      setMessages([]);
      const newId = crypto.randomUUID().toString();
      setConversationId(newId);
      // Do not subscribe for a new chat until a request starts
      if (unsubscribeWSRef.current) { 
        try { unsubscribeWSRef.current(); } catch {} 
        unsubscribeWSRef.current = null; 
      }
    }
  }, [id]);

  const handleSubmit = async (content: string | ContentItem[]) => {
    if (gettingResponse) return;
    setGettingResponse(true);

    // If it's the first message in a new chat, update the URL and sidebar
    const isNewChat = !id;
    const currentConversationId = conversationId;

    if (isNewChat) {
      console.log("isNewChat", currentConversationId);
      console.log("currentConversationId", currentConversationId);
      console.log("id", id);
      navigate(`/chat/${currentConversationId}`, { replace: true }); 
      const newChats = [...chats];
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
    const currentMessages = [...messages];
    const updatedMessages = [...currentMessages, newMessage];

    setMessages(updatedMessages);
    // Optimistic assistant placeholder so typing dots appear immediately
    const assistantPlaceholder: Message = { role: "assistant", content: "", reasoning: "" };
    const withAssistantPlaceholder = [...updatedMessages, assistantPlaceholder];
    setMessages(withAssistantPlaceholder);
    MessageCache.set(currentConversationId, withAssistantPlaceholder);
    // Delay scroll slightly to ensure DOM update
    queueMicrotask(scrollToBottom);

    // Map content to the backend format (Gemini API structure)
    const parts: Array<{ text?: string; inline_data?: any; image_data?: any; file_data?: any }> = [];

    if (typeof content === "string") {
      parts.push({ text: content });
    } else {
      // Type guard for ImageData
      const isImageData = (c: any): c is ImageData =>
        typeof c === "object" && c !== null && c.kind === "image-url";
      // Type guard for PdfData
      const isPdfData = (c: any): c is PdfData =>
        typeof c === "object" && c !== null && c.kind === "pdf-file";

      for (const item of content) {
        if (typeof item.content === "string") {
          parts.push({ text: item.content });
        } else if (isImageData(item.content) && item.content.serverUrl) {
          parts.push({
            image_data: {
              mimeType: item.content.media_type,
              fileUrl: item.content.serverUrl,
            }
          });
        } else if (isPdfData(item.content) && item.content.serverUrl) {
          parts.push({
            file_data: {
              mimeType: item.content.media_type,
              fileUrl: item.content.serverUrl,
            }
          });
        } else {
          console.error("Encountered incomplete or unexpected content item:", item);
        }
      }
    }

    if (parts.length === 0) {
      console.error("No valid content to send after mapping.");
      setGettingResponse(false);
      return;
    }

    // WebSocket event handler for streaming responses
    const handleWebSocketEvent = (data: any) => {
      debug('ws:event', data?.type || 'raw_parts');
      
      // Track activity
      lastActivityAtRef.current = Date.now();
      
      // Handle frontend tool prompts (tool-specific messages, not chat content)
      if (data.type === "frontend_tool_prompt") {
        handleFrontendToolPromptMessage(data, (payload) => {
          wsManager.send(currentConversationId, payload);
        });
        return; // Don't process as chat message
      }
      
      // Handle terminal events
      if (data.type === "done" || data.type === "stopped" || data.type === "error") {
        debug('ws:terminal', data.type);
        setGettingResponse(false);
        if (data.type === "error") {
          console.error("WebSocket error:", data.error || data.message);
        }
        // Backend closes connection after done - clean up
        if (unsubscribeWSRef.current) {
          try { unsubscribeWSRef.current(); } catch {}
          unsubscribeWSRef.current = null;
        }
        return;
      }

      // Handle structured tool_result messages
      if (data.type === "tool_result") {
        // Process frontend tools (Browser_Alert, Browser_Prompt, etc.) if applicable
        if (data.function_name && data.result && isFrontendTool(data.function_name)) {
          // Create a callback to send user responses back to the AI
          const sendResponseMessage = (message: string) => {
            if (message && !gettingResponse) {
              handleSubmit(message);
            }
          };
          
          processFrontendTool(data.function_name, data.result, sendResponseMessage);
        }
        
        setMessages(prevMessages => {
          const currentMessageState = [...prevMessages];
          
          // Try to find the matching tool_call and update its ID if it was temporary
          const toolCallIndex = currentMessageState.findIndex(
            msg => msg.role === "tool_call" && 
                   typeof msg.content === "object" &&
                   (msg.content as any).name === data.function_name &&
                   (msg.content as any).tool_call_id?.startsWith('temp_')
          );
          
          console.log('[TOOL_RESULT]', data.function_name, 'realId:', data.function_id, 'foundTempCallAt:', toolCallIndex);
          
          if (toolCallIndex !== -1) {
            // Update the temporary ID with the real one
            const oldId = (currentMessageState[toolCallIndex].content as any).tool_call_id;
            const updatedToolCall = { ...currentMessageState[toolCallIndex] };
            (updatedToolCall.content as any).tool_call_id = data.function_id;
            currentMessageState[toolCallIndex] = updatedToolCall;
            console.log('[ID_UPDATE]', data.function_name, 'from:', oldId, 'to:', data.function_id);
            debug('updated_tool_call_id', data.function_name, data.function_id);
          } else {
            console.warn('[NO_MATCH]', 'Could not find tool_call to update for', data.function_name);
          }
          
          const newToolResultMessage: Message = {
            role: "tool_result",
            content: {
              tool_call_id: data.function_id,
              name: data.function_name,
              content: data.result || data.result_json,
            }
          };
          currentMessageState.push(newToolResultMessage);
          debug('tool_result', data.function_name, 'id:', data.function_id);
          MessageCache.set(currentConversationId, [...currentMessageState]);
          return currentMessageState;
        });
        return;
      }

      // Handle raw parts format from backend (Gemini format)
      if (data.parts && Array.isArray(data.parts)) {
        setMessages(prevMessages => {
          let currentMessageState = [...prevMessages];
          let lastMessage = currentMessageState[currentMessageState.length - 1];
          
          // Ensure we have an assistant message
          if (!lastMessage || lastMessage.role !== "assistant") {
            const newAssistantMessage: Message = { role: "assistant", content: "", reasoning: "" };
            currentMessageState = [...currentMessageState, newAssistantMessage];
            lastMessage = newAssistantMessage;
          }
          
          // Process each part
          for (const part of data.parts) {
            if (part.text && typeof lastMessage.content === "string") {
              const updated = { ...lastMessage } as Message;
              updated.content = (lastMessage.content as string) + part.text;
              currentMessageState[currentMessageState.length - 1] = updated;
              lastMessage = updated;
              debug('raw_text', { addLen: part.text.length, totalLen: updated.content.length });
            }
            
            // Handle function calls in raw format
            if (part.functionCall) {
              // Generate a temporary ID if backend doesn't provide one yet
              const hasId = part.functionCall.id && part.functionCall.id.length > 0;
              const toolCallId = hasId ? part.functionCall.id : `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              const newToolCallMessage: Message = {
                role: "tool_call",
                content: {
                  tool_call_id: toolCallId,
                  name: part.functionCall.name,
                  args: part.functionCall.args,
                }
              };
              currentMessageState.push(newToolCallMessage);
              console.log('[TOOL_CALL]', part.functionCall.name, 'hasBackendId:', hasId, 'id:', toolCallId);
              debug('raw_tool_call', part.functionCall.name, 'id:', toolCallId);
            }
          }
          
          MessageCache.set(currentConversationId, [...currentMessageState]);
          return currentMessageState;
        });
        return;
      }

      // Handle structured event format (for backwards compatibility)
      setMessages(prevMessages => {
        let currentMessageState = [...prevMessages];
        let messagesChanged = false;
        
        let lastMessage = currentMessageState[currentMessageState.length - 1];
        const isAssistantMessage = lastMessage?.role === "assistant";

        if (!isAssistantMessage && (data.type === "part_start" || data.type === "part_delta" || data.type === "content_chunk")) {
          const newAssistantMessage: Message = { role: "assistant", content: "", reasoning: "" };
          currentMessageState = [...currentMessageState, newAssistantMessage];
          lastMessage = newAssistantMessage;
          messagesChanged = true;
        }

        if (data.type === "part_start" || data.type === "part_delta") {
          const part = data.data?.part || data.data?.delta;
          if (part && lastMessage?.role === "assistant") {
            const updated = { ...lastMessage } as Message;
            
            if (part.part_kind === "text" && typeof lastMessage.content === "string") {
              const newContent = (lastMessage.content as string) + (part.content || "");
              updated.content = newContent;
              debug('text_delta', { addLen: (part.content || '').length, totalLen: newContent.length });
              messagesChanged = true;
            }
            
            if (part.part_kind === "reasoning") {
              const deltaText = typeof (part as any).reasoning === 'string' && (part as any).reasoning !== ''
                ? (part as any).reasoning
                : (typeof (part as any).content === 'string' ? (part as any).content : '');
              if (deltaText) {
                const prevReasoning = typeof lastMessage.reasoning === "string" ? lastMessage.reasoning : "";
                updated.reasoning = prevReasoning + deltaText;
                debug('reasoning_delta', { addLen: deltaText.length, totalLen: updated.reasoning.length });
                messagesChanged = true;
              }
            }
            
            if (messagesChanged) {
              currentMessageState[currentMessageState.length - 1] = updated;
            }
          }
        } 
        else if (data.type === "content_chunk" && data.data) {
          if (lastMessage?.role === "assistant" && typeof lastMessage.content === "string") {
            const updated = { ...lastMessage } as Message;
            const newContent = (lastMessage.content as string) + data.data;
            updated.content = newContent;
            debug('content_chunk', { addLen: data.data.length, totalLen: newContent.length });
            currentMessageState[currentMessageState.length - 1] = updated;
            messagesChanged = true;
          }
        }
        else if (data.type === "tool_call" && data.data?.tool_call) {
          debug('tool_call', Object.keys(data.data.tool_call ?? {}));
          const newToolCallMessage: Message = { role: "tool_call", content: data.data.tool_call };
          currentMessageState.push(newToolCallMessage);
          messagesChanged = true;
        }
        else if (data.type === "tool_result" && data.data?.tool_result) {
          debug('tool_result', typeof data.data.tool_result);
          const newToolResultMessage: Message = { role: "tool_result", content: data.data.tool_result };
          currentMessageState.push(newToolResultMessage);
          messagesChanged = true;
        }

        if (messagesChanged) {
          MessageCache.set(currentConversationId, [...currentMessageState]);
          return currentMessageState;
        }
        return prevMessages;
      });
    };

    // Subscribe to WebSocket events for this session
    const ensureSubscription = async () => {
      // Always close existing connection before creating new one (backend closes after each message)
      if (unsubscribeWSRef.current) {
        debug('ws:cleanup', 'Closing previous connection');
        try { unsubscribeWSRef.current(); } catch {}
        unsubscribeWSRef.current = null;
      }
      
      // Force close any existing connection for this session
      wsManager.close(currentConversationId);
      
      // Get selected model from localStorage
      const selectedModel = localStorage.getItem("preferred_model") || undefined;
      debug('ws:subscribe', currentConversationId, 'model:', selectedModel);
      
      // Create new subscription (will create new WebSocket connection)
      unsubscribeWSRef.current = await wsManager.subscribe(currentConversationId, handleWebSocketEvent, selectedModel);
    };

    try {
      abortControllerRef.current = false;
      
      // Create fresh WebSocket connection for this message
      ensureSubscription();
      
      // Wait for WebSocket to be ready
      const maxWaitTime = 5000; // 5 seconds max
      const checkInterval = 100; // Check every 100ms
      const maxAttempts = maxWaitTime / checkInterval;
      
      let connected = false;
      for (let i = 0; i < maxAttempts; i++) {
        const wsState = wsManager.getState(currentConversationId);
        if (wsState === WebSocket.OPEN) {
          connected = true;
          debug('ws:connected', `Connection ready after ${i * checkInterval}ms`);
          break;
        }
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }

      if (!connected) {
        const wsState = wsManager.getState(currentConversationId);
        console.error('[WS] Connection failed. State:', wsState, 'Expected:', WebSocket.OPEN);
        throw new Error(`WebSocket connection timeout. State: ${wsState}`);
      }

      // Send message via WebSocket in Gemini API format
      const messagePayload = {
        message: {
          role: "user",
          content: {
            parts: parts
          }
        }
      };
      
      debug('ws:send', messagePayload);
      const sent = wsManager.send(currentConversationId, messagePayload);
      
      if (!sent) {
        throw new Error("Failed to send message via WebSocket - connection not ready");
      }

      // Verify conversation exists (for history persistence)
      verifyIfExists(currentConversationId);
      
    } catch (error) {
      console.error("Error sending message:", error);
      setGettingResponse(false);
      
      // Revert optimistic messages (user + assistant placeholder)
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
    }
  };

  const handleFileAttachment = () => {
    console.log("File attachment initiated");
  };


  const handleStopRequest = async () => {
    abortControllerRef.current = true;
    setGettingResponse(false);
    
    // Close the WebSocket connection to stop streaming
    try {
      wsManager.close(conversationId);
      console.log('[WS] Stopped chat by closing WebSocket connection');
    } catch (e) {
      console.error("Failed to stop chat:", e);
    }
  };

  return (
    <div className="flex w-full h-full flex-col justify-between z-5 bg-background rounded-lg">
      {/* Main Content Area: Takes full width, allows vertical flex. NO CENTERING HERE. */}
      <div className="flex-1 w-full overflow-hidden flex flex-col">
        {/* Show existing chat content OR NewChat component in fallback */}
        {id ? (
          /* Container for Existing Chat UI (Loading/Messages/Mic): Takes full width/height */
          <div className="w-full h-full flex flex-col flex-1">
            {loading ? (
              /* Skeleton Loading UI: Centered with max-width */
              <div className="w-full h-full flex flex-col gap-6 p-4 md:max-w-[900px] mx-auto">
                {[...Array(5)].map((_, index) => (
                  <div
                    key={index}
                    className={`flex gap-4 ${
                      index % 2 === 0 ? "justify-start" : "justify-end"
                    }`}
                  >
                    {index % 2 !== 0 && (
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-[200px] ml-auto" />
                        <Skeleton className="h-4 w-[350px] ml-auto" />
                      </div>
                    )}
                    <Skeleton className="h-10 w-10 rounded-full" />
                    {index % 2 === 0 && (
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-[250px]" />
                        <Skeleton className="h-4 w-[400px]" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              /* Show Messages */
              (
                <>
                  {/* Chat messages container: Full width scrollable area, content centered with max-width */}
                  <div
                    ref={chatContainerRef}
                    className={`flex-1 overflow-y-auto overscroll-contain Chat-Container scrollbar rounded-t-lg w-full`}
                    onScroll={() => { saveScrollPosition(); updateScrollBottomVisibility(); }}
                  >
                    {/* Inner div for message content centering and padding - REMOVED PADDING  md:max-w-[900px] mx-auto pt-20*/}
                    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 pb-10 pt-safe-offset-10 ">
                      {memoizedMessages.map((message, index) => (
                        message.role === "user" || message.role === "assistant" ? (
                          <MessageItem
                            key={index}
                            message={message}
                            messages={memoizedMessages}
                            isLast={index === memoizedMessages.length - 1}
                            gettingResponse={
                              gettingResponse &&
                              index === memoizedMessages.length - 1
                            }
                            isLastUser={index === lastUserIndex}
                          />
                        ) : (
                          <ToolMessageRenderer
                            key={index}
                            message={message}
                            messages={memoizedMessages}
                            index={index}
                            toolCallMap={toolCallMap}
                          />
                        )
                      ))}
                      {gettingResponse &&
                        memoizedMessages.length > 0 &&
                        memoizedMessages[memoizedMessages.length - 1].role === "user" && (
                        <div className="pl-5 pt-2">
                          <span className="loading-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                          </span>
                        </div>
                      )}
                      <div id="last-message" className="h-1"></div> 
                    </div>
                  </div>
                  {/* Floating Scroll to bottom button (positioned above input bar, centered to chat body) */}
                  {showScrollToBottom && (
                    <div
                      className="fixed z-[1050]"
                      style={{ bottom: `${((inputContainerRef.current?.offsetHeight ?? 84) + 12)}px`, left: `${scrollBtnLeft ?? window.innerWidth / 2}px`, transform: 'translateX(-50%)' }}
                    >
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-full bg-card/70 backdrop-blur border border-border/60 shadow-sm text-xs text-foreground hover:bg-card/90 transition-colors flex items-center gap-1.5"
                        onClick={() => scrollContainerToBottom()}
                      >
                        <span>Scroll to bottom</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="opacity-80">
                          <path d="M12 16a1 1 0 0 1-.707-.293l-6-6a1 1 0 1 1 1.414-1.414L12 13.586l5.293-5.293a1 1 0 0 1 1.414 1.414l-6 6A1 1 0 0 1 12 16z"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </>
              )
            )}
          </div>
        ) : (
          // Render NewChat centered using flexbox and margins
          <div className="flex-1 flex flex-col w-full md:max-w-[900px] mx-auto justify-center">
            <NewChat onPromptClick={handleSubmit} />
          </div>
        )}
      </div>

      {/* Chat Input Area: Rendered below the main content area */}
      <div className="w-full md:max-w-[760px] mx-auto" ref={inputContainerRef}>
        <ChatInput
          onSubmit={handleSubmit}
          gettingResponse={gettingResponse}
          setIsListening={() => {}}
          handleStopRequest={handleStopRequest}
          conversationId={conversationId}
        />
      </div>
    </div>
  );
}

export default ChatWindow;
