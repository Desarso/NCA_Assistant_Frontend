import { useEffect, useState, useMemo } from 'react';
import Prism from 'prismjs';
import { PrismaCache } from '../utils/memory_cache';
import 'prismjs/components/prism-json';
import 'prismjs/themes/prism.css';

interface JsonSyntaxHighlighterProps {
  content: any;
}

const JsonSyntaxHighlighter: React.FC<JsonSyntaxHighlighterProps> = ({ content }) => {
  const [highlighted, setHighlighted] = useState('');

  const formattedContent = useMemo(() => {
    try {
      // If the content is already a string, we assume it's pre-formatted JSON
      if (typeof content === 'string') {
        return content;
      }
      
      // Otherwise, stringify the object with proper formatting
      return JSON.stringify(content, null, 2);
    } catch (e) {
      console.error("Error formatting JSON:", e);
      return String(content);
    }
  }, [content]);

  // Ensure JSON language is loaded and apply highlighting
  useEffect(() => {
    const applyHighlighting = async () => {
      // Ensure JSON language is loaded
      await PrismaCache.loadLanguage('json');
      
      if (formattedContent) {
        const html = Prism.highlight(formattedContent, Prism.languages.json, 'json');
        setHighlighted(html);
      } else {
        setHighlighted('');
      }
    };

    applyHighlighting();
  }, [formattedContent]);

  return (
    <pre className="overflow-auto max-h-[400px] rounded-md bg-muted p-2 text-xs scrollbar-visible">
      <code 
        className="language-json"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </pre>
  );
};

export default JsonSyntaxHighlighter;
