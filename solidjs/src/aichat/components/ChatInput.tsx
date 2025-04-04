import { Component, createSignal, For, Show } from "solid-js";
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

const ChatInput: Component<ChatInputProps> = (props) => {
  const [content, setContent] = createSignal<ContentItem[]>([]);
  const [textInput, setTextInput] = createSignal("");
  const [isDragging, setIsDragging] = createSignal(false);
  let fileInputRef: HTMLInputElement | undefined;

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
  };

  // Type guards
  const isImageData = (content: any): content is ImageData => {
    return typeof content === "object" && "kind" in content && content.kind === "image-url";
  };

  const handleFiles = async (files: File[]) => {
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        // Create blob URL for preview
        const blobUrl = URL.createObjectURL(file);

        // Add content with blob URL and uploading state
        const uploadingImage: ContentItem = {
          content: {
            url: blobUrl,
            media_type: file.type,
            kind: "image-url",
            isUploading: true,
            serverUrl: "", // Will store the server URL after upload
          },
          type: "ImageUrl",
          part_kind: "image-url"
        };

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

          // Update content with server URL but keep the blob URL for preview
          setContent(prev =>
            prev.map(item => {
              if (isImageData(item.content) && item.content.url === blobUrl) {
                const updatedContent: ImageData = {
                  ...item.content,
                  serverUrl: `https://open-upload.api.gabrielmalek.com/files/${data.id}`,
                  isUploading: false,
                };
                return {
                  content: updatedContent,
                  type: "ImageUrl",
                  part_kind: "image-url"
                };
              }
              return item;
            })
          );
        } catch (error) {
          console.error("Error uploading file:", error);
          // Remove the content on error
          setContent(prev =>
            prev.filter(
              item => !(isImageData(item.content) && item.content.url === blobUrl)
            )
          );
          URL.revokeObjectURL(blobUrl);
        }
      }
    }
  };

  const handleSubmit = (e: Event) => {
    e.preventDefault();

    // Check if any images are still uploading
    const hasUploadingImages = content().some(
      item => isImageData(item.content) && item.content.isUploading === true
    );

    if (hasUploadingImages) {
      console.error("Please wait for all images to finish uploading");
      return;
    }

    if (textInput().trim() || content().length > 0) {
      // For text-only messages
      if (textInput().trim() && content().length === 0) {
        props.onSubmit(textInput().trim());
      } else {
        // For mixed content or images only
        const newContent = [...content()];
        if (textInput().trim()) {
          newContent.push({
            content: textInput().trim(),
            type: "str",
            part_kind: "text"
          });
        }

        // Filter out invalid content
        const validContent = newContent.filter((item): item is ContentItem => {
          if (isImageData(item.content) && !item.content.serverUrl) {
            console.error("Missing serverUrl for image:", item);
            return false;
          }
          return true;
        });

        if (validContent.length === 0) {
          console.error("No valid content to send");
          return;
        }

        props.onSubmit(validContent);
      }
      // Clear local state only after successful submission
      setContent([]);
      setTextInput("");
    }
  };

  const removeContent = (index: number) => {
    const item = content()[index];
    if (isImageData(item.content) && item.content.isUploading) {
      URL.revokeObjectURL(item.content.url);
    }
    setContent(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <form onSubmit={handleSubmit} class="flex flex-col gap-2">
      <div
        class={`flex-1 ${
          isDragging()
            ? "border-2 border-dashed border-blue-500 bg-blue-50 dark:bg-blue-900/20"
            : ""
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Show when={content().length > 0}>
          <div class="flex flex-wrap gap-2 mb-2">
            <For each={content()}>
              {(item, index) => (
                <div class="relative group">
                  {typeof item.content === "string" ? (
                    <div class="bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-1 text-sm">
                      {item.content}
                      <button
                        type="button"
                        onClick={() => removeContent(index())}
                        class="ml-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div class="relative">
                      <img
                        src={item.content.serverUrl || item.content.url}
                        alt="Uploaded content"
                        class="h-20 w-20 object-cover rounded-lg"
                      />
                      <Show when={item.content.isUploading}>
                        <div class="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                          <div class="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
                        </div>
                      </Show>
                      <button
                        type="button"
                        onClick={() => removeContent(index())}
                        class="absolute top-0 right-0 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
        <div class="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            class="hidden"
          />
          <input
            class="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-4 py-2 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:text-gray-200"
            type="text"
            value={textInput()}
            onInput={(e) => setTextInput(e.currentTarget.value)}
            placeholder="Type your message here..."
            autocomplete="off"
            spellcheck={false}
          />
          <div class="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef?.click()}
              class="rounded-full p-2 text-gray-500 bg-gray-50 hover:bg-gray-100 dark:text-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700"
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
                      class="rounded-full p-2 text-gray-600 bg-gray-100 hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors min-w-[40px] flex items-center justify-center"
                      onClick={handleSubmit}
                    >
                      <i class="fas fa-paper-plane"></i>
                    </button>
                  }
                >
                  <button
                    type="button"
                    class="rounded-full p-2 text-gray-600 bg-gray-100 hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors min-w-[40px] flex items-center justify-center"
                    onClick={() => props.setIsListening(true)}
                  >
                    <WaveIcon />
                  </button>
                </Show>
              }
            >
              <button
                type="button"
                class="rounded-full p-2 text-red-600 bg-gray-100 hover:bg-gray-200 dark:text-red-400 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors min-w-[40px] flex items-center justify-center"
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
    </form>
  );
};

export default ChatInput;
