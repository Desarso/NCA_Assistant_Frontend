import { Component, createEffect, createSignal, onMount } from "solid-js";
import Prism from "prismjs";
import { PrismaCache } from "../utils/memory_cache";


const HOST = import.meta.env.VITE_CHAT_HOST;

 

interface CustomPreProps {
  children: any;
}

const CustomPre: Component<CustomPreProps> = (props) => {
  const [copied, setCopied] = createSignal(false);
  const [detectedLanguage, setDetectedLanguage] = createSignal("");
  const [preElement, setPreElement] = createSignal<HTMLPreElement | null>(null);

  const preRef = (el: HTMLPreElement) => {
    setPreElement(el);
    // Set up mutation observer to detect class changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "attributes" && mutation.attributeName === "class") {
          const codeElement = el.querySelector("code");
          if (codeElement) {
            const langClass = codeElement.className;
            const lang = langClass.replace("language-", "");
            if (lang && lang !== detectedLanguage()) {
              setDetectedLanguage(lang);
              // console.log(`Language class detected: ${lang}, loading language...`);
              PrismaCache.loadLanguage(lang);
            }
          }
        }
      });
    });
    
    observer.observe(el, { attributes: true, subtree: true, attributeFilter: ["class"] });
  };
  
  const language = () => props.children?.props?.className?.replace("language-", "") || "";

  onMount(() => {
    const initialLang = language();
    setDetectedLanguage(initialLang);
    if (initialLang && !PrismaCache.has(initialLang)) {
      PrismaCache.loadLanguage(initialLang); 
    }
  });

  createEffect(() => {
    const currentLanguage = detectedLanguage();
    if (currentLanguage && !PrismaCache.has(currentLanguage)) {
      PrismaCache.loadLanguage(currentLanguage);
    }
  });

  const handleCopy = () => {
    const codeElement = preElement()?.querySelector("code");
    const textToCopy = codeElement?.textContent || "";
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div class="relative bg-gray-100 border border-gray-300 rounded-lg my-4 dark:bg-gray-800 dark:border-gray-600 p-0 m-0 ">
      <button
        onClick={handleCopy}
        class="absolute top-2 right-2 text-gray-600 text-xs p-2 rounded hover:text-gray-800 transition flex items-center gap-1 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class={`icon icon-tabler icons-tabler-outline icon-tabler-copy transition-all duration-200 ${
            copied() ? "scale-75" : "scale-100"
          }`}
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z" />
          <path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" />
        </svg>
        <span
          class={`transition-all duration-200 ${
            copied() ? "text-sm" : "text-xs"
          } dark:text-gray-400`}
        >
          {copied() ? "Copied!" : "Copy"}
        </span>
      </button>
      <pre ref={preRef} class="overflow-x-auto dark:text-gray-100 p-4 whitespace-pre-wrap break-words !rounded-lg !m-0 scrollbar">
        {props.children}
      </pre>
    </div>
  );
};

export default CustomPre;
  