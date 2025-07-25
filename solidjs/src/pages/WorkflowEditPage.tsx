import { Component, createSignal, createEffect, onMount, onCleanup, Show } from 'solid-js';
import { useNavigate, useParams } from '@solidjs/router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowLeft, Play, Terminal, Square } from 'lucide-solid';
import { authFetch } from '@/lib/utils';
import CodeEditor from '@/components/CodeEditor';
import { WorkflowCache } from '@/lib/workflow-cache';
import WorkflowConsole from '@/components/WorkflowConsole';
import WorkflowSchedules from '@/components/WorkflowSchedules';
import WorkflowSharing from '@/components/WorkflowSharing';

const HOST = import.meta.env.VITE_API_HOST || 'http://localhost:8000';

interface Workflow {
  id: string;
  title: string;
  description?: string;
  code: string;
  status: string;
  last_run?: string;
  last_run_status?: string;
  created_at: string;
  updated_at: string;
}

interface WorkflowSchedule {
  id: number;
  cron_expression: string;
  is_active: boolean;
  timezone: string;
  next_run?: string;
  created_at: string;
  updated_at: string;
  workflow_id: string;
}

interface SharedUser {
  id: string;
  email: string;
  shared_at: string;
}

interface User {
  id: string;
  email: string;
  displayName?: string;
}

const WorkflowEditPage: Component = () => {
  // Force scrolling by overriding Layout constraints only for workflow edit page
  const style = document.createElement('style');
  style.textContent = `
    .workflow-edit-page body { overflow-y: auto !important; }
    .workflow-edit-page main { overflow-y: auto !important; height: auto !important; }
    .workflow-edit-page main > div { overflow-y: auto !important; height: auto !important; }
  `;
  document.head.appendChild(style);
  
  // Add the class to body when this component mounts
  document.body.classList.add('workflow-edit-page');
  
  const navigate = useNavigate();
  const params = useParams();
  const [actualWorkflowId, setActualWorkflowId] = createSignal<string | null>(null);
  
  const [workflowTitle, setWorkflowTitle] = createSignal('');
  const [workflowDescription, setWorkflowDescription] = createSignal('');
  const [workflowCode, setWorkflowCode] = createSignal('');
  const [workflowStatus, setWorkflowStatus] = createSignal('inactive');
  const [syncStatus, setSyncStatus] = createSignal<'saved' | 'saving' | 'error'>('saved');
  const [hasUnsavedChanges, setHasUnsavedChanges] = createSignal(false);
  const [isNew, setIsNew] = createSignal(false);
  
  const [schedules, setSchedules] = createSignal<WorkflowSchedule[]>([]);
  
  const [runOutput, setRunOutput] = createSignal('');
  const [runError, setRunError] = createSignal('');
  const [runStatus, setRunStatus] = createSignal('');
  const [isRunning, setIsRunning] = createSignal(false);
  const [currentRunId, setCurrentRunId] = createSignal<number | null>(null);
  const [runStartTime, setRunStartTime] = createSignal<Date | null>(null);
  
  const [activeTab, setActiveTab] = createSignal('code');
  const [sharedUsers, setSharedUsers] = createSignal<SharedUser[]>([]);

  // Add state for inline title editing
  const [isEditingTitle, setIsEditingTitle] = createSignal(false);
  const [tempTitle, setTempTitle] = createSignal('');

  // SSE connection for real-time logs
  let pollCleanup: (() => void) | null = null;

  const getWorkflowId = () => actualWorkflowId() || params.id;

  // Functions for inline title editing
  const startEditingTitle = () => {
    setTempTitle(workflowTitle());
    setIsEditingTitle(true);
    // Focus the input after it's rendered
    setTimeout(() => {
      const input = document.getElementById('title-input') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  };

  const saveTitle = async () => {
    if (tempTitle().trim() && tempTitle() !== workflowTitle()) {
      setWorkflowTitle(tempTitle().trim());
      setHasUnsavedChanges(true);
    }
    setIsEditingTitle(false);
  };

  const cancelTitleEdit = () => {
    setTempTitle(workflowTitle());
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveTitle();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelTitleEdit();
    }
  };

  const formatLastRun = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const loadSchedules = async () => {
    // Don't load for new workflows
    if (isNew() || !getWorkflowId() || getWorkflowId() === 'new') return;
    
    try {
      const response = await authFetch(`${HOST}/api/v1/workflows/${getWorkflowId()}/schedules`);
      if (response.ok) {
        const data = await response.json();
        setSchedules(data);
      }
    } catch (error) {
      console.error('Error loading schedules:', error);
    }
  };





  const loadWorkflow = async (workflowId: string) => {
    try {
      setIsLoaded(false); // Prevent auto-save during loading
      const response = await authFetch(`${HOST}/api/v1/workflows/${workflowId}`);
      if (response.ok) {
        const workflow = await response.json();
        setWorkflowTitle(workflow.title);
        setWorkflowDescription(workflow.description || '');
        setWorkflowCode(workflow.code);
        setWorkflowStatus(workflow.status);
        setHasUnsavedChanges(false);
        setIsLoaded(true); // Now it's safe to auto-save
        loadSchedules();

        // After loading, check the latest run to see if it's currently executing.
        // This ensures that if you navigate to a running workflow, the console starts polling.
        const runsResponse = await authFetch(`${HOST}/api/v1/workflows/${workflowId}/runs?limit=1`);
        if (runsResponse.ok) {
          const runs = await runsResponse.json();
          if (runs.length > 0) {
            const latestRun = runs[0];
            setCurrentRunId(latestRun.id);
            setRunStatus(latestRun.status);
            setRunOutput(latestRun.output || '');
            setRunError(latestRun.error || '');

            // If the latest run is active, put the UI into a running state and start polling.
            if (latestRun.status === 'running' || latestRun.status === 'pending') {
              setIsRunning(true);
              setActiveTab('console'); // Automatically open the console to show the live log
              setRunStartTime(new Date(latestRun.started_at));
              pollCleanup = startPollingLogs(latestRun.id);
            }
          }
        }
      } else {
        console.error('Failed to load workflow');
        setIsLoaded(true); // Still set loaded to prevent infinite loading state
      }
    } catch (error) {
      console.error('Error loading workflow:', error);
      setIsLoaded(true); // Still set loaded to prevent infinite loading state
    }
  };

  const autoSave = async () => {
    try {
      setSyncStatus('saving');
      
      const response = await authFetch(`${HOST}/api/v1/workflows/${getWorkflowId()}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: workflowTitle(),
          description: workflowDescription(),
          code: workflowCode()
        })
      });

      if (response.ok) {
        setSyncStatus('saved');
        setHasUnsavedChanges(false);
      } else {
        setSyncStatus('error');
      }
    } catch (error) {
      console.error('Error auto-saving:', error);
      setSyncStatus('error');
    }
  };

  const debouncedAutoSave = () => {
    const timeoutId = setTimeout(autoSave, 1000);
    return () => clearTimeout(timeoutId);
  };



  const loadLatestRun = async () => {
    try {
      const response = await authFetch(`${HOST}/api/v1/workflows/${getWorkflowId()}/runs`);
      if (!response.ok) return;
      
      const runs = await response.json();
      if (runs.length > 0) {
        const latestRun = runs[0]; // Runs are ordered by started_at desc
        setRunStatus(latestRun.status);
        setRunOutput(latestRun.output || 'No output available.');
        setRunError(latestRun.error || '');
        setCurrentRunId(latestRun.id);
      } else {
        setRunOutput('No previous runs found.');
        setRunError('');
        setRunStatus('');
      }
    } catch (error) {
      console.error('Error loading latest run:', error);
      setRunOutput('Failed to load run history.');
    }
  };

  const startPollingLogs = (runId: number) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await authFetch(`${HOST}/api/v1/workflows/${getWorkflowId()}/runs/${runId}`);
        if (!response.ok) {
          console.error('Failed to fetch run status');
          return;
        }
        
        const runData = await response.json();
        
        // Unconditionally update state from the single source of truth (the DB)
        setRunStatus(runData.status);
        setRunOutput(runData.output || '');
        setRunError(runData.error || '');
        
        // Stop polling if workflow is in a terminal state
        if (['success', 'completed', 'error', 'timeout', 'stopped'].includes(runData.status)) {
          setIsRunning(false);
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('Error polling run status:', error);
        setIsRunning(false); // Stop on error
        clearInterval(pollInterval);
      }
    }, 1000); // Poll every second
    
    // Return cleanup function
    return () => clearInterval(pollInterval);
  };

  const stopWorkflow = async () => {
    if (!currentRunId()) return;
    
    try {
      const response = await authFetch(`${HOST}/api/v1/workflows/${getWorkflowId()}/runs/${currentRunId()}/stop`, {
        method: 'POST'
      });

      if (response.ok) {
        setRunStatus('stopped');
        setIsRunning(false);
        if (pollCleanup) {
          pollCleanup();
          pollCleanup = null;
        }
        
        // Add stop message
        const stopTime = new Date();
        const startTime = runStartTime();
        const executionTime = startTime ? ((stopTime.getTime() - startTime.getTime()) / 1000).toFixed(1) : 'unknown';
        const stopMessage = `\n[${stopTime.toLocaleTimeString()}] Workflow stopped by user (${executionTime}s)`;
        setRunOutput(prev => prev + stopMessage);
      } else {
        console.error('Failed to stop workflow');
      }
    } catch (error) {
      console.error('Error stopping workflow:', error);
    }
  };

  const handleRun = async () => {

    // Clear any existing polling interval before starting a new one
    if (pollCleanup) {
      pollCleanup();
      pollCleanup = null;
    }

    try {
      setIsRunning(true);
      setActiveTab('console'); // Auto-switch to console tab when running
      const startTime = new Date();
      setRunStartTime(startTime);
      const timestamp = startTime.toLocaleTimeString();
      setRunOutput(`[${timestamp}] Starting workflow execution...\n`);
      setRunError('');
      setRunStatus('pending');
      
      const response = await authFetch(`${HOST}/api/v1/workflows/${getWorkflowId()}/run/stream`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to run workflow');
      }

      const runData = await response.json();
      setCurrentRunId(runData.id);
      
      // Start polling logs
      pollCleanup = startPollingLogs(runData.id);
      
    } catch (error) {
      console.error('Error running workflow:', error);
      setRunError(`Failed to start workflow: ${error}`);
      setIsRunning(false);
    }
  };

  const handleBack = () => {
    navigate('/workflows');
  };

  const [isLoaded, setIsLoaded] = createSignal(false);

  // Auto-save effect - only after workflow is loaded
  createEffect(() => {
    if (hasUnsavedChanges() && isLoaded()) {
      const cleanup = debouncedAutoSave();
      return cleanup;
    }
  });





  // Cleanup polling on unmount
  onCleanup(() => {
    if (pollCleanup) {
      pollCleanup();
    }
    // Remove the workflow edit class when leaving the page
    document.body.classList.remove('workflow-edit-page');
  });

  // Add function to load shared users
  const loadSharedUsers = async () => {
    try {
      const response = await authFetch(`${HOST}/api/v1/workflows/${getWorkflowId()}/shared`);
      if (response.ok) {
        const data = await response.json();
        setSharedUsers(data);
      }
    } catch (error) {
      console.error('Error loading shared users:', error);
    }
  };



  onMount(() => {
    const loadWorkflow = async () => {
      try {
        setIsLoaded(false);
        // Try to get from cache first
        const workflow = await WorkflowCache.getWorkflow(params.id);
        if (workflow) {
          setWorkflowTitle(workflow.title);
          setWorkflowDescription(workflow.description || '');
          setWorkflowCode(workflow.code);
          setWorkflowStatus(workflow.status);
          setHasUnsavedChanges(false);
          setIsLoaded(true);
          loadSchedules();
          loadSharedUsers();
        }

        // Then fetch fresh data from server
        const response = await authFetch(`${HOST}/api/v1/workflows/${params.id}`);
        if (response.ok) {
          const freshWorkflow = await response.json();
          setWorkflowTitle(freshWorkflow.title);
          setWorkflowDescription(freshWorkflow.description || '');
          setWorkflowCode(freshWorkflow.code);
          setWorkflowStatus(freshWorkflow.status);
          setHasUnsavedChanges(false);
          setIsLoaded(true);
          loadSchedules();
          loadSharedUsers();

          // After loading, check the latest run
          const runsResponse = await authFetch(`${HOST}/api/v1/workflows/${params.id}/runs?limit=1`);
          if (runsResponse.ok) {
            const runs = await runsResponse.json();
            if (runs.length > 0) {
              const latestRun = runs[0];
              setCurrentRunId(latestRun.id);
              setRunStatus(latestRun.status);
              setRunOutput(latestRun.output || '');
              setRunError(latestRun.error || '');

              if (latestRun.status === 'running' || latestRun.status === 'pending') {
                setIsRunning(true);
                setActiveTab('console');
                setRunStartTime(new Date(latestRun.started_at));
                pollCleanup = startPollingLogs(latestRun.id);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error loading workflow:', error);
        setIsLoaded(true);
      }
    };

    loadWorkflow();
  });

  return (
    <div class="w-full bg-background dark:bg-background mt-3.5 rounded-lg p-6" style="min-height: 90vh; height: auto; overflow-y: visible !important;">
        {/* Header */}
        <div class="p-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <ArrowLeft class="size-4" />
              </Button>
              <div class="flex items-center gap-3">
                <Show when={isEditingTitle()} fallback={
                  <h1 
                    class="text-2xl font-bold cursor-pointer hover:border hover:border-dashed hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 px-2 py-1 rounded transition-all"
                    onClick={startEditingTitle}
                  >
                    {workflowTitle()}
                  </h1>
                }>
                  <input
                    id="title-input"
                    type="text"
                    value={tempTitle()}
                    onInput={(e) => setTempTitle(e.currentTarget.value)}
                    onKeyDown={handleTitleKeyDown}
                    onBlur={saveTitle}
                    class="text-2xl font-bold bg-transparent border border-blue-500 rounded px-2 py-1 outline-none"
                  />
                </Show>
                
                <div class="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="status-toggle"
                    checked={workflowStatus() === 'active'}
                    onChange={(e) => {
                      setWorkflowStatus(e.currentTarget.checked ? 'active' : 'inactive');
                      setHasUnsavedChanges(true);
                    }}
                    class="rounded border-gray-300"
                  />
                  <label for="status-toggle" class="text-sm font-medium">
                    {workflowStatus() === 'active' ? 'Active' : 'Inactive'}
                  </label>
                </div>
                
                <div class="flex items-center gap-2">
                  <span class={`text-xs px-2 py-1 rounded-full ${
                    syncStatus() === 'saved' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : syncStatus() === 'saving' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {syncStatus() === 'saved' ? 'Saved' : syncStatus() === 'saving' ? 'Saving...' : 'Error'}
                  </span>
                  <Show when={hasUnsavedChanges()}>
                    <span class="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400 border">
                      Unsaved changes
                    </span>
                  </Show>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <Button 
                onClick={handleRun} 
                disabled={isRunning()}
                class="flex items-center gap-2"
              >
                <Show when={isRunning()} fallback={<Play class="size-4" />}>
                  <div class="size-4 rounded-full border-2 border-current border-t-transparent animate-spin"></div>
                </Show>
                {isRunning() ? 'Running...' : 'Run'}
              </Button>
              <Show when={isRunning()}>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={stopWorkflow}
                  class="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white border-red-600"
                >
                  <Square class="size-4 fill-current" />
                  Stop
                </Button>
              </Show>
            </div>
          </div>
        </div>

        <Tabs value={activeTab()} onChange={setActiveTab} class="flex flex-col">
          <div class="px-6 flex-shrink-0">
            <TabsList>
              <TabsTrigger value="code" class="data-[selected]:bg-white dark:data-[selected]:bg-gray-800">
                Code
              </TabsTrigger>
              <TabsTrigger value="console" class="data-[selected]:bg-white dark:data-[selected]:bg-gray-800">
                Console
              </TabsTrigger>
              <TabsTrigger value="sharing" class="data-[selected]:bg-white dark:data-[selected]:bg-gray-800">
                Sharing
              </TabsTrigger>
              <TabsTrigger value="schedules" class="data-[selected]:bg-white dark:data-[selected]:bg-gray-800">
                Schedules
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="code" class="flex flex-col flex-1">
            <div class="p-6 flex flex-col flex-1">
              <label for="code" class="text-sm font-medium mb-2">Code</label>
              <div class="border border-border rounded-md flex-1">
                <CodeEditor
                  value={workflowCode()}
                  onInput={(value) => {
                    setWorkflowCode(value);
                    setHasUnsavedChanges(true);
                  }}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="console" class="flex flex-col flex-1">
            <WorkflowConsole 
              isVisible={true}
              fullScreen={true}
              onClose={() => setActiveTab('code')}
              runOutput={runOutput()}
              runError={runError()}
              runStatus={runStatus()}
              isRunning={isRunning()}
              onStop={stopWorkflow}
              onClear={() => {
                setRunOutput('');
                setRunError('');
                setRunStatus('');
              }}
            />
          </TabsContent>

          <TabsContent value="sharing">
            <div class="p-6">
              <WorkflowSharing 
                workflowId={getWorkflowId()!}
                sharedUsers={sharedUsers()}
                onSharedUsersChange={setSharedUsers}
              />
            </div>
          </TabsContent>

          <TabsContent value="schedules">
            <div class="p-6">
              <WorkflowSchedules 
                workflowId={getWorkflowId()!}
                schedules={schedules()}
                onSchedulesChange={setSchedules}
              />
            </div>
          </TabsContent>
        </Tabs>
    </div>
  );
};

export default WorkflowEditPage; 