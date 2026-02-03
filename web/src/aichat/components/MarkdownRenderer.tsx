import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import supersub from "remark-supersub";
import CustomPre from "./CustomPre";
import TableRenderer from "./TableRenderer";

interface MarkdownRendererProps {
  children: string;
  isStreaming: boolean;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = (props) => {
  const segments = useMemo(() => {
    const content = props.children || "";
    
    // If no pipes, no tables possible
    if (!content.includes('|')) {
      return [{ type: 'text' as const, content }];
    }

    const lines = content.split('\n');
    const result: Array<{ type: 'text' | 'table'; content: string }> = [];
    let textLines: string[] = [];
    let tableLines: string[] = [];
    let inTable = false;

    for (const line of lines) {
      const trimmed = line.trim();
      const isTableRow = trimmed.startsWith('|') && trimmed.endsWith('|');

      if (isTableRow) {
        if (!inTable) {
          // Save accumulated text before starting table
          if (textLines.length > 0) {
            result.push({ type: 'text', content: textLines.join('\n') });
            textLines = [];
          }
          inTable = true;
        }
        tableLines.push(line);
      } else {
        if (inTable) {
          // Save completed table
          if (tableLines.length > 0) {
            result.push({ type: 'table', content: tableLines.join('\n') });
            tableLines = [];
          }
          inTable = false;
        }
        textLines.push(line);
      }
    }

    // Flush remaining content
    if (tableLines.length > 0) {
      result.push({ type: 'table', content: tableLines.join('\n') });
    }
    if (textLines.length > 0) {
      result.push({ type: 'text', content: textLines.join('\n') });
    }

    return result.length > 0 ? result : [{ type: 'text' as const, content }];
  }, [props.children]);

  return (
    <div className="markdown-renderer">
      {segments.map((segment, idx) =>
        segment.type === 'table' ? (
          <TableRenderer
            key={idx}
            content={segment.content}
            isStreaming={props.isStreaming}
          />
        ) : (
          <ReactMarkdown
            key={idx}
            components={{
              pre: CustomPre as any,
              table: () => null,
              thead: () => null,
              tbody: () => null,
              tr: () => null,
              th: () => null,
              td: () => null
            }}
            remarkPlugins={[remarkGfm, remarkBreaks, supersub]}
            rehypePlugins={[]}
          >
            {segment.content}
          </ReactMarkdown>
        )
      )}
    </div>
  );
};

export default MarkdownRenderer;
