import { useState, useEffect, useMemo } from "react";
import { Message } from "../models/models";
import JsonSyntaxHighlighter from "./JsonSyntaxHighlighter";
import { useTheme } from "@/lib/theme-provider";
import { pythonReprStringToJsObject } from "../utils/utils";

// Define a character limit for rendering large JSON content
const MAX_RENDER_CHARS = 20000;

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

// Define the type for the tool call map
export type ToolCallMap = Map<string, Message>;

interface ToolMessageRendererProps {
  message: Message;
  messages: Message[];
  index: number;
  toolCallMap: ToolCallMap;
}

function ToolMessageRenderer({
  message,
  messages,
  index,
  toolCallMap,
}: ToolMessageRendererProps) {
  const [isLastMessage, setIsLastMessage] = useState<boolean>(false);
  const [isToolCall, setIsToolCall] = useState<boolean>(false);
  const [isToolResult, setIsToolResult] = useState<boolean>(false);
  const prevMessage = useMemo(() => messages[index - 1], [messages, index]);
  
  // Create stable state for the information we need
  const [toolCallInfo, setToolCallInfo] = useState<ToolCallMessageInfo | null>(null);
  const [parsedToolResultContent, setParsedToolResultContent] = useState<any>(null);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    if (index === messages.length - 1) {
      setIsLastMessage(true);
    } else {
      setIsLastMessage(false);
    }
  }, [index, messages.length]);

  useEffect(() => {
    if (message.role === "tool_call") {
      setIsToolCall(true);
    }
    if (message.role === "tool_result") {
      setIsToolResult(true);
      
      // Process the tool result message once on mount using the map
      // Updated function to use the pre-computed map
      const processToolResultMessageWithMap = () => {
    let foundToolCallInfo: ToolCallMessageInfo | null = null;
    let extractedToolCallId: string | null = null;

    // 1. Try to extract tool_call_id from the current tool_result message content
    try {
      if (typeof message.content === 'string') {
        try {
          const jsonContent = JSON.parse(message.content);
          if (jsonContent && jsonContent.tool_call_id && typeof jsonContent.tool_call_id === 'string') {
            extractedToolCallId = jsonContent.tool_call_id;
          }
        } catch {
          const match = message.content.match(/"tool_call_id"\s*:\s*"([^"]+)"/);
          if (match && match[1]) {
            extractedToolCallId = match[1];
          }
        }
      } else if (typeof message.content === 'object') {
        const contentObj = message.content as any;
        if (contentObj?.tool_call_id && typeof contentObj.tool_call_id === 'string') {
          extractedToolCallId = contentObj.tool_call_id;
        }
      }
    } catch (e) {
      console.error("Error extracting tool_call_id from result message:", e);
    }

    // 2. If an ID was extracted, try looking it up in the map
    if (extractedToolCallId) {
      const correspondingCallMsg = toolCallMap.get(extractedToolCallId);

      if (correspondingCallMsg) {
        const content = correspondingCallMsg.content as any;
        const rawToolName = content?.name || "Unknown Tool";
        const formattedToolName = rawToolName
          .split("_")
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
          
        foundToolCallInfo = {
          message: correspondingCallMsg,
          usingId: true,
          id: extractedToolCallId,
          toolName: rawToolName,
          formattedToolName
        };
      }
    }

    // 3. Fallback to previous message if no ID found or ID not in map
    if (!foundToolCallInfo) {
      // Check if prevMessage is actually a tool_call, otherwise it's not a valid fallback
      if (prevMessage && prevMessage.role === 'tool_call') { 
        const rawToolName = (prevMessage.content as any)?.name || "Unknown Tool";
        const formattedToolName = rawToolName
          .split("_")
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
        
        foundToolCallInfo = {
          message: prevMessage,
          usingId: false,
          id: null, // No reliable ID in this case
          toolName: rawToolName,
          formattedToolName
        };
      } else {
         // Handle cases where no corresponding call can be found (e.g., orphaned result)
         // For now, we might show a generic message or hide details
         const genericToolName = "Tool Interaction"; // Or extract from result if possible
         foundToolCallInfo = {
            message: undefined, // No call message found
            usingId: false,
            id: extractedToolCallId, // Still might have extracted an ID
            toolName: genericToolName,
            formattedToolName: genericToolName
         }
         console.warn("Could not find corresponding tool_call for result:", message);
      }
    }

    setToolCallInfo(foundToolCallInfo);

    // Ensure extractedToolCallId is correctly set for content parsing, even if lookup failed
    if (foundToolCallInfo && !extractedToolCallId && foundToolCallInfo.id) {
      extractedToolCallId = foundToolCallInfo.id;
    }

    // 4. Parse the result content (same logic as before)
    try {
      const contentStr = typeof message.content === 'object' && (message.content as ToolResult)?.content 
        ? (message.content as ToolResult).content 
        : typeof message.content === 'string' 
        ? message.content // Assume string might be JSON already
        : JSON.stringify(message.content); // Fallback: stringify if it's an object but not ToolResult structure
        
      let parsedContent: any = {}; // Use 'any' here or a more specific type if known
      try {
        parsedContent = JSON.parse(contentStr);
      } catch {
        // If parsing fails, treat the original string content as the result
        parsedContent = { content: contentStr }; // Wrap in object for consistency
      }
      
      // Add the tool_call_id to the parsed content if available
      if (extractedToolCallId && typeof parsedContent === 'object' && parsedContent !== null) {
        // Avoid adding if it already exists from parsing the string
        if (!('tool_call_id' in parsedContent)) {
           parsedContent.tool_call_id = extractedToolCallId;
        }
      }
      
      setParsedToolResultContent(parsedContent);
      // Cast to any or check for property existence
      setHasError(!!(parsedContent as any)?.error); 
    } catch (error) {
      console.error("Error parsing tool result content:", error);
      // Use the unparsed content, trying to add ID if possible
      const result = message.content;
      if (typeof result === 'object' && result !== null && extractedToolCallId) {
        // Avoid adding if it already exists
        if (!('tool_call_id' in result)) {
          const updatedResult = {...result, tool_call_id: extractedToolCallId};
          setParsedToolResultContent(updatedResult);
        } else {
           setParsedToolResultContent(result);
        }
      } else {
        setParsedToolResultContent(result); // Store as is
      }
      // Assume error if parsing failed, or check original content structure
      setHasError(true); 
    }
      };
      
      processToolResultMessageWithMap();
    }
  }, [message.role, message.content, toolCallMap, prevMessage]);

  // Helper function to check content size, potentially truncate, and provide full string
  const checkContentSize = (content: any): { 
      isTooLarge: boolean, 
      charCount: number, 
      displayedContent: any, 
      fullStringifiedContent: string 
    } => {
    let stringified = "";
    let count = 0;
    let originalContent = content; // Keep original for non-truncated display

    if (content === null || content === undefined) {
      return { isTooLarge: false, charCount: 0, displayedContent: content, fullStringifiedContent: "" };
    }

    try {
      stringified = JSON.stringify(content, null, 2);
      count = stringified.length;
    } catch (e) {
      console.error("Error stringifying content for size check:", e);
      // Use basic string conversion as fallback
      stringified = String(content);
      count = stringified.length;
      originalContent = stringified; // Use the string representation for display
    }
    
    const tooLarge = count > MAX_RENDER_CHARS;
    let displayed = originalContent; // Default to original

    if (tooLarge) {
      let truncatedString = stringified.substring(0, MAX_RENDER_CHARS);
      // Try to parse truncated string back to object/array for potentially better highlighting
      // This is imperfect but might work for simple cases.
      try {
         // Attempt to parse, if fails, use the raw truncated string
         displayed = JSON.parse(truncatedString + (content[0] === '[' ? ']' : '}')); // Basic attempt to close
      } catch {
         try {
            displayed = JSON.parse(truncatedString);
         } catch {
            displayed = truncatedString; // Fallback to raw truncated string
         }
      }
    }

    return {
      isTooLarge: tooLarge,
      charCount: count,
      displayedContent: displayed,
      fullStringifiedContent: stringified
    };
  };

  const callDetailsSizeInfo = useMemo(() => checkContentSize(toolCallInfo?.message?.content), [toolCallInfo]);
  const resultSizeInfo = useMemo(() => checkContentSize(parsedToolResultContent), [parsedToolResultContent]);

  // State for copy functionality
  const [copiedCall, setCopiedCall] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsMounted(true));
  }, []);

  const handleCopy = async (contentToCopy: string, type: 'call' | 'result') => {
    try {
      await navigator.clipboard.writeText(contentToCopy);
      if (type === 'call') {
        setCopiedCall(true);
        setTimeout(() => setCopiedCall(false), 2000);
      } else {
        setCopiedResult(true);
        setTimeout(() => setCopiedResult(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy text: ', err);
      // Optionally: show an error message to the user
    }
  };

  const { theme } = useTheme();

  return (
    <>
      {isToolCall && isLastMessage && (
        <div className="md:max-w-[900px] w-full flex justify-start min-h-full">
          <span className="wave-text ml-5 pl-4">
            {((message.content as any)?.name as string) || "processing..."}
          </span>
        </div>
      )}
      {isToolResult && (() => {
        const info = toolCallInfo;
        if (!info) return null;

        return (
          <div
            className={`transition-opacity duration-500 ease-in-out ${
              isMounted ? "opacity-100" : "opacity-0"
            } md:max-w-[900px] w-full px-4 my-2`}
          >
            <div className="w-full rounded-md border">
              <button
                className="text-sm font-semibold flex items-center justify-between w-full p-3 border rounded-md bg-gradient-to-r from-primary/5 to-primary/10 hover:from-primary/10 hover:to-primary/15 shadow-sm data-[state=open]:rounded-b-none data-[state=open]:border-primary"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                data-state={isOpen ? "open" : "closed"}
              >
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shadow-sm ring-2 ring-black/10 dark:ring-white/15"
                       style={{ background: theme === "dark" ? "linear-gradient(180deg, #2a2f3a, #1e2230)" : "linear-gradient(180deg, #f7f7fb, #eaeaf3)" }}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={theme === "dark" ? "#e5e7eb" : "#111827"}
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.2-3.2c.2 1.8-.5 3.8-2 5.3-1.5 1.5-3.5 2.2-5.3 2l-6.4 6.4a2 2 0 0 1-2.8-2.8l6.4-6.4c-.2-1.8.5-3.8 2-5.3 1.5-1.5 3.5-2.2 5.3-2l-3.2 3.2z" />
                    </svg>
                  </div>
                  <span className="text-primary font-medium">
                    {info.formattedToolName}
                  </span>
                </div>
                <div className="flex items-center">
                  <div
                    className={`px-2.5 py-0.5 text-xs rounded-full font-semibold tracking-wide ring-1 shadow-sm ${
                      hasError
                        ? "bg-red-600 text-white ring-black/10 dark:bg-red-500 dark:text-white dark:ring-white/15"
                        : "bg-emerald-600 text-white ring-black/10 dark:bg-emerald-500 dark:text-white dark:ring-white/15"
                    }`}
                  >
                    {hasError ? "Error" : "Completed"}
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`size-4 shrink-0 transition-transform duration-200 ml-2 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  >
                    <path d="M6 9l6 6l6 -6" />
                  </svg>
                </div>
              </button>
              <div
                className="overflow-hidden transition-all duration-300 ease-in-out rounded-b-md bg-gradient-to-b from-primary/5 to-transparent shadow-sm"
                style={{
                  maxHeight: isOpen ? "1000px" : "0",
                  opacity: isOpen ? 1 : 0,
                  visibility: isOpen ? "visible" : "hidden",
                  borderTop: "none",
                  borderRight: isOpen ? "1px solid var(--border)" : "none",
                  borderBottom: isOpen ? "1px solid var(--border)" : "none",
                  borderLeft: isOpen ? "1px solid var(--border)" : "none",
                }}
              >
                {isOpen && (
                  <div className="p-3 space-y-2">
                    {info.message?.content && (
                      <div className="relative group">
                        <h4 className="text-xs font-medium text-primary/80 mb-1">
                          Call Details:
                        </h4>
                        <button
                          onClick={() => handleCopy(callDetailsSizeInfo.fullStringifiedContent, 'call')}
                          className="absolute top-0 right-0 p-1 text-primary/40 hover:text-primary hover:bg-primary/10 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity z-10"
                          aria-label="Copy call details"
                        >
                          {!copiedCall ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
                              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6L9 17l-5-5"/>
                            </svg>
                          )}
                        </button>
                        {!callDetailsSizeInfo.isTooLarge ? (
                          <JsonSyntaxHighlighter content={callDetailsSizeInfo.displayedContent} />
                        ) : (
                          <div className="relative">
                            <JsonSyntaxHighlighter content={callDetailsSizeInfo.displayedContent} />
                            <div className="absolute bottom-0 left-0 right-0 p-1 bg-gradient-to-t from-background to-transparent text-center">
                               <span className="text-xs px-2 py-0.5 rounded bg-warning/20 text-warning-foreground">
                                 Content truncated ({callDetailsSizeInfo.charCount.toLocaleString()} characters total).
                               </span>
                             </div>
                          </div>
                        )}
                      </div>
                    )}
                    {parsedToolResultContent !== null && parsedToolResultContent !== undefined && (
                      <div className="relative group">
                        <h4 className="text-xs font-medium text-primary/80 mb-1">
                          Result:
                        </h4>
                         <button
                          onClick={() => handleCopy(resultSizeInfo.fullStringifiedContent, 'result')}
                          className="absolute top-0 right-0 p-1 text-primary/40 hover:text-primary hover:bg-primary/10 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity z-10"
                          aria-label="Copy result"
                        >
                          {!copiedResult ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
                              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6L9 17l-5-5"/>
                            </svg>
                          )}
                        </button>
                        {!resultSizeInfo.isTooLarge ? (
                           <JsonSyntaxHighlighter content={resultSizeInfo.displayedContent} />
                        ) : (
                           <div className="relative">
                            <JsonSyntaxHighlighter content={resultSizeInfo.displayedContent} />
                            <div className="absolute bottom-0 left-0 right-0 p-1 bg-gradient-to-t from-background to-transparent text-center">
                               <span className="text-xs px-2 py-0.5 rounded bg-warning/20 text-warning-foreground">
                                 Content truncated ({resultSizeInfo.charCount.toLocaleString()} characters total).
                               </span>
                             </div>
                          </div>
                        )}
                      </div>
                    )}
                    {(() => {
                      const result = parsedToolResultContent;
                      // Use the ID from toolCallInfo if available, otherwise fallback to result
                      const info = toolCallInfo;
                      const toolCallId = info?.id || result?.tool_call_id;
                      
                      if (toolCallId && typeof toolCallId === 'string') {
                        return (
                          <div className="mt-2 pt-2 border-t border-primary/10">
                            <div className="flex items-center">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-primary/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                              </svg>
                              <h4 className="text-xs font-medium text-primary/80">
                                Tool Call ID:
                              </h4>
                            </div>
                            <div className="ml-5 mt-1 p-2 bg-primary/5 rounded text-xs font-mono overflow-x-auto">
                              {toolCallId}
                            </div>
                            <div className="ml-5 mt-1 flex items-center text-xs text-primary/70">
                              <span className="mr-1">Link method:</span>
                              <span className={`px-1.5 py-0.5 rounded ${(info?.usingId ?? false) ? 'bg-blue-500/20' : 'bg-yellow-500/20'}`}>
                                {(info?.usingId ?? false) ? 'ID-based' : 'Sequential (legacy)'}
                              </span>
                            </div>
                          </div>
                        );
                      } else if (info?.usingId === false) {
                        // For legacy messages with no ID, show a simple indicator
                        return (
                          <div className="mt-2 pt-2 border-t border-primary/10">
                            <div className="flex items-center text-xs text-primary/70">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-yellow-500/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {isToolResult && isLastMessage && (
        <div className="md:max-w-[900px] w-full flex justify-start min-h-full">
          <span className="wave-text ml-5 pl-4">processing...</span>
        </div>
      )}
    </>
  );
}

export default ToolMessageRenderer;
