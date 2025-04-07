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





// Helper function to check if content is an array of ContentItems
export function isContentItemArray(content: any): content is ContentItem[] {
    return Array.isArray(content);
  }
  

  

  // Message cache to store fetched messages by conversation ID


  




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



  export function pythonReprStringToJsObject(pyString: string) {
    // 1. Replace Python bools/None with JSON equivalents
    let jsonString = pyString
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\bNone\b/g, 'null');
  
    // 2. Replace single quotes with double quotes carefully
    // This is tricky because single quotes can appear *inside* strings.
    // A common approach is to handle keys and values separately,
    // or use more complex regex, but a simpler (potentially fragile)
    // approach for *this specific structure* might be:
  
    // Temporarily replace escaped single quotes inside strings
    jsonString = jsonString.replace(/\\'/g, '__TEMP_SINGLE_QUOTE__');
  
    // Replace single quotes used for keys and string boundaries
    // Match 'key': or 'string', etc.
    // This regex tries to match single quotes around keys and string values
    // It assumes keys are simple words/hyphens and avoids touching numbers/bools/null
     jsonString = jsonString.replace(/'([\w\s\-\/.:]+?)'\s*:/g, '"$1":'); // Keys
     jsonString = jsonString.replace(/:\s*'(.+?)'(?=[,\}])/g, ': "$1"');  // String values (heuristic)
     // Handle potential remaining strings at the end
     jsonString = jsonString.replace(/:\s*'(.+?)'$/g, ': "$1"');
  
    // Restore the escaped single quotes within the now double-quoted strings
    jsonString = jsonString.replace(/__TEMP_SINGLE_QUOTE__/g, "\\'"); // Or just "'" if needed inside JS string
  
    // 3. Attempt to parse the potentially valid JSON string
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.error("Failed to parse string after replacements:", error);
      console.error("String after replacements:", jsonString); // Log for debugging
      // Fallback or throw error - parsing failed
      // You might need more robust regex or a different approach
      // if the structure is more complex than the example.
      return null; // Or throw new Error("Could not parse Python string representation");
    }
  }
  