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
      automaticLayout: true, // Enable automatic layout
      minimap: { enabled: false },
      scrollbar: {
        vertical: 'auto', // Enable vertical scrollbar
        horizontal: 'auto', // Enable horizontal scrollbar
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10
      },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      lineNumbers: 'on',
      folding: true,
      fontSize: 14,
      renderWhitespace: 'none',
    });

    editor.onDidChangeModelContent(() => {
      if (props.onInput && editor) {
        props.onInput(editor.getValue());
      }
    });

    onCleanup(() => {
      editor?.dispose();
    });
  });

  createEffect(() => {
    if (editor && editor.getValue() !== props.value) {
      editor.setValue(props.value);
    }
  });

  return (
    <div 
      ref={editorRef} 
      class="w-full rounded-md overflow-hidden" 
      style={{ 
        "min-height": "300px",
        "max-height": "600px",
        "height": "500px"
      }}
    />
  );
};

export default CodeEditor;