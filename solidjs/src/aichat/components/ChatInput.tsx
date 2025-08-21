import { Component, createSignal, For, Show } from "solid-js";
import { ContentItem, ImageData, PdfData } from "../models/models"; // Added PdfData
import WaveIcon from "./WaveIcon";

const HOST = import.meta.env.VITE_CHAT_HOST;

// Removed BackendChatContent interface definition from here

interface ChatInputProps {
  // Revert onSubmit to expect the internal ContentItem format
  onSubmit: (content: string | ContentItem[]) => void;
  gettingResponse: boolean;
  // handleFileAttachment: () => void; // Prop seems unused, removed
  setIsListening: (isListening: boolean) => void;
  handleStopRequest: () => void;
}

const isImageData = (content: any): content is ImageData => {
  return typeof content === "object" && content !== null && "kind" in content && content.kind === "image-url";
};

// Type guard for PDF data
const isPdfData = (content: any): content is PdfData => {
  return typeof content === "object" && content !== null && "kind" in content && content.kind === "pdf-file";
};


const ChatInput: Component<ChatInputProps> = (props) => {
  const [content, setContent] = createSignal<ContentItem[]>([]);
  const [textInput, setTextInput] = createSignal("");
  const [isDragging, setIsDragging] = createSignal(false);
  const [pendingUploads, setPendingUploads] = createSignal(0);
  let fileInputRef: HTMLInputElement | undefined;
  let textInputRef: HTMLTextAreaElement | undefined;

  // Calculate if any uploads are in progress
  const isUploading = () => pendingUploads() > 0;

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer?.files || []);
    await handleFiles(files);
  };

  const handleFileSelect = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    await handleFiles(files);
    if (input) {
      input.value = "";
    }
  };

  const handlePaste = async (e: ClipboardEvent) => {
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
    textInputRef?.focus();
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

  const handleSubmit = (e?: Event) => {
    e?.preventDefault();

    const hasUploadingItems = content().some(
      item => (isImageData(item.content) || isPdfData(item.content)) && item.content.isUploading === true
    );
    const uploadingSignal = isUploading();

    if (hasUploadingItems || uploadingSignal) {
      return;
    }
    if (props.gettingResponse) {
      return;
    }

    const currentText = textInput().trim();
    const currentContent = content();

    if (currentText || currentContent.length > 0) {
      if (currentText && currentContent.length === 0) {
        const submissionData: string = currentText;
        props.onSubmit(submissionData);
        setContent([]);
        setTextInput("");
        // Reset textarea height
        if (textInputRef) {
          textInputRef.style.height = '40px';
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
        if (textInputRef) {
          textInputRef.style.height = '40px';
        }
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
    }
  }

  const removeContent = (index: number) => {
    const itemToRemove = content()[index];
    if (isImageData(itemToRemove.content) && itemToRemove.content.url?.startsWith('blob:')) {
        URL.revokeObjectURL(itemToRemove.content.url); // Revoke blob URL for images
    }
    // No blob URL to revoke for PDFs in this implementation
    setContent(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div class="flex flex-col gap-2">
      <div
        class={`flex-1 border border-transparent ${
          isDragging()
            ? "border-2 border-dashed border-blue-500 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2"
            : ""
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Show when={content().length > 0}>
          <div class="flex flex-wrap gap-2 mb-2 px-2 pt-2">
            {/* Corrected JSX structure for rendering content items */}
            {/* Corrected JSX structure with explicit type checks */}
            <For each={content()}>
              {(item, index) => (
                <div class="relative group">
                  {(() => {
                    const currentContent = item.content; // Assign to variable for type narrowing
                    if (isImageData(currentContent)) {
                      return (
                        <div class="relative">
                          <img
                            src={currentContent.url} // Use blob URL for preview
                            alt="Uploaded image"
                            class="h-20 w-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                          />
                          <Show when={currentContent.isUploading}>
                            <div class="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                              <div class="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
                            </div>
                          </Show>
                          {/* Show error state if upload failed (no serverUrl but blob exists) */}
                          <Show when={!currentContent.isUploading && !currentContent.serverUrl && currentContent.url?.startsWith('blob:')}>
                             <div class="absolute inset-0 bg-red-500/70 rounded-lg flex items-center justify-center text-white" title="Upload failed">
                               <i class="fas fa-exclamation-triangle"></i>
                             </div>
                           </Show>
                          <button
                            type="button" title="Remove" onClick={() => removeContent(index())}
                            class="absolute -top-1 -right-1 bg-red-600 hover:bg-red-700 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          >✕</button>
                        </div>
                      );
                    } else if (isPdfData(currentContent)) {
                      return (
                         <div class="relative h-20 w-20 flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-1 text-center">
                            <i class="fas fa-file-pdf text-red-500 text-2xl mb-1"></i>
                            <span class="text-xs break-all line-clamp-2" title={currentContent.filename}>{currentContent.filename}</span>
                            <Show when={currentContent.isUploading}>
                              <div class="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                                <div class="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
                              </div>
                            </Show>
                             <Show when={!currentContent.isUploading && !currentContent.serverUrl}>
                               <div class="absolute inset-0 bg-red-500/70 rounded-lg flex items-center justify-center text-white" title="Upload failed">
                                 <i class="fas fa-exclamation-triangle"></i>
                               </div>
                             </Show>
                            <button
                              type="button" title="Remove" onClick={() => removeContent(index())}
                              class="absolute -top-1 -right-1 bg-red-600 hover:bg-red-700 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            >✕</button>
                          </div>
                      );
                    } else if (typeof currentContent === 'string') {
                       // Optional: Text Display (if text can be part of the content array)
                       return (
                         <div class="bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-1 text-sm">
                           {currentContent}
                           <button type="button" onClick={() => removeContent(index())} class="ml-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">×</button>
                         </div>
                       );
                    }
                    // If it's not image, pdf, or string (shouldn't happen with current types)
                    return null;
                  })()}
                  {/* Removed stray div and commented Show tag from here */}
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* Corrected input section - removed duplicate input tag */}
        <div class="flex items-end gap-2 p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-blue-500/30">
           <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf" // Added PDF to accept
            onChange={handleFileSelect}
            class="hidden"
          />

          <textarea
            ref={textInputRef}
            rows="1"
            class={`flex-1 bg-transparent px-2 py-2 text-sm md:text-base focus:outline-none resize-none dark:text-gray-200 placeholder-gray-200 dark:placeholder-gray-400 leading-relaxed min-h-[40px] w-full ${
              (props.gettingResponse || isUploading()) ? 'overflow-y-hidden' : 'overflow-y-auto'
            }`}
            style={{ "max-height": "120px" }}
            value={textInput()}
            onInput={(e) => {
                setTextInput(e.currentTarget.value);
                e.currentTarget.style.height = 'auto';
                e.currentTarget.style.height = `${Math.max(40, e.currentTarget.scrollHeight)}px`;
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Type, paste, or drop files..."
            autocomplete="off"
            spellcheck={false}
            disabled={isUploading() || props.gettingResponse}
          ></textarea>

          <div class="flex items-center gap-1 self-end">
             <button
              type="button"
              title="Attach file"
              onClick={() => fileInputRef?.click()}
              class="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              disabled={isUploading() || props.gettingResponse}
            >
              <i class="fas fa-paperclip"></i>
            </button>

             <Show
              when={props.gettingResponse}
              fallback={
                <Show
                  when={textInput().trim() === "" && content().length === 0}
                  fallback={
                    <button
                      type="button"
                      class="rounded-full p-2 text-gray-600 bg-gray-100 hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors min-w-[40px] h-[40px] flex items-center justify-center"
                      onClick={handleSubmit}
                    >
                      <i class="fas fa-paper-plane"></i>
                    </button>
                  }
                >
                  <button
                    type="button"
                    title="Start listening"
                    class="rounded-full p-2 text-gray-600 bg-gray-100 hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors min-w-[36px] h-[36px] flex items-center justify-center"
                    onClick={() => props.setIsListening(true)}
                    disabled={isUploading()}
                  >
                    <WaveIcon />
                  </button>
                </Show>
              }
            >
              <button
                type="button"
                title="Stop response"
                class="rounded-full p-2 text-red-600 bg-gray-100 hover:bg-red-200 dark:text-red-400 dark:bg-gray-700 dark:hover:bg-red-900/50 transition-colors min-w-[36px] h-[36px] flex items-center justify-center"
                onClick={props.handleStopRequest}
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
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
