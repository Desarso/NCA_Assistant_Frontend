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
    // Use flatMap to handle cases where one DB message might become multiple UI messages
    return messages.flatMap((dbMessage) => {
      const outputMessages: ChatMessage[] = [];
      try {
        const parsed = JSON.parse(dbMessage.content);

        // Ensure parsed.parts is an array
        if (!Array.isArray(parsed.parts)) {
           console.error("Parsed message content does not contain a 'parts' array:", parsed);
           // Maybe return a placeholder error message or skip
           // For now, let's create a simple text message if possible, or skip
           if (typeof parsed === 'string') {
                outputMessages.push({ role: dbMessage.is_user_message ? 'user' : 'assistant', content: parsed });
           } else if (typeof parsed.content === 'string') {
                outputMessages.push({ role: dbMessage.is_user_message ? 'user' : 'assistant', content: parsed.content });
           } else {
               // Cannot determine content, skip this message
               console.error("Skipping message due to unparseable structure:", dbMessage.id, parsed);
           }
           return outputMessages; // Return potentially modified outputMessages
        }

        let currentAssistantMessage: ChatMessage | null = null;

        for (const part of parsed.parts) {
          // --- Handle User Messages ---
          if (part.type === "UserPromptPart") {
             // Reset assistant message accumulation
            currentAssistantMessage = null;
            // Handle potential mixed content (simple string vs. array)
            if (Array.isArray(part.content)) {
               // Map backend structure (like ImageUrl/AudioUrl from model_message_to_dict)
               // back to frontend ContentItem structure if necessary, or keep as is if renderer handles it.
               // Assuming renderer can handle the structure saved by model_message_to_dict for now.
                outputMessages.push({ role: "user", content: part.content });
            } else {
                outputMessages.push({ role: "user", content: part.content });
            }
          }
          // --- Handle Assistant Text/Reasoning ---
          else if (part.type === "TextPart" || part.type === "ReasoningPart") {
            const contentToAdd = part.type === "TextPart" ? part.content : "";
            const reasoningToAdd = part.type === "ReasoningPart" ? part.content : ""; // Backend stores reasoning in 'content' field of ReasoningPart dict

            if (currentAssistantMessage && currentAssistantMessage.role === 'assistant') {
              // Append to existing assistant message
              if (typeof currentAssistantMessage.content === 'string') { // Ensure content is string before appending
                  currentAssistantMessage.content += contentToAdd;
              }
              if (reasoningToAdd) {
                 currentAssistantMessage.reasoning = (currentAssistantMessage.reasoning || "") + reasoningToAdd;
              }
            } else {
              // Create new assistant message
              currentAssistantMessage = {
                role: "assistant",
                content: contentToAdd,
                reasoning: reasoningToAdd,
              };
              outputMessages.push(currentAssistantMessage);
            }
          }
          // --- Handle Tool Calls ---
          else if (part.type === "ToolCallPart") {
            // Reset assistant message accumulation
            currentAssistantMessage = null;
            // The content for the 'tool_call' message should be the object
            // containing name, args, and tool_call_id.
            // Ensure the content part exists and has the necessary fields.
            if (part.content && typeof part.content === 'object' && part.content.tool_call_id) {
                 outputMessages.push({
                   role: "tool_call",
                   content: part.content, // Use the object directly
                 });
            } else {
                 console.error("Invalid ToolCallPart structure:", part);
                 // Add a placeholder or skip - Use correct type
                 outputMessages.push({ 
                     role: "tool_call", 
                     content: { 
                         name: "Error: Invalid Tool Call Data", 
                         args: {}, 
                         tool_call_id: `invalid_${dbMessage.id}`
                     } // Satisfies ToolCallContent
                 });
            }
          }
          // --- Handle Tool Results ---
          else if (part.type === "ToolReturnPart") {
             // Reset assistant message accumulation
            currentAssistantMessage = null;
             // The content for the 'tool_result' message should be the object
             // containing name, content (the actual result), and tool_call_id.
             if (part.content && typeof part.content === 'object' && part.content.tool_call_id) {
                 // The actual result content might be a stringified JSON, attempt to parse it
                 let finalResultContent = part.content;
                 if (typeof finalResultContent.content === 'string') {
                     try {
                        // Attempt to parse the inner content string
                        const innerParsed = JSON.parse(finalResultContent.content);
                        // If successful, replace the stringified content with the parsed object
                        finalResultContent = { ...finalResultContent, content: innerParsed };
                     } catch (innerError) {
                         // If inner parsing fails, keep the original string content
                         // console.warn("ToolReturnPart inner content was string but not valid JSON:", finalResultContent.content);
                     }
                 }

                 outputMessages.push({
                    role: "tool_result",
                    content: finalResultContent, // Use the potentially updated object
                 });
             } else {
                 console.error("Invalid ToolReturnPart structure:", part);
                 // Add a placeholder or skip - Use correct type
                 outputMessages.push({ 
                     role: "tool_result", 
                     content: { 
                         name: "Error: Invalid Tool Result Data", 
                         content: { error: "Invalid structure" }, // Content for ToolResultContent can be any
                         tool_call_id: `invalid_${dbMessage.id}`
                     } // Satisfies ToolResultContent
                 });
             }
          }
           // --- Handle System Prompt (Usually ignored in chat display) ---
          else if (part.type === "SystemPromptPart") {
              // Reset assistant message accumulation
              currentAssistantMessage = null;
              // Typically, system prompts aren't displayed directly in the chat UI.
              // You might log it or store it elsewhere if needed.
              // console.log("Ignoring SystemPromptPart for UI:", part.content);
          }
          // --- Handle other potential part types ---
          else {
             // Reset assistant message accumulation
             currentAssistantMessage = null;
             console.warn("Unhandled part type in convertToChatMessages:", part.type, part);
             // Optionally create a generic message or ignore
          }
        }
      } catch (e) {
        console.error(`Error parsing DB message content (ID: ${dbMessage.id}):`, e);
        console.error("Original content:", dbMessage.content);
         // Attempt to create a fallback message if content is just a string
        if (typeof dbMessage.content === 'string') {
             try {
                 // Check if the raw content itself is simple text rather than JSON
                 // This handles the case where the initial modification might have saved raw strings
                 JSON.parse(dbMessage.content); // If this fails, it's likely not JSON
             } catch (jsonError) {
                 // Content is likely a simple string, use it directly
                 outputMessages.push({
                     role: dbMessage.is_user_message ? 'user' : 'assistant',
                     content: dbMessage.content
                 });
                 return outputMessages; // Return the fallback message
             }
         }
        // If parsing failed badly, add a placeholder error message
        outputMessages.push({
            role: "assistant", // Or determine role based on dbMessage.is_user_message
            content: `Error: Could not display message (ID: ${dbMessage.id}). Invalid format.`
        });
      }
      return outputMessages;
    });
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
  