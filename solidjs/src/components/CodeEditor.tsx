import { onMount, createEffect, onCleanup } from 'solid-js';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import './monaco-editor.css';

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

const CodeEditor = (props: { value: string; language?: string; onInput?: (value: string) => void }) => {
  let editorRef: HTMLDivElement | undefined;
  let editor: monaco.editor.IStandaloneCodeEditor | undefined;

  onMount(() => {
    if (!editorRef) return;
    editor = monaco.editor.create(editorRef, {
      value: props.value,
      language: props.language || 'python',
      theme: 'vs-dark',
      automaticLayout: false, // Disable automatic layout since we'll control height manually
      minimap: { enabled: false },
      scrollbar: {
        vertical: 'hidden',
        horizontal: 'hidden',
        verticalScrollbarSize: 0,
        horizontalScrollbarSize: 0
      },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      lineNumbers: 'on',
      folding: true,
      fontSize: 14,
      renderWhitespace: 'none',
    });

    // Function to update editor height to fit content
    const updateEditorHeight = () => {
      if (!editor || !editorRef) return;
      
      const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);
      const lineCount = editor.getModel()?.getLineCount() || 1;
      const contentHeight = lineHeight * lineCount;
      
      // Add some padding for better visual appearance
      const editorHeight = Math.max(contentHeight + 20, 100); // Minimum height of 100px
      
      // Update the container height
      editorRef.style.height = `${editorHeight}px`;
      
      // Layout the editor to fit the new height
      editor.layout({
        width: editorRef.clientWidth,
        height: editorHeight
      });
    };

    editor.onDidChangeModelContent(() => {
      if (props.onInput && editor) {
        props.onInput(editor.getValue());
      }
      // Update height when content changes
      setTimeout(updateEditorHeight, 0);
    });

    // Completely disable Monaco's wheel event handling to allow parent scrolling
    const editorDomNode = editor.getDomNode();
    if (editorDomNode) {
      const preventMonacoScroll = (e: WheelEvent) => {
        // Stop Monaco from handling any wheel events
        e.stopPropagation();
        
        // Manually pass the scroll event to the parent container
        let parent = editorRef?.parentElement;
        while (parent) {
          const computedStyle = window.getComputedStyle(parent);
          const isScrollable = computedStyle.overflowY === 'auto' || 
                              computedStyle.overflowY === 'scroll' || 
                              computedStyle.overflow === 'auto' || 
                              computedStyle.overflow === 'scroll';
          
          if (isScrollable && parent.scrollHeight > parent.clientHeight) {
            parent.scrollBy(0, e.deltaY);
            return;
          }
          parent = parent.parentElement;
        }
        
        // If no scrollable parent found, scroll the document
        document.documentElement.scrollBy(0, e.deltaY);
      };

      editorDomNode.addEventListener('wheel', preventMonacoScroll, { passive: false, capture: true });
    }

    // Initial height setup
    setTimeout(updateEditorHeight, 100);
    setTimeout(updateEditorHeight, 500);

    onCleanup(() => {
      if (editorDomNode) {
        const preventMonacoScroll = (e: WheelEvent) => {
          e.stopPropagation();
          let parent = editorRef?.parentElement;
          while (parent) {
            const computedStyle = window.getComputedStyle(parent);
            const isScrollable = computedStyle.overflowY === 'auto' || 
                                computedStyle.overflowY === 'scroll' || 
                                computedStyle.overflow === 'auto' || 
                                computedStyle.overflow === 'scroll';
            
            if (isScrollable && parent.scrollHeight > parent.clientHeight) {
              parent.scrollBy(0, e.deltaY);
              return;
            }
            parent = parent.parentElement;
          }
          document.documentElement.scrollBy(0, e.deltaY);
        };
        editorDomNode.removeEventListener('wheel', preventMonacoScroll, { capture: true });
      }
      editor?.dispose();
    });
  });

  createEffect(() => {
    if (editor && editor.getValue() !== props.value) {
      editor.setValue(props.value);
      // Update height after setting new value
      setTimeout(() => {
        if (!editor || !editorRef) return;
        
        const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);
        const lineCount = editor.getModel()?.getLineCount() || 1;
        const contentHeight = lineHeight * lineCount;
        const editorHeight = Math.max(contentHeight + 20, 100);
        
        editorRef.style.height = `${editorHeight}px`;
        editor.layout({
          width: editorRef.clientWidth,
          height: editorHeight
        });
      }, 0);
    }
  });

  return (
    <div 
      ref={editorRef} 
      class="w-full rounded-md overflow-hidden" 
      style={{ 
        "min-height": "100px"
      }}
    />
  );
};

export default CodeEditor;