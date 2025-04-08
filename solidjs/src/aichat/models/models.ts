export interface ImageData {
  url: string;
  media_type: string;
  kind: "image-url";
  serverUrl?: string;
  isUploading?: boolean;
}

// Define PdfData interface
export interface PdfData {
  filename: string;
  media_type: string; // Should be "application/pdf"
  kind: "pdf-file";
  url?: string; // URL after upload
  serverUrl?: string; // Consistent naming with ImageData
  isUploading?: boolean;
}

export interface ContentItem {
  content: string | ImageData | PdfData; // Add PdfData
  type?: "str" | "ImageUrl" | "PdfFile"; // Add PdfFile type
  part_kind?: "text" | "image-url" | "pdf-file"; // Add pdf-file kind
}

export interface MessageContent {
  url?: string;
  media_type?: string;
  kind?: string;
  serverUrl?: string;
  isUploading?: boolean;
  content?: string;
}
  
// Define structure for Tool Call content
export interface ToolCallContent {
  name: string;
  args: Record<string, any> | string; // Args might be an object or a stringified object
  tool_call_id?: string; // Make optional
}

// Define structure for Tool Result content
export interface ToolResultContent {
  name: string;
  content: any; // The actual result content
  tool_call_id?: string; // Make optional
}

export interface Message {
    role: string;
    // Update content to include specific types for tool calls/results
    content: string | ContentItem[] | ToolCallContent | ToolResultContent;
    reasoning?: string;
  }


  export enum PartType {
    TEXT = 1,
    IMAGE_URL = 2,
    TOOL_CALL = 3,
    TOOL_RESPONSE = 4
  }

  export interface Part {
    type: PartType;
    content: string;
  }

  export interface MessageWithParts {
    role: string;
    parts: Part[];
  }
