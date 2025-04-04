import { ContentItem } from "../models/models";
import { Component, createMemo, For, Show } from "solid-js";
import {isContentItemArray } from '../utils/utils';


export default function UserMessage(props: {
    content: string | ContentItem[] | { name: string };
  }) {
    // Memoize the content to prevent re-renders
    const memoizedContent = createMemo(() => props.content);
  
    const renderContent = () => {
      const content = memoizedContent();
  
      if (isContentItemArray(content)) {
        return (
          <For each={content}>
            {(item) => (
              <Show
                when={typeof item.content === "string"}
                fallback={
                  <Show
                    when={
                      typeof item.content === "object" &&
                      item.content !== null &&
                      "kind" in item.content &&
                      item.content.kind === "image-url"
                    }
                  >
                    <div class="flex justify-end">
                      <img
                        src={
                          typeof item.content === "object" &&
                          item.content !== null &&
                          "url" in item.content
                            ? (item.content.url as string)
                            : ""
                        }
                        alt="Uploaded content"
                        class="h-80 w-80 object-cover rounded-xl shadow-lg hover:shadow-xl transition-shadow mt-4 ml-4 mr-4"
                      />
                    </div>
                  </Show>
                }
              >
                <div class="text-base leading-relaxed m-2">
                  {item.content as string}
                </div>
              </Show>
            )}
          </For>
        );
      } else if (typeof content === "string") {
        return <div class="text-base leading-relaxed m-2">{content}</div>;
      } else {
        return (
          <div class="text-base leading-relaxed m-2">
            {JSON.stringify(content)}
          </div>
        );
      }
    };
  
    return <>{renderContent()}</>;
  };