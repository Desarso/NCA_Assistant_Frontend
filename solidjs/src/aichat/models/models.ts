export interface ImageData {
  url: string;
  media_type: string;
  kind: "image-url";
  serverUrl?: string;
  isUploading?: boolean;
}

export interface ContentItem {
  content: string | ImageData;
  type?: "str" | "ImageUrl";
  part_kind?: "text" | "image-url";
}

export interface MessageContent {
  url?: string;
  media_type?: string;
  kind?: string;
  serverUrl?: string;
  isUploading?: boolean;
  content?: string;
}
  
export interface Message {
    role: string;
    content: string | ContentItem[] | {name: string};
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
