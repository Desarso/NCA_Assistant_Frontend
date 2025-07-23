import { Component, createSignal, For, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { Button } from '@/components/ui/button';
import { Play, Plus, Code2, Calendar, Loader2 } from 'lucide-solid';
import { authFetch } from '@/lib/utils';
import { WorkflowCache, type Workflow } from '@/lib/workflow-cache';

const HOST = import.meta.env.VITE_CHAT_HOST;

const WorkflowsPage: Component = () => {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = createSignal<Workflow[]>([]);
  const [loading, setLoading] = createSignal(true);

  // Load workflows on mount
  onMount(async () => {
    try {
      // First load from cache
      const cachedWorkflows = await WorkflowCache.get();
      setWorkflows(cachedWorkflows);
      setLoading(false);

      // Then fetch from backend to update if needed
      const freshWorkflows = await WorkflowCache.fetchWorkflowsNoCache();
      setWorkflows(freshWorkflows);
    } catch (error) {
      console.error('Error loading workflows:', error);
      setLoading(false);
    }
  });

  const handleWorkflowClick = (workflowId: string) => {
    navigate(`/workflows/${workflowId}/edit`);
  };

  const handleNewWorkflow = () => {
    navigate('/workflows/new');
  };

  const [runningWorkflows, setRunningWorkflows] = createSignal<Set<string>>(new Set());

  const handleRunWorkflow = async (workflowId: string) => {
    try {
      setRunningWorkflows(prev => {
        const next = new Set(prev);
        next.add(workflowId);
        return next;
      });

      const response = await authFetch(`${HOST}/api/v1/workflows/${workflowId}/run`, {
        method: 'POST'
      });
      
      if (response.ok) {
        // Refresh workflows to get updated status
        const freshWorkflows = await WorkflowCache.fetchWorkflowsNoCache();
        setWorkflows(freshWorkflows);
      }
    } catch (error) {
      console.error('Error running workflow:', error);
    } finally {
      setRunningWorkflows(prev => {
        const next = new Set(prev);
        next.delete(workflowId);
        return next;
      });
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  return (
    <div class="h-full w-full p-6">
      <div class="bg-background rounded-lg border border-border h-full">
        {/* Header */}
        <div class="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-foreground">Workflows</h1>
            <p class="text-muted-foreground mt-1">Manage your Python automation scripts</p>
          </div>
          <Button onClick={handleNewWorkflow} class="flex items-center gap-2">
            <Plus class="size-4" />
            New Workflow
          </Button>
        </div>

        {/* Workflows List */}
        <div class="p-6">
          {loading() ? (
            <div class="flex items-center justify-center py-12">
              <Loader2 class="size-8 animate-spin text-muted-foreground" />
              <span class="ml-2 text-muted-foreground">Loading workflows...</span>
            </div>
          ) : (
            <div class="space-y-2">
              <For each={workflows()}>
                {(workflow) => (
                  <div class="group flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors cursor-pointer">
                    {/* Run Button */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRunWorkflow(workflow.id);
                      }}
                      disabled={runningWorkflows().has(workflow.id)}
                      class="flex items-center justify-center size-8 rounded-full hover:bg-primary hover:text-primary-foreground"
                    >
                      {runningWorkflows().has(workflow.id) ? (
                        <Loader2 class="size-4 animate-spin" />
                      ) : (
                        <Play class="size-4" />
                      )}
                    </Button>

                    {/* Workflow Info */}
                    <div class="flex-1 min-w-0" onClick={() => handleWorkflowClick(workflow.id)}>
                      <div class="flex items-center gap-2">
                        <Code2 class="size-4 text-muted-foreground" />
                        <h3 class="font-medium text-foreground truncate">{workflow.title}</h3>
                        <span class={`text-xs px-2 py-1 rounded-full ${
                          workflow.status === 'active' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                        }`}>
                          {workflow.status}
                        </span>
                        {workflow.last_run_status && (
                          <span class={`text-xs px-2 py-1 rounded-full ${
                            workflow.last_run_status === 'success'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                            {workflow.last_run_status}
                          </span>
                        )}
                      </div>
                      <p class="text-sm text-muted-foreground truncate mt-1">
                        {workflow.description || 'No description'}
                      </p>
                    </div>

                    {/* Last Run */}
                    <div class="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar class="size-4" />
                      <span>Last run: {formatDate(workflow.last_run)}</span>
                    </div>
                  </div>
                )}
              </For>
            </div>
          )}

          {!loading() && workflows().length === 0 && (
            <div class="text-center py-12">
              <Code2 class="size-12 text-muted-foreground mx-auto mb-4" />
              <h3 class="text-lg font-medium text-foreground mb-2">No workflows yet</h3>
              <p class="text-muted-foreground mb-4">Get started by creating your first Python workflow</p>
              <Button onClick={handleNewWorkflow}>
                <Plus class="size-4 mr-2" />
                Create Workflow
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkflowsPage; 