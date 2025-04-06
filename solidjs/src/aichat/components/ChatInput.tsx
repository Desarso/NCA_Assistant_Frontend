import { Component, createSignal, For, Show, onCleanup, onMount } from "solid-js";
import { ContentItem, ImageData } from "../models/models";
import WaveIcon from "./WaveIcon";

const HOST = import.meta.env.VITE_CHAT_HOST;

interface ChatInputProps {
  onSubmit: (content: string | ContentItem[]) => void;
  gettingResponse: boolean;
  handleFileAttachment: () => void;
  setIsListening: (isListening: boolean) => void;
  handleStopRequest: () => void;
}

const isImageData = (content: any): content is ImageData => {
  return typeof content === "object" && "kind" in content && content.kind === "image-url";
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
    
    // Filter for image files
    const imageFiles = files.filter(file => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    
    // Increment the upload counter for each file
    setPendingUploads(prev => prev + imageFiles.length);
    
    // Process each file individually
    for (const file of imageFiles) {
      const blobUrl = URL.createObjectURL(file);
      const uploadingImage: ContentItem = {
        content: {
          url: blobUrl,
          media_type: file.type,
          kind: "image-url",
          isUploading: true,
          serverUrl: "",
        },
        type: "ImageUrl",
        part_kind: "image-url"
      };
      
      // Add the image to the content array
      setContent(prev => [...prev, uploadingImage]);

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
        const serverFileUrl = `https://open-upload.api.gabrielmalek.com/files/${data.id}`;

        // Update the content item with the server URL
        setContent(prev =>
          prev.map(item => {
            if (isImageData(item.content) && item.content.url === blobUrl && item.content.isUploading) {
              return {
                ...item,
                content: {
                  ...item.content,
                  serverUrl: serverFileUrl,
                  isUploading: false,
                }
              };
            }
            return item;
          })
        );
      } catch (error) {
        console.error("Error uploading file:", error);
        
        // Remove the item from content
        setContent(prev =>
          prev.filter(item => !(isImageData(item.content) && item.content.url === blobUrl))
        );
        
        // Clean up the blob URL
        URL.revokeObjectURL(blobUrl);
      } finally {
        // Always decrement the counter when an upload finishes
        setPendingUploads(prev => Math.max(0, prev - 1));
      }
    }
  };

  const handleSubmit = (e?: Event) => {
    e?.preventDefault();

    const hasUploadingImages = content().some(
      item => isImageData(item.content) && item.content.isUploading === true
    );

    if (hasUploadingImages || isUploading()) {
      console.warn("Please wait for all images to finish uploading.");
      return;
    }

    const currentText = textInput().trim();
    const currentContent = content();

    if (currentText || currentContent.length > 0) {
      let submissionData: string | ContentItem[];

      if (currentText && currentContent.length === 0) {
        submissionData = currentText;
      } else {
        // First, filter out any incomplete image uploads
        const validContent = currentContent.filter(item => {
          if (isImageData(item.content)) {
            return item.content.serverUrl && !item.content.isUploading;
          }
          return true;
        });

        // Map content to match exactly what ChatWindow expects
        const mappedContent: ContentItem[] = validContent.map(item => {
          if (isImageData(item.content)) {
            // For images, we need both url and serverUrl to be the same value
            const imageUrl = item.content.serverUrl!;
            return {
              content: {
                url: imageUrl,
                media_type: item.content.media_type,
                kind: "image-url",
                serverUrl: imageUrl
              } as ImageData,
              type: "ImageUrl",
              part_kind: "image-url"
            };
          }
          return {
            content: item.content as string,
            type: "str",
            part_kind: "text"
          };
        });

        if (currentText) {
          mappedContent.push({
            content: currentText,
            type: "str",
            part_kind: "text"
          });
        }

        submissionData = mappedContent;
      }

      props.onSubmit(submissionData);
      setContent([]);
      setTextInput("");
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
    if (isImageData(itemToRemove.content) && itemToRemove.content.url.startsWith('blob:')) {
        URL.revokeObjectURL(itemToRemove.content.url);
    }
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
            <For each={content()}>
              {(item, index) => (
                <div class="relative group">
                  {isImageData(item.content) ? (
                     <div class="relative">
                      <img
                        src={item.content.url}
                        alt="Pasted content"
                        class="h-20 w-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                      />
                      <Show when={item.content.isUploading}>
                        <div class="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                          <div class="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
                        </div>
                      </Show>
                      <Show when={!item.content.isUploading && !item.content.serverUrl && item.content.url.startsWith('blob:')}>
                         <div class="absolute inset-0 bg-red-500/70 rounded-lg flex items-center justify-center text-white" title="Upload failed">
                           <i class="fas fa-exclamation-triangle"></i>
                         </div>
                       </Show>
                      <button
                        type="button"
                        title="Remove"
                        onClick={() => removeContent(index())}
                        class="absolute -top-1 -right-1 bg-red-600 hover:bg-red-700 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div class="bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-1 text-sm">
                       {typeof item.content === 'string' ? item.content : 'Unsupported content'}
                       <button
                        type="button"
                        onClick={() => removeContent(index())}
                        class="ml-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              )}
            </For>
          </div>
        </Show>

        <div class="flex items-end gap-2 p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-blue-500/30">
           <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileSelect}
            class="hidden"
          />

          <textarea
            ref={textInputRef}
            rows="1"
            class="flex-1 bg-transparent px-2 py-1.5 text-sm md:text-base focus:outline-none resize-none overflow-y-auto dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
            style={{ "max-height": "100px" }}
            value={textInput()}
            onInput={(e) => {
                setTextInput(e.currentTarget.value);
                e.currentTarget.style.height = 'auto';
                e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Type message or paste image..."
            autocomplete="off"
            spellcheck={false}
            disabled={isUploading() || props.gettingResponse}
          />

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
                      title="Send message"
                      class="rounded-full p-2 text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors min-w-[36px] h-[36px] flex items-center justify-center"
                      onClick={handleSubmit}
                      disabled={isUploading()}
                    >
                      <i class="fas fa-arrow-up"></i>
                    </button>
                  }
                >
                  <button
                    type="button"
                    title="Start listening"
                    class="rounded-full p-2 text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors min-w-[36px] h-[36px] flex items-center justify-center"
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
