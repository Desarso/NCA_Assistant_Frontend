import { Component, createSignal, createEffect, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Square } from 'lucide-solid';

interface WorkflowConsoleProps {
  isVisible: boolean;
  onClose: () => void;
  runOutput: string;
  runError: string;
  runStatus: string;
  isRunning: boolean;
  onStop: () => void;
  onClear: () => void;
}

const WorkflowConsole: Component<WorkflowConsoleProps> = (props) => {
  const [consoleRef, setConsoleRef] = createSignal<HTMLDivElement>();

  // Auto-scroll console to bottom
  createEffect(() => {
    if (consoleRef() && props.runOutput) {
      setTimeout(() => {
        if (consoleRef()) {
          consoleRef()!.scrollTop = consoleRef()!.scrollHeight;
        }
      }, 100);
    }
  });

  return (
    <Show when={props.isVisible}>
      <div class="w-full md:w-1/2 flex flex-col border-l border-border" style="max-height: 70vh;">
        {/* Console Header */}
        <div class="p-4 border-b border-border bg-muted/30 flex-shrink-0">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="size-3 rounded-full bg-green-500"></div>
              <span class="text-sm font-medium">Console Output</span>
              <Show when={props.runStatus}>
                <span class={`text-xs px-2 py-1 rounded-full ${
                  props.runStatus === 'success' || props.runStatus === 'completed' 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : props.runStatus === 'error'
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    : props.runStatus === 'running'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                    : props.runStatus === 'stopped'
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                }`}>
                  {props.runStatus}
                </span>
              </Show>
              <Show when={props.isRunning}>
                <div class="flex items-center gap-2 text-yellow-400">
                  <div class="size-2 rounded-full bg-yellow-400 animate-pulse"></div>
                  <span class="text-xs">Executing...</span>
                </div>
              </Show>
            </div>
            <div class="flex items-center gap-2">
              <Show when={props.isRunning}>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={props.onStop}
                  class="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white border-red-600"
                >
                  <Square class="size-4 fill-current" />
                  Stop
                </Button>
              </Show>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={props.onClear}
                class="text-xs px-2 py-1 h-6"
              >
                Clear
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={props.onClose}
                class="size-6 p-0"
              >
                ×
              </Button>
            </div>
          </div>
        </div>

        {/* Console Content */}
        <div ref={setConsoleRef} class="flex-1 overflow-auto bg-black font-mono text-sm min-h-0">
          <pre class="p-4 whitespace-pre-wrap">
            <span class="text-green-400">{props.runOutput}</span>
            <Show when={props.runError}>
              <span class="text-red-400">{props.runError}</span>
            </Show>
          </pre>
        </div>
      </div>
    </Show>
  );
};

export default WorkflowConsole; 