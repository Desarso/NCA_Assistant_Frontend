import {
  Accessor,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onMount,
} from "solid-js";
import { Message } from "../models/models";
import Prism from "prismjs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import JsonSyntaxHighlighter from "./JsonSyntaxHighlighter";
import { useTheme } from "@/lib/theme-provider";
import { pythonReprStringToJsObject } from "../utils/utils";

interface ToolResult {
  content: string;
  name: string;
  timestamp: string;
  tool_call_id: string | null;
}

interface ToolResultContent {
  tool_call_id?: string;
  [key: string]: any;
}

interface ToolCallMessageInfo {
  message: Message | undefined;
  usingId: boolean;
  id: string | null;
  toolName: string;
  formattedToolName: string;
}

function ToolMessageRenderer({
  message,
  messages,
  index,
}: {
  message: Message;
  messages: Accessor<Message[]>;
  index: Accessor<number>;
}) {
  const [isLastMessage, setIsLastMessage] = createSignal<boolean>(false);
  const [isToolCall, setIsToolCall] = createSignal<boolean>(false);
  const [isToolResult, setIsToolResult] = createSignal<boolean>(false);
  const prevMessage = createMemo(() => messages()[index() - 1]);
  
  // Create stable signals for the information we need
  const [toolCallInfo, setToolCallInfo] = createSignal<ToolCallMessageInfo | null>(null);
  const [parsedToolResultContent, setParsedToolResultContent] = createSignal<any>(null);
  const [hasError, setHasError] = createSignal<boolean>(false);

  createEffect(() => {
    if (index() === messages().length - 1) {
      setIsLastMessage(true);
    } else {
      setIsLastMessage(false);
    }
  });

  onMount(() => {
    if (message.role === "tool_call") {
      setIsToolCall(true);
    }
    if (message.role === "tool_result") {
      setIsToolResult(true);
      
      // Process the tool result message once on mount
      processToolResultMessage();
    }
  });
  
  // Function to find the matching tool call message
  const findToolCallMessage = () => {
    // First check if this message has a tool_call_id
    let toolCallId: string | null = null;
    
    try {
      // Try to extract tool_call_id from message content
      if (typeof message.content === 'string') {
        try {
          const jsonContent = JSON.parse(message.content);
          if (jsonContent && jsonContent.tool_call_id) {
            toolCallId = jsonContent.tool_call_id;
          }
        } catch {
          // Try regex extraction if JSON parsing fails
          const match = message.content.match(/"tool_call_id"\s*:\s*"(pyd_ai_[^"]+)"/);
          if (match && match[1]) {
            toolCallId = match[1];
          }
        }
      } else if (typeof message.content === 'object') {
        toolCallId = (message.content as any)?.tool_call_id || null;
      }
      
      // Only consider tool_call_id if it's in the expected format
      if (!toolCallId || !toolCallId.startsWith('pyd_ai_')) {
        toolCallId = null;
      }
      
      // If we found a tool_call_id, search for the matching message
      if (toolCallId) {
        const messagesSnapshot = messages();
        for (let i = 0; i < messagesSnapshot.length; i++) {
          const msg = messagesSnapshot[i];
          if (msg.role === 'tool_call') {
            const content = msg.content as any;
            if (content && content.tool_call_id === toolCallId) {
              const rawToolName = content.name || "Unknown Tool";
              const formattedToolName = rawToolName
                .split("_")
                .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ");
                
              return {
                message: msg,
                usingId: true,
                id: toolCallId,
                toolName: rawToolName,
                formattedToolName
              };
            }
          }
        }
      }
    } catch (e) {
      console.error("Error finding tool call message:", e);
    }
    
    // Fallback to previous message if no match found or no tool_call_id available
    const prevMsg = prevMessage();
    const rawToolName = (prevMsg?.content as any)?.name || "Unknown Tool";
    const formattedToolName = rawToolName
      .split("_")
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
      
    return {
      message: prevMsg,
      usingId: false,
      id: null,
      toolName: rawToolName,
      formattedToolName
    };
  };
  
  // Process the tool result message content
  const processToolResultMessage = () => {
    // Find the related tool call message and set it just once
    const toolCallMessageInfo = findToolCallMessage();
    setToolCallInfo(toolCallMessageInfo);
    
    // Extract tool_call_id from the message content
    let extractedToolCallId: string | null = toolCallMessageInfo.id;
    
    if (!extractedToolCallId) {
      // Try to extract from the result content as a fallback
      if (typeof message.content === 'string') {
        try {
          const jsonContent = JSON.parse(message.content);
          if (jsonContent && jsonContent.tool_call_id && jsonContent.tool_call_id.startsWith('pyd_ai_')) {
            extractedToolCallId = jsonContent.tool_call_id;
          }
        } catch {
          // Try regex extraction if JSON parsing fails
          const match = message.content.match(/"tool_call_id"\s*:\s*"(pyd_ai_[^"]+)"/);
          if (match && match[1]) {
            extractedToolCallId = match[1];
          }
        }
      } else if (typeof message.content === 'object' && 
                (message.content as any)?.tool_call_id && 
                (message.content as any).tool_call_id.startsWith('pyd_ai_')) {
        extractedToolCallId = (message.content as any).tool_call_id;
      }
    }
    
    // Parse the content
    try {
      const content = typeof message.content === 'object' && (message.content as ToolResult)?.content 
        ? (message.content as ToolResult).content 
        : JSON.stringify(message.content);
        
      const parsedContent = JSON.parse(content);
      
      // Add the tool_call_id to the parsed content if found
      if (extractedToolCallId && typeof parsedContent === 'object') {
        parsedContent.tool_call_id = extractedToolCallId;
      }
      
      setParsedToolResultContent(parsedContent);
      setHasError(!!parsedContent.error);
    } catch (error) {
      // We just use the unparsed content
      const result = message.content;
      if (typeof result === 'object' && extractedToolCallId) {
        const updatedResult = {...result, tool_call_id: extractedToolCallId};
        setParsedToolResultContent(updatedResult);
      } else {
        setParsedToolResultContent(result);
      }
    }
  };

  return (
    <>
      <Show when={isToolCall() && isLastMessage()}>
        <div class="md:max-w-[900px] w-full flex justify-start min-h-full">
          <span class="wave-text ml-5 pl-4">
            {((message.content as any)?.name as string) || "processing..."}
          </span>
        </div>
      </Show>
      <Show when={isToolResult()}>
        {(() => {
          const { theme } = useTheme();
          const [isMounted, setIsMounted] = createSignal(false);
          const [isOpen, setIsOpen] = createSignal(false);
          
          onMount(() => {
            requestAnimationFrame(() => setIsMounted(true));
            Prism.highlightAll();
          });

          const info = toolCallInfo();
          if (!info) return null;

          return (
            <div
              class={`transition-opacity duration-500 ease-in-out ${
                isMounted() ? "opacity-100" : "opacity-0"
              } md:max-w-[900px] w-full px-4 my-2`}
            >
              <div class="w-full rounded-md border">
                <button
                  class="text-sm font-semibold flex items-center justify-between w-full p-3 border rounded-md bg-gradient-to-r from-primary/5 to-primary/10 hover:from-primary/10 hover:to-primary/15 shadow-sm data-[state=open]:rounded-b-none data-[state=open]:border-primary"
                  onClick={() => setIsOpen(!isOpen())}
                  aria-expanded={isOpen()}
                  data-state={isOpen() ? "open" : "closed"}
                >
                  <div class="flex items-center space-x-2">
                    <div class="w-6 h-6 rounded-full bg-primary-foreground  flex items-center justify-center text-white shadow-sm ring-2 dark:ring-white/20  ring-black/20">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={`${theme() === "dark" ? "white" : "black"}`}
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                      </svg>
                    </div>
                    <span class="text-primary font-medium">
                      {info.formattedToolName}
                    </span>
                  </div>
                  <div class="flex items-center">
                    <div
                      class={`px-2 py-0.5 text-xs rounded-full bg-accent text-primary font-medium ${
                        hasError() ? "bg-red-500" : "bg-green-500"
                      }`}
                    >
                      {hasError() ? "Error" : "Completed"}
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class={`size-4 shrink-0 transition-transform duration-200 ml-2 ${
                        isOpen() ? "rotate-180" : ""
                      }`}
                    >
                      <path d="M6 9l6 6l6 -6" />
                    </svg>
                  </div>
                </button>
                <div
                  class="overflow-hidden transition-all duration-300 ease-in-out border-t-0 rounded-b-md bg-gradient-to-b from-primary/5 to-transparent shadow-sm"
                  style={{
                    "max-height": isOpen() ? "1000px" : "0",
                    opacity: isOpen() ? "1" : "0",
                    visibility: isOpen() ? "visible" : "hidden",
                    border: isOpen() ? "1px solid var(--border)" : "none",
                    "border-top": "none",
                  }}
                >
                  <div class="p-3 space-y-2">
                    <div>
                      <h4 class="text-xs font-medium text-primary/80 mb-1">
                        Call Details:
                      </h4>
                      <JsonSyntaxHighlighter content={info.message?.content} />
                    </div>
                    <div>
                      <h4 class="text-xs font-medium text-primary/80 mb-1">
                        Result:
                      </h4>
                      <JsonSyntaxHighlighter content={parsedToolResultContent()} />
                    </div>
                    {(() => {
                      const result = parsedToolResultContent();
                      const toolCallId = result?.tool_call_id || info.id;
                      
                      if (toolCallId && toolCallId.startsWith('pyd_ai_')) {
                        return (
                          <div class="mt-2 pt-2 border-t border-primary/10">
                            <div class="flex items-center">
                              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1 text-primary/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                              </svg>
                              <h4 class="text-xs font-medium text-primary/80">
                                Tool Call ID:
                              </h4>
                            </div>
                            <div class="ml-5 mt-1 p-2 bg-primary/5 rounded text-xs font-mono overflow-x-auto">
                              {toolCallId}
                            </div>
                            <div class="ml-5 mt-1 flex items-center text-xs text-primary/70">
                              <span class="mr-1">Link method:</span>
                              <span class={`px-1.5 py-0.5 rounded ${info.usingId ? 'bg-blue-500/20' : 'bg-yellow-500/20'}`}>
                                {info.usingId ? 'ID-based' : 'Sequential (legacy)'}
                              </span>
                            </div>
                          </div>
                        );
                      } else if (info.usingId === false) {
                        // For legacy messages with no ID, show a simple indicator
                        return (
                          <div class="mt-2 pt-2 border-t border-primary/10">
                            <div class="flex items-center text-xs text-primary/70">
                              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1 text-yellow-500/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M9 18l6-6-6-6"/>
                              </svg>
                              <span>Legacy connection (sequential messages)</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </Show>

      <Show when={isToolResult() && isLastMessage()}>
        <div class="md:max-w-[900px] w-full flex justify-start min-h-full">
          <span class="wave-text ml-5 pl-4">processing...</span>
        </div>
      </Show>
    </>
  );
}

export default ToolMessageRenderer;
