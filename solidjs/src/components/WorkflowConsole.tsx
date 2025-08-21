import { Component, createSignal, createEffect, Show, onCleanup } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Square } from 'lucide-solid';
import { HOST } from '@/aichat/utils/utils';

interface WorkflowConsoleProps {
  isVisible: boolean;
  onClose: () => void;
  runOutput: string;
  runError: string;
  runStatus: string;
  isRunning: boolean;
  onStop: () => void;
  onClear: () => void;
  fullScreen?: boolean;
  workflowId?: string; // if provided, enables run history + live view
}

const WorkflowConsole: Component<WorkflowConsoleProps> = (props) => {
  const [consoleRef, setConsoleRef] = createSignal<HTMLDivElement>();
  // Run history + live
  const [runs, setRuns] = createSignal<Array<any>>([]);
  const [selectedRunId, setSelectedRunId] = createSignal<number | null>(null);
  const [internalOutput, setInternalOutput] = createSignal<string>('');
  const [internalError, setInternalError] = createSignal<string>('');
  const [internalStatus, setInternalStatus] = createSignal<string>('');
  const [isLive, setIsLive] = createSignal<boolean>(false);
  let pollTimer: number | null = null;
  let eventSource: EventSource | null = null;

  // Auto-scroll console to bottom
  createEffect(() => {
    const out = internalOutput() || props.runOutput;
    if (consoleRef() && out) {
      setTimeout(() => {
        if (consoleRef()) {
          consoleRef()!.scrollTop = consoleRef()!.scrollHeight;
        }
      }, 100);
    }
  });

  onCleanup(() => {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  });

  const fetchRuns = async () => {
    if (!props.workflowId) return;
    try {
      const { authFetch } = await import('@/lib/utils');
      const res = await authFetch(`${HOST}/api/v1/workflows/${props.workflowId}/runs?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setRuns(data);
        if (data && data.length > 0 && selectedRunId() == null) setSelectedRunId(data[0].id);
      }
    } catch {}
  };

  const fetchRunDetails = async (runId: number) => {
    if (!props.workflowId) return;
    try {
      const { authFetch } = await import('@/lib/utils');
      const res = await authFetch(`${HOST}/api/v1/workflows/${props.workflowId}/runs/${runId}`);
      if (res.ok) {
        const data = await res.json();
        setInternalOutput(data.output || '');
        setInternalError(data.error || '');
        setInternalStatus(data.status || '');
      }
    } catch {}
  };

  const startPolling = (runId: number) => {
    if (pollTimer !== null) clearInterval(pollTimer);
    pollTimer = window.setInterval(() => fetchRunDetails(runId), 1000);
  };

  const stopPolling = () => {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const startLiveSSE = async (runId: number) => {
    stopPolling();
    if (!props.workflowId) return;
    try {
      const { authFetch } = await import('@/lib/utils');
      const urlRes = await authFetch(`${HOST}/api/v1/workflows/${props.workflowId}/runs/${runId}/stream-url`);
      if (!urlRes.ok) return;
      const { stream_url } = await urlRes.json();
      if (eventSource) eventSource.close();
      const sseUrl = `${HOST}/api/v1${stream_url.startsWith('/') ? '' : '/'}${stream_url}`;
      eventSource = new EventSource(sseUrl);
      setInternalOutput('');
      setInternalError('');
      setInternalStatus('running');
      eventSource.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'output') setInternalOutput((p) => p + (msg.data || ''));
          else if (msg.type === 'error') setInternalError((p) => p + (msg.data || ''));
          else if (msg.type === 'status') {
            setInternalStatus(msg.data || '');
            if (msg.data === 'completed') {
              eventSource?.close();
              eventSource = null;
            }
          }
        } catch {}
      };
      eventSource.onerror = () => { eventSource?.close(); eventSource = null; };
    } catch {}
  };

  const stopLiveSSE = () => { if (eventSource) { eventSource.close(); eventSource = null; } };

  createEffect(() => { if (props.isVisible && props.workflowId) fetchRuns(); });

  return (
    <Show when={props.isVisible}>
      <div class={`${props.fullScreen ? 'w-full h-full' : 'w-full md:w-1/2'} flex flex-col ${props.fullScreen ? '' : 'border-l border-border'}`} style={props.fullScreen ? "height: calc(100vh - 200px);" : "max-height: 70vh;"}>
        {/* Console Header */}
        <div class="p-4 border-b border-border bg-muted/30 flex-shrink-0">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="size-3 rounded-full bg-green-500"></div>
              <span class="text-sm font-medium">Console Output</span>
              <Show when={props.workflowId}>
                <div class="flex items-center gap-2 ml-3">
                  <select
                    class="text-xs bg-background border rounded px-2 py-1"
                    value={selectedRunId() ?? ''}
                    onChange={(e) => {
                      const id = Number((e.target as HTMLSelectElement).value);
                      setSelectedRunId(Number.isFinite(id) ? id : null);
                      if (Number.isFinite(id)) {
                        setIsLive(false);
                        stopLiveSSE();
                        startPolling(id);
                        fetchRunDetails(id);
                      }
                    }}
                  >
                    <option value="">Select run…</option>
                    {runs().map((r) => (
                      <option value={r.id}>{`#${r.id} • ${r.status} • ${new Date(r.started_at).toLocaleString()}`}</option>
                    ))}
                  </select>
                  <Button size="sm" variant="ghost" class="text-xs px-2 py-1 h-6" onClick={fetchRuns}>Refresh</Button>
                  <label class="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={isLive()}
                      onChange={async (e) => {
                        const checked = (e.target as HTMLInputElement).checked;
                        setIsLive(checked);
                        const id = selectedRunId();
                        if (!id) return;
                        if (checked) { stopPolling(); await startLiveSSE(id); }
                        else { stopLiveSSE(); startPolling(id); }
                      }}
                    />
                    Live
                  </label>
                </div>
              </Show>
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
              <Show when={props.fullScreen}>
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={props.onClose}
                  class="size-6 p-0"
                >
                  ×
                </Button>
              </Show>
            </div>
          </div>
        </div>

        {/* Console Content */}
        <div ref={setConsoleRef} class="flex-1 overflow-auto bg-black font-mono text-sm min-h-0">
          <pre class="p-4 whitespace-pre-wrap">
            <span class="text-green-400">{internalOutput() || props.runOutput}</span>
            <Show when={props.runError}>
              <span class="text-red-400">{internalError() || props.runError}</span>
            </Show>
          </pre>
        </div>
      </div>
    </Show>
  );
};

export default WorkflowConsole; 