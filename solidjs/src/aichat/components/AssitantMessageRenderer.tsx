import {
  createSignal,
  onMount,
  Show,
  Component,
  createMemo,
  createEffect,
  Accessor,
  For,
} from "solid-js";
import { SolidMarkdown } from "solid-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import supersub from "remark-supersub";
import CustomPre from "./CustomPre";
import { visit, SKIP } from "unist-util-visit";
import type { Plugin } from "unified";
import type { Root, Element, Text } from "hast";
import { ContentItem } from "../models/models";
import morphdom from "morphdom";
import Prism from "prismjs";
interface AssistantMessageProps {
  fullContent: Accessor<string | ContentItem[] | { name: string }>;
  gettingResponse: boolean;
  reasoning?: Accessor<string | undefined>;
}

// Track the last seen content length to only animate new content
const lastSeenContentLengths = new Map<string, number>();

const rehypeWrapWordsInSpans: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(
      tree,
      "text",
      (
        node: Text,
        index: number | undefined,
        parent: Element | Root | undefined
      ) => {
        // Basic validation for index and parent
        if (typeof index !== "number" || !parent || !("children" in parent)) {
          return;
        }

        // Skip if inside unwanted tags like code, pre, or our own spans
        if (parent.type === "element") {
          const tagName = parent.tagName.toLowerCase();
          if (
            tagName === "span" &&
            Array.isArray(parent.properties?.className) &&
            parent.properties.className.includes("streaming-word-fade-in")
          ) {
            return SKIP; // Already wrapped by us
          }
          if (
            tagName === "code" ||
            tagName === "pre" ||
            tagName === "script" ||
            tagName === "style"
          ) {
            return SKIP; // Don't process text inside these specific tags
          }
        }

        const textValue = node.value;
        // Don't process empty or whitespace-only text nodes
        if (!textValue || /^\s*$/.test(textValue)) {
          return;
        }

        // Split the text value into words and whitespace chunks
        const parts = textValue
          .split(/(\s+)/)
          .filter((part) => part.length > 0); // Filter empty strings

        // Create an array of new nodes (spans for words, text nodes for spaces)
        const newNodes: (Element | Text)[] = parts.map(
          (part): Element | Text => {
            if (/^\s+$/.test(part)) {
              // It's whitespace, return a simple Text node
              return { type: "text", value: part };
            } else {
              // It's a word, return a span Element node
              return {
                type: "element",
                tagName: "span",
                properties: { className: ["streaming-word-fade-in"] }, // Class for animation
                children: [{ type: "text", value: part }], // Word text inside span
              };
            }
          }
        );

        // Replace the original text node with the array of new nodes
        // using the spread operator (...)
        parent.children.splice(index, 1, ...newNodes);

        // Important: Return the index + number of nodes inserted - 1
        // This tells visit to continue processing *after* the nodes we just inserted.
        // Otherwise, it might re-process the text nodes inside the new spans.
        return index + newNodes.length; // Correct way to advance the visitor index
        // Returning SKIP here would skip siblings, which is usually not desired.
      }
    );
  };
};

// Helper function to check if content is ContentItem array
function isContentItemArray(
  content: string | ContentItem[] | { name: string }
): content is ContentItem[] {
  return (
    Array.isArray(content) && content.length > 0 && "content" in content[0]
  );
}

// Helper function to render markdown content using SolidMarkdown
const renderMarkdownToHTML = async (
  markdownContent: string,
  container: HTMLElement
): Promise<void> => {
  // Create a temporary div for rendering
  const tempDiv = document.createElement("div");

  try {
    // Import render function from solid-js/web
    const { render } = await import("solid-js/web");

    // Render the markdown content
    const dispose = render(
      () => (
        <SolidMarkdown
          components={{
            pre: CustomPre,
          }}
          children={markdownContent}
          remarkPlugins={[remarkGfm, remarkBreaks, supersub]}
          rehypePlugins={[rehypeWrapWordsInSpans]}
        />
      ),
      tempDiv
    );

    // Copy content to the target container
    const fragment = document.createDocumentFragment();
    while (tempDiv.firstChild) {
      fragment.appendChild(tempDiv.firstChild);
    }

    container.appendChild(fragment);

    // Clean up
    dispose();
  } catch (error) {
    console.error("Error rendering markdown:", error);
    container.textContent = markdownContent; // Fallback to plain text
  }
};

const AssistantMessageRenderer: Component<AssistantMessageProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  let contentRef: HTMLDivElement | undefined;
  let streamingContentRef: HTMLDivElement | undefined;
  let staticContentRef: HTMLDivElement | undefined;

  const [isReasoningOpen, setIsReasoningOpen] = createSignal(false);
  const [instanceId] = createSignal(
    `assistant-${Math.random().toString(36).substring(2, 11)}`
  );
  const [prevContentLength, setPrevContentLength] = createSignal(0);
  const [renderedContentLength, setRenderedContentLength] = createSignal(0);
  const [isInitialRender, setIsInitialRender] = createSignal(true);
  const [lastUpdateTime, setLastUpdateTime] = createSignal(Date.now());
  const [showLoadingAnimation, setShowLoadingAnimation] = createSignal(false);

  // Create proper memoization for content and reasoning
  const content = createMemo(() => props.fullContent());
  const reasoning = createMemo(() =>
    props.reasoning ? props.reasoning() : undefined
  );
  const isStreaming = createMemo(() => props.gettingResponse);

  // Get a safe content length regardless of content type
  const getContentLength = (
    contentValue: string | ContentItem[] | { name: string }
  ): number => {
    if (typeof contentValue === "string") {
      return contentValue.length;
    } else if (Array.isArray(contentValue)) {
      return JSON.stringify(contentValue).length;
    } else {
      return JSON.stringify(contentValue || "").length;
    }
  };

  // Incremental update for streaming content
  createEffect(async () => {
    const currentContent = content();
    const currentLength = getContentLength(currentContent);
    const renderedLength = renderedContentLength();

    // Only process string content and when streaming
    if (typeof currentContent !== "string" || !streamingContentRef) return;

    // Skip if no new content to render
    if (currentLength <= renderedLength && renderedLength > 0) return;

    // Update last update time
    setLastUpdateTime(Date.now());
    setShowLoadingAnimation(false);

    // Create two temporary containers to find differences in rendered HTML
    const currentContainer = document.createElement("div");
    const newContentContainer = document.createElement("div");

    // Render markdown to both containers
    await renderMarkdownToHTML(
      currentContent.substring(0, renderedLength),
      currentContainer
    );
    await renderMarkdownToHTML(currentContent, newContentContainer);

    // Use morphdom to update the streaming content
    morphdom(streamingContentRef, newContentContainer);

    Prism.highlightAll();

    // Always update rendered length to track progress
    setRenderedContentLength(currentLength);
  });

  // Check for streaming pauses
  let pauseCheckInterval: number | undefined;

  onMount(() => {
    return () => {
      if (pauseCheckInterval) {
        clearInterval(pauseCheckInterval);
      }
    };
  });

  createEffect(() => {
    // Clear any existing interval
    if (pauseCheckInterval) {
      clearInterval(pauseCheckInterval);
    }

    if (!isStreaming()) {
      setShowLoadingAnimation(false);
      return;
    }

    // Start a new interval to check for pauses
    pauseCheckInterval = window.setInterval(() => {
      const now = Date.now();
      setShowLoadingAnimation(now - lastUpdateTime() > 500);
    }, 100);
  });

  // Update prevContentLength for animation purposes
  createEffect(() => {
    const currentContent = content();
    const currentLength = getContentLength(currentContent);
    const prevLength = prevContentLength();

    // Only update if this is a streaming message and content is longer
    if (isStreaming() && currentLength > prevLength) {
      // Delay the update to allow animation to be applied
      setTimeout(() => {
        setPrevContentLength(currentLength);
      }, 100);
    } else if (!isStreaming()) {
      // Reset when streaming stops
      setPrevContentLength(currentLength);
    }
  });


  return (
    <div ref={containerRef} class="assistant-message-container p-1">
      <Show when={reasoning()}>
        <div class="mb-4">
          <button
            onClick={() => setIsReasoningOpen(!isReasoningOpen())}
            class="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class={`h-4 w-4 transform transition-transform ${
                isReasoningOpen() ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 9l-7 7-7-7"
              />
            </svg>
            <span
              class={
                isStreaming() && getContentLength(content()) === 0
                  ? "wave-text"
                  : ""
              }
            >
              {isStreaming() && getContentLength(content()) === 0
                ? "thinking..."
                : "View Reasoning"}
            </span>
          </button>
          <Show when={isReasoningOpen()}>
            <div class="mt-2 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <SolidMarkdown
                components={{
                  pre: CustomPre,
                }}
                children={reasoning() as string}
                remarkPlugins={[remarkGfm, remarkBreaks, supersub]}
                rehypePlugins={[]}
              />
            </div>
          </Show>
        </div>
      </Show>

      {/* Render markdown content with conditional animation */}
      <div class="message-content-wrapper">
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .word-fade-in {
            animation: fadeIn 0.3s ease-out forwards;
          }
          .streaming-content.markdown-content,
          .markdown-content {
            transition: opacity 0.1s ease-out;
          }
          .loading-dots {
            display: inline-block;
            margin-left: 4px;
          }
          .loading-dots span {
            display: inline-block;
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background-color: currentColor;
            margin-right: 2px;
            animation: loading-dots 1.4s infinite ease-in-out both;
          }
          .loading-dots span:nth-child(1) {
            animation-delay: -0.32s;
          }
          .loading-dots span:nth-child(2) {
            animation-delay: -0.16s;
          }
          @keyframes loading-dots {
            0%, 80%, 100% { transform: scale(0); }
            40% { transform: scale(1); }
          }
        `}</style>

        {/* Content for streaming updates with incremental rendering */}
        <Show when={isStreaming() && typeof content() === "string"}>
          <div
            ref={streamingContentRef}
            class="streaming-content markdown-content"
          ></div>
          <Show when={showLoadingAnimation()}>
            <span class="loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </Show>
        </Show>

        {/* Content for static display (non-streaming) */}
        <Show when={!isStreaming() && typeof content() === "string"}>
          <div ref={staticContentRef} class="markdown-content">
            <SolidMarkdown
              components={{
                pre: CustomPre,
              }}
              children={String(content())}
              remarkPlugins={[remarkGfm, remarkBreaks, supersub]}
            />
          </div>
        </Show>

        {/* Handle non-string content types */}
        <Show
          when={!isContentItemArray(content()) && typeof content() !== "string"}
        >
          <div>{JSON.stringify(content())}</div>
        </Show>

        <Show when={isContentItemArray(content())}>
          <div>
            <For each={content() as unknown as ContentItem[]}>
              {(item: ContentItem) => (
                <div>
                  {typeof item.content === "string"
                    ? item.content
                    : JSON.stringify(item.content)}
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default AssistantMessageRenderer;
