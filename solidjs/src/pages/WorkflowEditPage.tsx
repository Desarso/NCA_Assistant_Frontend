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
  
  const [showOutput, setShowOutput] = createSignal(false);
  const [runOutput, setRunOutput] = createSignal('');
  const [runError, setRunError] = createSignal('');
  const [runStatus, setRunStatus] = createSignal('');
  const [isRunning, setIsRunning] = createSignal(false);
  const [currentRunId, setCurrentRunId] = createSignal<number | null>(null);
  const [runStartTime, setRunStartTime] = createSignal<Date | null>(null);
  
  const [activeTab, setActiveTab] = createSignal('details');
  const [sharedUsers, setSharedUsers] = createSignal<SharedUser[]>([]);

  // SSE connection for real-time logs
  let pollCleanup: (() => void) | null = null;

  const getWorkflowId = () => actualWorkflowId() || params.id;

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
              setShowOutput(true); // Automatically open the console to show the live log
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
    if (isNew()) return;
    
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

  const handleSaveNew = async () => {
    if (!isNew()) return;
    
    try {
      setSyncStatus('saving');
      
      const workflowData = {
        title: workflowTitle(),
        description: workflowDescription(),
        code: workflowCode()
      };

      const response = await authFetch(`${HOST}/api/v1/workflows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(workflowData)
      });

      if (!response.ok) {
        throw new Error('Failed to create workflow');
      }

      const newWorkflow = await response.json();
      // Store the actual workflow ID and navigate to edit mode
      setActualWorkflowId(newWorkflow.id);
      navigate(`/workflows/${newWorkflow.id}/edit`, { replace: true });
      setIsNew(false);
      setSyncStatus('saved');
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Error creating workflow:', error);
      setSyncStatus('error');
    }
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

  const handleToggleConsole = () => {
    const newShowOutput = !showOutput();
    setShowOutput(newShowOutput);
    
    // If opening console and not currently running, load latest run
    if (newShowOutput && !isRunning() && !isNew()) {
      loadLatestRun();
    }
  };

  const handleRun = async () => {
    if (isNew()) {
      // Save first if it's a new workflow
      await handleSaveNew();
      return;
    }

    // Clear any existing polling interval before starting a new one
    if (pollCleanup) {
      pollCleanup();
      pollCleanup = null;
    }

    try {
      setIsRunning(true);
      setShowOutput(true); // Auto-open console when running
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
    if (!isNew() && hasUnsavedChanges() && isLoaded()) {
      const cleanup = debouncedAutoSave();
      return cleanup;
    }
  });

  // Track changes - only after workflow is loaded
  createEffect(() => {
    if (!isNew() && isLoaded()) {
      setHasUnsavedChanges(true);
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
    if (params.id === 'new') {
      setIsNew(true);
      setIsLoaded(true); // New workflows are immediately "loaded"
      setWorkflowTitle('New Workflow');
      setWorkflowCode(`# Your workflow code here
print("Hello, World!")

# Sample workflow demonstrating assistant capabilities
workflow_log("Starting workflow execution...")

# List existing workflows
workflows_result = list_workflows(limit=10)
workflow_log(f"Found {workflows_result.get('count', 0)} existing workflows")

# Read a file (if it exists)
file_content = read_file("example.txt")
if file_content:
    workflow_log("File content read successfully")
else:
    workflow_log("File not found or empty")

# Process some data
data = [1, 2, 3, 4, 5]
total = sum(data)
workflow_log(f"Processed data, total: {total}")

# Make an API call
response = make_api_call("https://api.example.com/data")
if response.get('success'):
    workflow_log("API call successful")
else:
    workflow_log("API call failed")

# Save results
save_result("output.json", {"total": total, "api_response": response})

# Cleanup
workflow_log("Workflow completed successfully")

# Additional lines to ensure scrolling works
for i in range(20):
    workflow_log(f"Processing item {i}")
    # Simulate some work
    time.sleep(0.1)

workflow_log("All items processed")

# Final summary
summary = {
    "items_processed": 20,
    "total_calculated": total,
    "api_success": response.get('success', False)
}

workflow_log(f"Final summary: {summary}")`);
    } else {
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
            loadSharedUsers(); // Add this line
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
                  setShowOutput(true);
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
    }
  });

  return (
    <div class="w-full bg-background dark:bg-background mt-3.5 rounded-lg p-6" style="min-height: 90vh; height: auto; overflow-y: visible !important;">
        {/* Header */}
        <div class="p-6 border-b border-border">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <ArrowLeft class="size-4" />
              </Button>
              <div>
                <h1 class="text-2xl font-bold">{workflowTitle()}</h1>
                                 <div class="flex items-center gap-2 mt-1">
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
                variant="outline" 
                size="sm" 
                onClick={handleToggleConsole}
                class="flex items-center gap-2"
              >
                <Terminal class="size-4" />
                Console
              </Button>
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
          <div class="px-6 border-b border-border flex-shrink-0">
            <TabsList>
              <TabsTrigger value="details" class="data-[selected]:bg-white dark:data-[selected]:bg-gray-800">
                Details
              </TabsTrigger>
              <TabsTrigger value="sharing" class="data-[selected]:bg-white dark:data-[selected]:bg-gray-800">
                Sharing
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="details" class="flex flex-col">
            {/* Metadata Section */}
            <div class="p-6 border-b border-border flex-shrink-0">
              {/* Workflow Info Inputs */}
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label for="title" class="text-sm font-medium">Title</label>
                  <Input
                    id="title"
                    value={workflowTitle()}
                    onInput={(e) => setWorkflowTitle(e.currentTarget.value)}
                    placeholder="Workflow title"
                  />
                </div>
                <div>
                  <label for="status" class="text-sm font-medium">Status</label>
                  <div class="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      id="status"
                      checked={workflowStatus() === 'active'}
                      onChange={(e) => setWorkflowStatus(e.currentTarget.checked ? 'active' : 'inactive')}
                      class="rounded border-gray-300"
                    />
                    <label for="status" class="text-sm">{workflowStatus() === 'active' ? 'Active' : 'Inactive'}</label>
                  </div>
                </div>
              </div>
              <div class="mt-4">
                <label for="description" class="text-sm font-medium">Description</label>
                <textarea
                  id="description"
                  value={workflowDescription()}
                  onInput={(e) => setWorkflowDescription(e.currentTarget.value)}
                  placeholder="Workflow description"
                  class="w-full p-3 border border-border rounded-md bg-background resize-none"
                  rows={2}
                />
              </div>

              <Show when={!isNew()}>
                <WorkflowSchedules 
                  workflowId={getWorkflowId()!}
                  schedules={schedules()}
                  onSchedulesChange={setSchedules}
                />
              </Show>
            </div>

            {/* Main Content Area (Editor + Console) */}
            <div class="flex flex-col md:flex-row">
              {/* Code Editor Panel */}
              <div class={`${showOutput() ? 'w-full md:w-1/2' : 'w-full'} p-6 flex flex-col`}>
                <label for="code" class="text-sm font-medium mb-2">Code</label>
                <div class="border border-border rounded-md">
                  <CodeEditor
                    value={workflowCode()}
                    onInput={(value) => setWorkflowCode(value)}
                  />
                </div>
              </div>

              {/* Console Panel */}
              <WorkflowConsole 
                isVisible={showOutput()}
                onClose={() => setShowOutput(false)}
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
            </div>
          </TabsContent>

          <TabsContent value="sharing">
            <Show when={!isNew()}>
              <WorkflowSharing 
                workflowId={getWorkflowId()!}
                sharedUsers={sharedUsers()}
                onSharedUsersChange={setSharedUsers}
              />
            </Show>
          </TabsContent>
        </Tabs>
    </div>
  );
};

export default WorkflowEditPage; 