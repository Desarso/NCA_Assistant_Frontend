import React, { useState, useEffect, useRef } from "react";
import { ContentItem, ImageData, PdfData } from "../models/models";
import WaveIcon from "./WaveIcon";

const HOST = import.meta.env.VITE_CHAT_HOST;

interface ChatInputProps {
  // Revert onSubmit to expect the internal ContentItem format
  onSubmit: (content: string | ContentItem[]) => void;
  gettingResponse: boolean;
  setIsListening?: (isListening: boolean) => void;
  handleStopRequest: () => void;
  conversationId: string;
}

const isImageData = (content: any): content is ImageData => {
  return typeof content === "object" && content !== null && "kind" in content && content.kind === "image-url";
};

// Type guard for PDF data
const isPdfData = (content: any): content is PdfData => {
  return typeof content === "object" && content !== null && "kind" in content && content.kind === "pdf-file";
};

const ChatInput: React.FC<ChatInputProps> = (props) => {
  const [content, setContent] = useState<ContentItem[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [isModelMenuOpen, setIsModelMenuOpen] = useState<boolean>(false);
  const [availableModels, setAvailableModels] = useState<Array<{id: string; display_name: string; provider: string; description: string}>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  // Load models and current conversation model
  const loadModelsAndConversation = async () => {
    try {
      const { authFetch } = await import("@/lib/utils");
      // Fetch available models
      const modelsResp = await authFetch(`${HOST}/api/v1/models`);
      if (modelsResp.ok) {
        const data = await modelsResp.json();
        if (Array.isArray(data?.models)) {
          setAvailableModels(data.models);
        }
      }
      // Fetch current conversation model (verify returns conversation.model or user preferred)
      if (props.conversationId) {
        const convResp = await authFetch(`${HOST}/api/v1/chats/conversations/${props.conversationId}/verify`);
        if (convResp.ok) {
          const convData = await convResp.json();
          const modelKey = convData?.model ?? convData?.conversation?.model;
          if (typeof modelKey === 'string' && modelKey.length > 0) {
            setSelectedModel(modelKey);
          }
        }
      }
      // Load from localStorage first, then default to first available
      const storedModel = localStorage.getItem("preferred_model");
      if (storedModel && !selectedModel) {
        setSelectedModel(storedModel);
        console.log("[ChatInput] Loaded model from localStorage:", storedModel);
      } else if (!selectedModel && availableModels.length > 0) {
        const defaultModel = availableModels[0].id;
        setSelectedModel(defaultModel);
        localStorage.setItem("preferred_model", defaultModel);
        console.log("[ChatInput] Set default model:", defaultModel);
      }
    } catch (e) {
      // ignore
    }
  };

  // Initialize models on mount
  useEffect(() => {
    loadModelsAndConversation();
  }, [props.conversationId]);

  // Calculate if any uploads are in progress
  const isUploading = () => pendingUploads > 0;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer?.files || []);
    await handleFiles(files);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = Array.from(input.files || []);
    await handleFiles(files);
    if (input) {
      input.value = "";
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData?.items) return;

    const files: File[] = [];
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      await handleFiles(files);
    }
    //restore focus to input
    textInputRef.current?.focus();
  };

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;

    // Filter for allowed file types
    const allowedFiles = files.filter(file => file.type.startsWith("image/") || file.type === "application/pdf");
    if (allowedFiles.length === 0) return;

    // Increment the upload counter for each allowed file
    setPendingUploads(prev => prev + allowedFiles.length);

    // Process each file individually
    for (const file of allowedFiles) {
      const isImage = file.type.startsWith("image/");
      const isPdf = file.type === "application/pdf";
      const blobUrl = isImage ? URL.createObjectURL(file) : null; // Blob URL only for image preview

      let uploadingContentItem: ContentItem;

      if (isImage) {
        uploadingContentItem = {
          content: {
            url: blobUrl!, // Use blob for image preview
            media_type: file.type,
            kind: "image-url",
            isUploading: true,
            serverUrl: "",
          },
          type: "ImageUrl",
          part_kind: "image-url"
        };
      } else { // isPdf
        uploadingContentItem = {
          content: {
            filename: file.name, // Store filename for PDF
            media_type: file.type,
            kind: "pdf-file",
            isUploading: true,
            serverUrl: "",
          },
          type: "PdfFile", // New type
          part_kind: "pdf-file" // New part_kind
        };
      }

      // Add the item to the content array
      setContent(prev => [...prev, uploadingContentItem]);

      try {
        const formData = new FormData();
        formData.append("file", file);
        const { authFetch } = await import("@/lib/utils");
        const response = await authFetch(`${HOST}/api/v1/files/upload`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Upload failed: ${response.status} ${errorText}`);
        }
        
        const data = await response.json();
        const serverFileUrl = data.url; // Use the CDN URL directly from Digital Ocean Spaces

        // Update the content item with the server URL
        setContent(prev =>
          prev.map(item => {
            if (isImage && isImageData(item.content) && item.content.url === blobUrl && item.content.isUploading) {
              return {
                ...item,
                content: { ...item.content, serverUrl: serverFileUrl, isUploading: false }
              };
            } else if (isPdf && isPdfData(item.content) && item.content.filename === file.name && item.content.isUploading) {
              // Match PDF by filename and uploading state (less robust, consider temp ID if needed)
              return {
                ...item,
                content: { ...item.content, serverUrl: serverFileUrl, isUploading: false }
              };
            }
            return item;
          })
        );
      } catch (error) {
        console.error("Error uploading file:", file.name, error);

        // Remove the item from content based on type
        setContent(prev =>
          prev.filter(item => {
            if (isImage && isImageData(item.content) && item.content.url === blobUrl) {
              URL.revokeObjectURL(blobUrl!); // Clean up blob URL for images
              return false; // Remove image
            }
            if (isPdf && isPdfData(item.content) && item.content.filename === file.name && item.content.isUploading) {
              return false; // Remove PDF
            }
            return true;
          })
        );
      } finally {
        // Always decrement the counter when an upload finishes
        setPendingUploads(prev => Math.max(0, prev - 1));
      }
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();

    const hasUploadingItems = content.some(
      item => (isImageData(item.content) || isPdfData(item.content)) && item.content.isUploading === true
    );
    const uploadingSignal = isUploading();

    if (hasUploadingItems || uploadingSignal) {
      return;
    }
    if (props.gettingResponse) {
      return;
    }

    const currentText = textInput.trim();
    const currentContent = content;

    if (currentText || currentContent.length > 0) {
      if (currentText && currentContent.length === 0) {
        const submissionData: string = currentText;
        props.onSubmit(submissionData);
        setContent([]);
        setTextInput("");
        // Reset textarea height
        if (textInputRef.current) {
          textInputRef.current.style.height = '56px';
        }
      } else if (currentContent.length > 0) {
        const validContent = currentContent.filter(item => {
          if ((isImageData(item.content) || isPdfData(item.content)) && item.content.serverUrl && !item.content.isUploading) {
            return true;
          }
          console.warn("Filtering out incomplete/invalid item:", item);
          return false;
        });

        if (currentText) {
          validContent.push({
            content: currentText,
            type: "str",
            part_kind: "text"
          });
        }

        if (validContent.length === 0) {
          console.error("No valid content (text or files) to send.");
          return;
        }

        const submissionData: ContentItem[] = validContent;
        props.onSubmit(submissionData);
        setContent([]);
        setTextInput("");
        // Reset textarea height
        if (textInputRef.current) {
          textInputRef.current.style.height = '56px';
        }
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
    }
  }

  // Handle selecting a model: PATCH backend and update state
  const handleSelectModel = async (modelKey: string) => {
    setIsModelMenuOpen(false);
    // Optimistically reflect selection in UI
    setSelectedModel(modelKey);
    // Save to localStorage immediately
    localStorage.setItem("preferred_model", modelKey);
    console.log("[ChatInput] Selected and saved model to localStorage:", modelKey);
    
    try {
      const { authFetch } = await import("@/lib/utils");
      let patched = false;
      if (props.conversationId) {
        // Ensure the conversation exists (auto-creates if missing)
        try { await authFetch(`${HOST}/api/v1/chats/conversations/${props.conversationId}/verify`); } catch {}
        try {
          const url = new URL(`${HOST}/api/v1/chats/conversations/${props.conversationId}/model`);
          url.searchParams.set("model", modelKey);
          const resp = await authFetch(url.toString(), { method: "PATCH" });
          patched = resp.ok;
        } catch {}
      }
      // Fallback: if no conversation yet or PATCH failed, update user preferred model
      if (!patched) {
        try {
          const u = new URL(`${HOST}/api/v1/users/preferred-model`);
          u.searchParams.set("model", modelKey);
          await authFetch(u.toString(), { method: "PATCH" });
        } catch {}
      }
    } catch {
      // ignore
    }
  };

  const removeContent = (index: number) => {
    const itemToRemove = content[index];
    if (isImageData(itemToRemove.content) && itemToRemove.content.url?.startsWith('blob:')) {
        URL.revokeObjectURL(itemToRemove.content.url); // Revoke blob URL for images
    }
    // No blob URL to revoke for PDFs in this implementation
    setContent(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`flex-1 border border-transparent ${
          isDragging
            ? "border-2 border-dashed border-blue-500 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2"
            : ""
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {content.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 px-2 pt-2">
            {content.map((item, index) => (
              <div key={index} className="relative group">
                {(() => {
                  const currentContent = item.content; // Assign to variable for type narrowing
                  if (isImageData(currentContent)) {
                    return (
                      <div className="relative">
                        <img
                          src={currentContent.url} // Use blob URL for preview
                          alt="Uploaded image"
                          className="h-20 w-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                        />
                        {currentContent.isUploading && (
                          <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
                          </div>
                        )}
                        {/* Show error state if upload failed (no serverUrl but blob exists) */}
                        {!currentContent.isUploading && !currentContent.serverUrl && currentContent.url?.startsWith('blob:') && (
                           <div className="absolute inset-0 bg-red-500/70 rounded-lg flex items-center justify-center text-white" title="Upload failed">
                             <i className="fas fa-exclamation-triangle"></i>
                           </div>
                         )}
                        <button
                          type="button" title="Remove" onClick={() => removeContent(index)}
                          className="absolute -top-1 -right-1 bg-red-600 hover:bg-red-700 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        >✕</button>
                      </div>
                    );
                  } else if (isPdfData(currentContent)) {
                    return (
                       <div className="relative h-20 w-20 flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-1 text-center">
                          <i className="fas fa-file-pdf text-red-500 text-2xl mb-1"></i>
                          <span className="text-xs break-all line-clamp-2" title={currentContent.filename}>{currentContent.filename}</span>
                          {currentContent.isUploading && (
                            <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                              <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
                            </div>
                          )}
                           {!currentContent.isUploading && !currentContent.serverUrl && (
                             <div className="absolute inset-0 bg-red-500/70 rounded-lg flex items-center justify-center text-white" title="Upload failed">
                               <i className="fas fa-exclamation-triangle"></i>
                             </div>
                           )}
                          <button
                            type="button" title="Remove" onClick={() => removeContent(index)}
                            className="absolute -top-1 -right-1 bg-red-600 hover:bg-red-700 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          >✕</button>
                        </div>
                    );
                  } else if (typeof currentContent === 'string') {
                     // Optional: Text Display (if text can be part of the content array)
                     return (
                       <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-1 text-sm">
                         {currentContent}
                         <button type="button" onClick={() => removeContent(index)} className="ml-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">×</button>
                       </div>
                     );
                  }
                  // If it's not image, pdf, or string (shouldn't happen with current types)
                  return null;
                })()}
              </div>
            ))}
          </div>
        )}

        {/* Single bordered container (no separate outer wrapper), flat bottom */}
        <div className="flex items-end gap-3 border-x border-t border-b-0 border-[0.5px] border-border/80 rounded-t-2xl rounded-b-none bg-secondary/10 px-3 pt-3 pb-0">
          <div className="flex flex-col gap-2 px-2 py-1 rounded-t-2xl rounded-b-none bg-transparent w-full">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              onChange={handleFileSelect}
              className="hidden"
            />

            <textarea
              ref={textInputRef}
              rows={1}
              className={`flex-1 bg-transparent px-2 py-2 text-sm md:text-base focus:outline-none resize-none text-foreground placeholder-muted-foreground leading-relaxed min-h-[56px] w-full overflow-y-hidden`}
              style={{ maxHeight: "180px" }}
              value={textInput}
              onChange={(e) => {
                  setTextInput(e.currentTarget.value);
                  e.currentTarget.style.height = 'auto';
                  e.currentTarget.style.height = `${Math.max(52, e.currentTarget.scrollHeight)}px`;
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Type your message here..."
              autoComplete="off"
              spellCheck={false}
              disabled={isUploading() || props.gettingResponse}
            />

            {/* Bottom toolbar flush with container bottom */}
            <div className="flex items-center justify-between pt-1 pb-3">
              <div className="flex items-center gap-2">
                {/* Model dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    className="h-9 px-3 rounded-full border border-border/50 bg-transparent text-foreground text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
                  >
                    {availableModels.find(m => m.id === selectedModel)?.display_name || selectedModel || 'Select model'}
                    <i className={`fas ${isModelMenuOpen ? 'fa-chevron-up' : 'fa-chevron-down'} text-xs`}></i>
                  </button>
                  {isModelMenuOpen && (
                    <div className="absolute left-0 bottom-full mb-2 w-56 rounded-lg border border-border/50 bg-card shadow-lg z-[9999] p-1">
                      {availableModels.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-sm"
                          onClick={() => handleSelectModel(m.id)}
                        >
                          <div className="font-medium">{m.display_name}</div>
                          <div className="text-xs text-muted-foreground">{m.description}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  title="Attach file"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                  disabled={isUploading() || props.gettingResponse}
                >
                  <i className="fas fa-paperclip"></i>
                </button>
                <button
                  type="button"
                  title="Search"
                  className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                  disabled={isUploading() || props.gettingResponse}
                >
                  <i className="fas fa-globe"></i>
                </button>
                <button
                  type="button"
                  title="Extensions"
                  className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                  disabled={isUploading() || props.gettingResponse}
                >
                  <i className="fas fa-plug"></i>
                </button>
              </div>
              {/* Right side: action button, paper-plane with neutral colors */}
              <div className="flex items-center">
                {props.gettingResponse ? (
                  <button
                    type="button"
                    title="Stop response"
                    className="rounded-xl w-11 h-11 bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-colors"
                    onClick={props.handleStopRequest}
                    aria-label="Stop response"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <rect x="6" y="6" width="12" height="12" />
                    </svg>
                  </button>
                ) : (
                  textInput.trim() === "" && content.length === 0 ? (
                    <button
                      type="button"
                      title="Start listening"
                      className="rounded-xl w-11 h-11 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 flex items-center justify-center transition-colors"
                      onClick={() => props.setIsListening?.(true)}
                      disabled={isUploading()}
                      aria-label="Start voice input"
                    >
                      <WaveIcon />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded-xl w-11 h-11 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 flex items-center justify-center transition-colors"
                      onClick={handleSubmit}
                      aria-label="Send message"
                    >
                      <i className="fas fa-paper-plane"></i>
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
