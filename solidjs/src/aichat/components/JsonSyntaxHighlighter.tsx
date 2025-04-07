import { createMemo, onMount, createEffect, createSignal } from 'solid-js';
import Prism from 'prismjs';
import { PrismaCache } from '../utils/memory_cache';
import 'prismjs/components/prism-json';
import 'prismjs/themes/prism.css';

interface JsonSyntaxHighlighterProps {
  content: any;
}

const JsonSyntaxHighlighter = (props: JsonSyntaxHighlighterProps) => {
  const [highlighted, setHighlighted] = createSignal('');

  const formattedContent = createMemo(() => {
    try {
      // If the content is already a string, we assume it's pre-formatted JSON
      if (typeof props.content === 'string') {
        return props.content;
      }
      
      // Otherwise, stringify the object with proper formatting
      return JSON.stringify(props.content, null, 2);
    } catch (e) {
      console.error("Error formatting JSON:", e);
      return String(props.content);
    }
  });

  // Ensure JSON language is loaded and apply highlighting
  onMount(async () => {
    applyHighlighting();
  });

  // Update highlighting when content changes
  createEffect(() => {
    applyHighlighting();
  });

  const applyHighlighting = () => {
    const content = formattedContent();
    if (content) {
      const html = Prism.highlight(content, Prism.languages.json, 'json');
      setHighlighted(html);
    } else {
      setHighlighted('');
    }
  };

  return (
    <pre class="overflow-auto max-h-[400px] rounded-md bg-muted p-2 text-xs scrollbar-visible">
      <code 
        class="language-json"
        innerHTML={highlighted()}
      />
    </pre>
  );
};

export default JsonSyntaxHighlighter; 