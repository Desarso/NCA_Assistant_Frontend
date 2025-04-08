import {
  createSignal,
  onMount,
  Show,
  Component,
  createMemo,
  createEffect,
  Accessor,
  For,
  on,
  onCleanup,
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
  isLast: Accessor<boolean>;
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
    Array.isArray(content) && 
    content.length > 0 && 
    content.every(item => typeof item === 'object' && 'content' in item)
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
  const [bufferedContentLength, setBufferedContentLength] = createSignal(0);
  const [isInitialRender, setIsInitialRender] = createSignal(true);
  const [lastUpdateTime, setLastUpdateTime] = createSignal(Date.now());
  const [showLoadingAnimation, setShowLoadingAnimation] = createSignal(false);
  const [staticContentTimer, setStaticContentTimer] = createSignal<{
    startTime: number;
    timerId: number | undefined;
  } | null>(null);

  // Create proper memoization for content and reasoning
  const content = createMemo(() => props.fullContent());
  const reasoning = createMemo(() =>
    props.reasoning ? props.reasoning() : undefined
  );
  const isStreaming = createMemo(() => props.gettingResponse);
  const [showingStaticContent, setShowingStaticContent] = createSignal(
    !isStreaming()
  );

  // Queue for incoming content diffs
  const [pendingDiffs, setPendingDiffs] = createSignal<string[]>([]);
  // Signal to track if processing is currently active
  const [isProcessing, setIsProcessing] = createSignal(false);

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

  createEffect(() => {
    if (renderedContentLength() === bufferedContentLength() &&
      pendingDiffs().length === 0 &&
      !isStreaming()
    ) {
      setTimeout(() => {
        setShowingStaticContent(true);
        //await 100ms to ensure the content is fully rendered
        setTimeout(() => {
          Prism.highlightAll();
        }, 100);
      }, 200);
    }
    if (!props.isLast()) {
      setShowingStaticContent(false);
    }
  });
  // Effect 1: Listen for content changes and queue new diffs
  createEffect(
    on(content, (currentContent) => {
      // Only process string content and when streaming
      // Also check if the streaming ref is available (it might not be on initial render/setup)
      if (
        typeof currentContent !== "string" ||
        !streamingContentRef ||
        !isStreaming()
      ) {
        // If not streaming anymore, ensure queue is cleared and processing stops
        setPendingDiffs([]);
        // Consider if setIsProcessing(false) is needed here, depends on exact stop logic
        return;
      }

      const currentLength = currentContent.length;
      const previouslyKnownLength = bufferedContentLength(); // Read before potential

      // Calculate the difference
      if (currentLength > previouslyKnownLength) {
        const diff = currentContent.substring(previouslyKnownLength);
        if (diff.length > 0) {
          // Add the new diff to the queue
          setPendingDiffs(pendingDiffs().concat(diff));
          // Update timestamp and hide loading only when a new diff is actually detected
          setBufferedContentLength(currentLength);
          setLastUpdateTime(Date.now());
          setShowLoadingAnimation(false);
        }
      } else if (currentLength < previouslyKnownLength) {
        // Handle potential content reset? Should not happen in normal streaming.
        console.warn("Content length decreased unexpectedly!");
        setBufferedContentLength(currentLength);
        setPendingDiffs([]); // Clear queue on reset
      }
      // Note: We don't update renderedContentLength here anymore.
      // It will be updated by the processing effect after rendering.
    })
  );

  // Effect 2: Process the queue when items are available and not already processing
  createEffect(
    on(
      [pendingDiffs, isProcessing],
      async ([diffs, processing]) => {
        // Exit if queue is empty OR if already processing
        if (diffs.length === 0 || processing) {
          return;
        }

        // Ensure the streaming container exists before proceeding
        if (!streamingContentRef) {
          console.warn("Streaming content ref not available for processing.");
          return; // Cannot process without the target element
        }

        setIsProcessing(true); // Lock processing

        // Take all diffs currently in the queue
        const diffsToProcess = diffs;
        const flatDiffs = diffsToProcess.join("");
        setPendingDiffs([]); // Clear the queue *before* async work

        // Combine all pending diffs into one chunk

        const currentRenderedLength = renderedContentLength(); // Length before this batch
        const latestFullContent =
          typeof content() === "string" ? (content() as string) : "";

        // --- Original Character-by-Character (Less Efficient) ---
        let newSubstring = latestFullContent.substring(
          0,
          currentRenderedLength
        );

        try {
          newSubstring += flatDiffs;
          const tempContainer = document.createElement("div");
          await renderMarkdownToHTML(newSubstring, tempContainer);
          morphdom(streamingContentRef, tempContainer);
          setRenderedContentLength(newSubstring.length); // Use innerHTML

          Prism.highlightAllUnder(streamingContentRef); // Target highlighting
        } catch (error) {
          console.error("Error during streaming render char-by-char:", error);
        } finally {
          setIsProcessing(false); // Unlock processing
        }
      },
      { defer: true }
    )
  ); // Use defer: true to prevent running on initial mount before content arrives

  // Effect 3: Reliably switch to static content view only when truly finishe

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
    } else {
      setShowingStaticContent(false);
    }

    // Start a new interval to check for pauses
    pauseCheckInterval = window.setInterval(() => {
      const now = Date.now();
      setShowLoadingAnimation(now - lastUpdateTime() > 500);
    }, 100);
  });

  // Ensure cleanup on unmount
  onCleanup(() => {
    if (pauseCheckInterval) {
      clearInterval(pauseCheckInterval);
    }

    // Also clear any static content timer
    const currentTimer = staticContentTimer();
    if (currentTimer && currentTimer.timerId !== undefined) {
      clearTimeout(currentTimer.timerId);
    }
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
      }, 2000);
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
        {/* Content for streaming updates with incremental rendering */}
        <Show when={(!showingStaticContent() && typeof content() === "string") && props.isLast()}>
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
        <Show
          when={
            (showingStaticContent() && typeof content() === "string") ||
            !props.isLast()
          }
        >
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
          <div class="debug-content">
            <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded-md overflow-auto">
              {`Content type: ${typeof content()}\nValue: ${JSON.stringify(content(), null, 2)}`}
            </pre>
            <div class="mt-2">{JSON.stringify(content())}</div>
          </div>
        </Show>

        <Show when={isContentItemArray(content())}>
          <div>
            <For each={content() as ContentItem[]}>
              {(item) => (
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
