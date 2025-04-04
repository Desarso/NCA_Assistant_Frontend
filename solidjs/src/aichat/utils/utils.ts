import { ContentItem, Message } from "../models/models";
export const HOST = import.meta.env.VITE_CHAT_HOST;



interface DBMessage {
  id: number;
  created_at: string;
  conversation_id: number;
  content: string;
  is_user_message: boolean;
  updated_at: string;
}

type ChatMessage = Message;


// Helper function to check if content has a name property
function isNameObject(content: any): content is { name: string } {
  return typeof content === "object" && content !== null && "name" in content;
}



// Helper function to check if content is an array of ContentItems
export function isContentItemArray(content: any): content is ContentItem[] {
    return Array.isArray(content);
  }
  

  

  // Message cache to store fetched messages by conversation ID
// Initialize from localStorage if available
export const messageCache: Map<string, Message[]> = (() => {
  const cache = new Map<string, Message[]>();
  
  try {
    const cachedData = localStorage.getItem('messageCache');
    if (cachedData) {
      const parsed = JSON.parse(cachedData);
      Object.entries(parsed).forEach(([key, value]) => {
        cache.set(key, value as Message[]);
      });
    }
  } catch (error) {
    console.error("Failed to load message cache from localStorage:", error);
  }
  
  return cache;
})();

// Save cache to localStorage when updated
function saveMessageCacheToStorage() {
  try {
    const cacheObject = Object.fromEntries(messageCache.entries());
    localStorage.setItem('messageCache', JSON.stringify(cacheObject));
  } catch (error) {
    console.error("Failed to save message cache to localStorage:", error);
  }
}

// Function to prefetch message history
export async function prefetchMessageHistory(id: string) {
  // Skip if we already have this conversation in cache
  if (messageCache.has(id)) return;

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

    // Store in cache
    messageCache.set(id, chatMessages);
    saveMessageCacheToStorage();
  } catch (error) {
    console.error("Failed to prefetch chat history:", error);
  }
}


  // Function to update cache after a new message
  export const updateMessageCache = (id: string, updatedMessages: Message[]) => {
    messageCache.set(id, [...updatedMessages]);
    saveMessageCacheToStorage();
  };

  // Function to get messages from cache
  export const getMessagesFromCache = (id: string): Message[] => {
    return messageCache.get(id) || [];
  };

  // Clear message cache (useful for logout or clearing data)
  export const clearMessageCache = () => {
    messageCache.clear();
    localStorage.removeItem('messageCache');
  };


  




export function convertToChatMessages(messages: DBMessage[]): ChatMessage[] {
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
  