import {
  Accessor,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onMount,
} from "solid-js";
import { Message } from "../models/models";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import JsonSyntaxHighlighter from "./JsonSyntaxHighlighter";
import { useTheme } from "@/lib/theme-provider";

function ToolMessageRenderer({
  message,
  messages,
  index,
}: {
  message: Message;
  messages: Accessor<Message[]>;
  index: Accessor<number>;
}) {
  const [isLastMessage, setIsLastMessage] = createSignal<boolean>(false);
  const [isToolCall, setIsToolCall] = createSignal<boolean>(false);
  const [isToolResult, setIsToolResult] = createSignal<boolean>(false);
  const prevMessage = createMemo(() => messages()[index() - 1]);

  createEffect(() => {
    if (index() === messages().length - 1) {
      setIsLastMessage(true);
    }else{
        setIsLastMessage(false);
    }
  });

  onMount(() => {
    if (message.role === "tool_call") {
      setIsToolCall(true);
    }
    if (message.role === "tool_result") {
      setIsToolResult(true);
    }
  });

  return (
    <>
      <Show when={isToolCall() && isLastMessage()}>
        <div class="md:max-w-[900px] w-full flex justify-start min-h-full">
          <span class="wave-text ml-5 pl-4">
            {((message.content as any)?.name as string) || "processing..."}
          </span>
        </div>
      </Show>
      <Show when={isToolResult()}>
        {(() => {
          const rawToolName =
            (prevMessage()?.content as any)?.name || "Unknown Tool";
          const formattedToolName = rawToolName
            .split("_")
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");

          const toolCallContent = prevMessage()?.content;
          const toolResultContent = message.content;
          const { theme } = useTheme();
          const [isMounted, setIsMounted] = createSignal(false);
          const [isOpen, setIsOpen] = createSignal(false);

          onMount(() => {
            // Set mounted to true after a frame to trigger transition
            requestAnimationFrame(() => setIsMounted(true));
          });

          return (
            <div
              class={`transition-opacity duration-500 ease-in-out ${
                isMounted() ? "opacity-100" : "opacity-0"
              } md:max-w-[900px] w-full px-4 my-2`}
            >
              <div class="w-full rounded-md border">
                <button
                  class="text-sm font-semibold flex items-center justify-between w-full p-3 border rounded-md bg-gradient-to-r from-primary/5 to-primary/10 hover:from-primary/10 hover:to-primary/15 shadow-sm data-[state=open]:rounded-b-none data-[state=open]:border-primary"
                  onClick={() => setIsOpen(!isOpen())}
                  aria-expanded={isOpen()}
                  data-state={isOpen() ? "open" : "closed"}
                >
                  <div class="flex items-center space-x-2">
                    <div class="w-6 h-6 rounded-full bg-primary-foreground  flex items-center justify-center text-white shadow-sm ring-2 dark:ring-white/20  ring-black/20">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={`${theme() === "dark" ? "white" : "black"}`}
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                      </svg>
                    </div>
                    <span class="text-primary font-medium">
                      {formattedToolName}
                    </span>
                  </div>
                  <div class="flex items-center">
                    <div class="px-2 py-0.5 text-xs rounded-full bg-accent text-primary font-medium">
                      Completed
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class={`size-4 shrink-0 transition-transform duration-200 ml-2 ${
                        isOpen() ? "rotate-180" : ""
                      }`}
                    >
                      <path d="M6 9l6 6l6 -6" />
                    </svg>
                  </div>
                </button>
                <div
                  class="overflow-hidden transition-all duration-300 ease-in-out border-t-0 rounded-b-md bg-gradient-to-b from-primary/5 to-transparent shadow-sm"
                  style={{
                    "max-height": isOpen() ? "1000px" : "0",
                    opacity: isOpen() ? "1" : "0",
                    visibility: isOpen() ? "visible" : "hidden",
                    border: isOpen() ? "1px solid var(--border)" : "none",
                    "border-top": "none",
                  }}
                >
                  <div class="p-3 space-y-2">
                    <div>
                      <h4 class="text-xs font-medium text-primary/80 mb-1">
                        Call Details:
                      </h4>
                      <JsonSyntaxHighlighter content={toolCallContent} />
                    </div>
                    <div>
                      <h4 class="text-xs font-medium text-primary/80 mb-1">
                        Result:
                      </h4>
                      <JsonSyntaxHighlighter content={toolResultContent} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </Show>

      <Show when={isToolResult() && isLastMessage()}>
        <div class="md:max-w-[900px] w-full flex justify-start min-h-full">
          <span class="wave-text ml-5 pl-4">processing...</span>
        </div>
      </Show>
    </>
  );
}

export default ToolMessageRenderer;
