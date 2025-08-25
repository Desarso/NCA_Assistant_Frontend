import { Component, Show, Accessor, createMemo, createSignal, createEffect } from "solid-js";
import { SolidMarkdown } from "solid-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import supersub from "remark-supersub";
import CustomPre from "./CustomPre";
import { ContentItem } from "../models/models";
import Prism from "prismjs";

interface AssistantMessageProps {
  fullContent: Accessor<string | ContentItem[] | { name: string }>;
  gettingResponse: boolean;
  reasoning?: Accessor<string | undefined>;
  isLast: Accessor<boolean>;
}

// Helper: detect array of content items
function isContentItemArray(
  content: string | ContentItem[] | { name: string }
): content is ContentItem[] {
  return Array.isArray(content);
}

const AssistantMessageRenderer: Component<AssistantMessageProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  const [isReasoningOpen, setIsReasoningOpen] = createSignal(false);

  const content = createMemo(() => props.fullContent());
  const reasoning = createMemo(() => (props.reasoning ? props.reasoning() : undefined));

  createEffect(() => {
    if (containerRef) {
      Prism.highlightAllUnder(containerRef);
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
              class={`h-4 w-4 transform transition-transform ${isReasoningOpen() ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
            <span>{isReasoningOpen() ? "Hide Reasoning" : "View Reasoning"}</span>
          </button>
          <Show when={isReasoningOpen()}>
            <div class="mt-2 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <SolidMarkdown
                components={{ pre: CustomPre }}
                children={(reasoning() as string) || ""}
                remarkPlugins={[remarkGfm, remarkBreaks, supersub]}
                rehypePlugins={[]}
              />
            </div>
          </Show>
        </div>
      </Show>

      <div class="markdown-content">
        <Show when={typeof content() === "string"}>
          <SolidMarkdown
            components={{ pre: CustomPre }}
            children={String(content() || "")}
            remarkPlugins={[remarkGfm, remarkBreaks, supersub]}
            rehypePlugins={[]}
          />
        </Show>

        <Show when={isContentItemArray(content())}>
          <div>
            {(content() as ContentItem[]).map((item) => (
              <div>{typeof item.content === "string" ? item.content : JSON.stringify(item.content)}</div>
            ))}
          </div>
        </Show>

        <Show when={typeof content() !== "string" && !isContentItemArray(content())}>
          <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded-md overflow-auto">
            {JSON.stringify(content(), null, 2)}
          </pre>
        </Show>

        <Show when={props.gettingResponse && props.isLast()}>
          <span class="loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </Show>
      </div>
    </div>
  );
};

export default AssistantMessageRenderer;