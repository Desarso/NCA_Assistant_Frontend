import { Component, createSignal, createEffect, onMount, onCleanup, Show, For } from 'solid-js';
import { useNavigate, useParams } from '@solidjs/router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TextField } from '@/components/ui/text-field';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ArrowLeft, Play, Save, Clock, Calendar, Trash2, Settings, Terminal, Square, Share2, UserPlus, Check, ChevronsUpDown } from 'lucide-solid';
import { authFetch } from '@/lib/utils';
import CodeEditor from '@/components/CodeEditor';
import { WorkflowCache } from '@/lib/workflow-cache';

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
  const [showSchedules, setShowSchedules] = createSignal(false);
  const [newCronExpression, setNewCronExpression] = createSignal('');
  const [newTimezone, setNewTimezone] = createSignal('UTC');
  
  const [showOutput, setShowOutput] = createSignal(false);
  const [runOutput, setRunOutput] = createSignal('');
  const [runError, setRunError] = createSignal('');
  const [runStatus, setRunStatus] = createSignal('');
  const [isRunning, setIsRunning] = createSignal(false);
  const [currentRunId, setCurrentRunId] = createSignal<number | null>(null);
  const [runStartTime, setRunStartTime] = createSignal<Date | null>(null);
  const [consoleRef, setConsoleRef] = createSignal<HTMLDivElement>();
  
  const [activeTab, setActiveTab] = createSignal('details');
  const [sharedUsers, setSharedUsers] = createSignal<SharedUser[]>([]);
  const [userToShare, setUserToShare] = createSignal('');
  const [sharingError, setSharingError] = createSignal('');
  const [searchTerm, setSearchTerm] = createSignal('');
  const [users, setUsers] = createSignal<User[]>([]);
  const [selectedUser, setSelectedUser] = createSignal<User | null>(null);
  const [isSearchOpen, setIsSearchOpen] = createSignal(false);
  const [isSearching, setIsSearching] = createSignal(false);

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

  const createSchedule = async () => {
    if (!newCronExpression()) return;
    
    try {
      const response = await authFetch(`${HOST}/api/v1/workflows/${getWorkflowId()}/schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cron_expression: newCronExpression(),
          timezone: newTimezone(),
          is_active: true
        })
      });

      if (response.ok) {
        setNewCronExpression('');
        setNewTimezone('UTC');
        loadSchedules();
      } else {
        console.error('Failed to create schedule');
      }
    } catch (error) {
      console.error('Error creating schedule:', error);
    }
  };

  const deleteSchedule = async (scheduleId: number) => {
    try {
      const response = await authFetch(`${HOST}/api/v1/workflows/${getWorkflowId()}/schedules/${scheduleId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        loadSchedules();
      } else {
        console.error('Failed to delete schedule');
      }
    } catch (error) {
      console.error('Error deleting schedule:', error);
    }
  };

  const formatCronExpression = (cron: string) => {
    // Simple cron to human readable conversion
    const parts = cron.split(' ');
    if (parts.length !== 5) return cron;
    
    const [minute, hour, day, month, weekday] = parts;
    
    if (minute === '0' && hour === '9' && weekday === '1-5') {
      return 'Weekdays at 9:00 AM';
    }
    if (minute === '0' && hour === '0') {
      return 'Daily at midnight';
    }
    if (minute === '0' && hour === '12') {
      return 'Daily at noon';
    }
    
    return cron;
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

  // Auto-scroll console to bottom
  createEffect(() => {
    if (consoleRef() && runOutput()) {
      setTimeout(() => {
        if (consoleRef()) {
          consoleRef()!.scrollTop = consoleRef()!.scrollHeight;
        }
      }, 100);
    }
  });

  // Cleanup polling on unmount
  onCleanup(() => {
    if (pollCleanup) {
      pollCleanup();
    }
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

  // Add function to search users
  const searchUsers = async (query: string) => {
    try {
      setIsSearching(true);
      const response = await authFetch(`${HOST}/api/v1/users/search?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounce search
  let searchTimeout: number;
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchUsers(value);
    }, 300) as unknown as number;
  };

  // Modify shareWorkflow to use selected user
  const shareWorkflow = async () => {
    try {
      setSharingError('');
      const user = selectedUser();
      if (!user) return;

      const response = await authFetch(`${HOST}/api/v1/workflows/${getWorkflowId()}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: user.email })
      });

      if (response.ok) {
        setSelectedUser(null);
        setSearchTerm('');
        setUsers([]);
        setIsSearchOpen(false);
        await loadSharedUsers();
      } else {
        const error = await response.json();
        setSharingError(error.detail || 'Failed to share workflow');
      }
    } catch (error) {
      console.error('Error sharing workflow:', error);
      setSharingError('Failed to share workflow');
    }
  };

  // Add function to remove shared access
  const removeSharedAccess = async (userId: string) => {
    try {
      const response = await authFetch(`${HOST}/api/v1/workflows/${getWorkflowId()}/share/${userId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadSharedUsers();
      }
    } catch (error) {
      console.error('Error removing shared access:', error);
    }
  };

  onMount(() => {
    if (params.id === 'new') {
      setIsNew(true);
      setIsLoaded(true); // New workflows are immediately "loaded"
      setWorkflowTitle('New Workflow');
      setWorkflowCode('# Your workflow code here\nprint("Hello, World!")');
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
    <div class="h-full w-full p-6">
      <div class="bg-background rounded-lg border border-border flex flex-col h-[calc(200vh)]">
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

        <Tabs value={activeTab()} onChange={setActiveTab}>
          <div class="px-6 border-b border-border">
            <TabsList>
              <TabsTrigger value="details" class="data-[selected]:bg-white dark:data-[selected]:bg-gray-800">
                Details
              </TabsTrigger>
              <TabsTrigger value="sharing" class="data-[selected]:bg-white dark:data-[selected]:bg-gray-800">
                Sharing
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="details">
            {/* Metadata Section */}
            <div class="p-6 border-b border-border">
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
                {/* Schedules */}
                <div class="mt-6">
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold flex items-center gap-2">
                      <Clock class="size-5" />
                      Schedules
                    </h3>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setShowSchedules(!showSchedules())}
                    >
                      <Settings class="size-4" />
                      {showSchedules() ? 'Hide' : 'Show'}
                    </Button>
                  </div>

                  <Show when={showSchedules()}>
                    <div class="space-y-4">
                      {/* Add new schedule */}
                      <div class="border border-border rounded-lg p-4">
                        <div class="mb-4">
                          <h4 class="text-base font-semibold">Add Schedule</h4>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                          <div>
                            <label for="cron" class="text-sm font-medium">Cron Expression</label>
                            <Input
                              id="cron"
                              value={newCronExpression()}
                              onInput={(e) => setNewCronExpression(e.currentTarget.value)}
                              placeholder="0 9 * * 1-5"
                            />
                            <p class="text-xs text-muted-foreground mt-1">
                              Format: minute hour day month weekday
                            </p>
                          </div>
                          <div>
                            <label for="timezone" class="text-sm font-medium">Timezone</label>
                            <Input
                              id="timezone"
                              value={newTimezone()}
                              onInput={(e) => setNewTimezone(e.currentTarget.value)}
                              placeholder="UTC"
                            />
                          </div>
                        </div>
                        <Button onClick={createSchedule} class="mt-4" disabled={!newCronExpression()}>
                          Add Schedule
                        </Button>
                      </div>

                      {/* Existing schedules */}
                      <For each={schedules()}>
                        {(schedule) => (
                          <Card>
                            <CardContent class="pt-6">
                              <div class="flex items-center justify-between">
                                <div>
                                  <div class="font-medium">{formatCronExpression(schedule.cron_expression)}</div>
                                  <div class="text-sm text-muted-foreground">
                                    {schedule.cron_expression} • {schedule.timezone}
                                  </div>
                                  <Show when={schedule.next_run}>
                                    <div class="text-xs text-muted-foreground mt-1">
                                      Next run: {formatLastRun(schedule.next_run)}
                                    </div>
                                  </Show>
                                </div>
                                <div class="flex items-center gap-2">
                                  <Badge variant={schedule.is_active ? 'default' : 'secondary'}>
                                    {schedule.is_active ? 'Active' : 'Inactive'}
                                  </Badge>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => deleteSchedule(schedule.id)}
                                  >
                                    <Trash2 class="size-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </Show>
            </div>

            {/* Main Content Area (Editor + Console) */}
            <div class="flex flex-col md:flex-row flex-1">
              {/* Code Editor Panel */}
              <div class={`${showOutput() ? 'w-full md:w-1/2' : 'w-full'} p-6 flex flex-col h-[calc(80vh)]`}>
                <label for="code" class="text-sm font-medium">Code</label>
                <div class="flex-1 border border-border rounded-md overflow-hidden mt-2">
                  <CodeEditor
                    value={workflowCode()}
                    onInput={(value) => setWorkflowCode(value)}
                  />
                </div>
              </div>

              {/* Console Panel */}
              <Show when={showOutput()}>
                <div class="w-full md:w-1/2 flex flex-col border-l border-border h-[calc(80vh)]">
                  {/* Console Header */}
                  <div class="p-4 border-b border-border bg-muted/30">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <div class="size-3 rounded-full bg-green-500"></div>
                        <span class="text-sm font-medium">Console Output</span>
                        <Show when={runStatus()}>
                          <span class={`text-xs px-2 py-1 rounded-full ${
                            runStatus() === 'success' || runStatus() === 'completed' 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : runStatus() === 'error'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                              : runStatus() === 'running'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                              : runStatus() === 'stopped'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                          }`}>
                            {runStatus()}
                          </span>
                        </Show>
                        <Show when={isRunning()}>
                          <div class="flex items-center gap-2 text-yellow-400">
                            <div class="size-2 rounded-full bg-yellow-400 animate-pulse"></div>
                            <span class="text-xs">Executing...</span>
                          </div>
                        </Show>
                      </div>
                      <div class="flex items-center gap-2">
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => {
                            setRunOutput('');
                            setRunError('');
                            setRunStatus('');
                          }}
                          class="text-xs px-2 py-1 h-6"
                        >
                          Clear
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => setShowOutput(false)}
                          class="size-6 p-0"
                        >
                          ×
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Console Content */}
                  <div ref={setConsoleRef} class="flex-1 overflow-auto bg-black font-mono text-sm">
                    <pre class="p-4 whitespace-pre-wrap">
                      <span class="text-green-400">{runOutput()}</span>
                      <Show when={runError()}>
                        <span class="text-red-400">{runError()}</span>
                      </Show>
                    </pre>
                  </div>
                </div>
              </Show>
            </div>
          </TabsContent>

          <TabsContent value="sharing">
            <div class="p-6">
              <div class="max-w-2xl">
                <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Share2 class="size-5" />
                  Share Workflow
                </h3>

                <div class="flex gap-2 mb-6">
                  <Popover 
                    open={isSearchOpen()} 
                    onOpenChange={(open) => {
                      setIsSearchOpen(open);
                      if (open) {
                        // Load all users when popover opens
                        searchUsers("");
                      }
                    }}
                  >
                    <PopoverTrigger>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={isSearchOpen()}
                        class="w-full justify-between"
                      >
                        {selectedUser()?.email ?? "Search for a user..."}
                        <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent class="w-[400px] p-0">
                      <Command>
                        <CommandInput
                          placeholder="Search users..."
                          value={searchTerm()}
                          onInput={(e) => handleSearch(e.currentTarget.value)}
                        />
                        <CommandEmpty>
                          {isSearching() ? (
                            <div class="flex items-center justify-center py-6">
                              <div class="size-5 animate-spin rounded-full border-b-2 border-primary"></div>
                            </div>
                          ) : (
                            "No users found."
                          )}
                        </CommandEmpty>
                        <CommandGroup>
                          <For each={users()}>
                            {(user) => (
                              <CommandItem
                                value={user.email}
                                onSelect={() => {
                                  setSelectedUser(user);
                                  setIsSearchOpen(false);
                                }}
                              >
                                <Check
                                  class={`mr-2 h-4 w-4 ${
                                    selectedUser()?.id === user.id ? "opacity-100" : "opacity-0"
                                  }`}
                                />
                                <div class="flex flex-col">
                                  <span>{user.email}</span>
                                  <Show when={user.displayName}>
                                    <span class="text-sm text-muted-foreground">
                                      {user.displayName}
                                    </span>
                                  </Show>
                                </div>
                              </CommandItem>
                            )}
                          </For>
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  <Button 
                    onClick={shareWorkflow} 
                    disabled={!selectedUser()}
                    class="flex items-center gap-2"
                  >
                    <UserPlus class="size-4" />
                    Share
                  </Button>
                </div>

                <Show when={sharingError()}>
                  <p class="text-red-500 mb-4">{sharingError()}</p>
                </Show>

                <div class="space-y-4">
                  <h4 class="font-medium">Shared With</h4>
                  <Show 
                    when={sharedUsers().length > 0} 
                    fallback={
                      <p class="text-muted-foreground">This workflow hasn't been shared with anyone yet.</p>
                    }
                  >
                    <For each={sharedUsers()}>
                      {(user) => (
                        <Card>
                          <CardContent class="p-4">
                            <div class="flex items-center justify-between">
                              <div>
                                <p class="font-medium">{user.email}</p>
                                <p class="text-sm text-muted-foreground">
                                  Shared {new Date(user.shared_at).toLocaleDateString()}
                                </p>
                              </div>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => removeSharedAccess(user.id)}
                                class="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                              >
                                Remove
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </For>
                  </Show>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default WorkflowEditPage; 