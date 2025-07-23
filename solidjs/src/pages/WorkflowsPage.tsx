import { Component, createSignal, For, onMount, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogFooter, 
  DialogTitle, 
  DialogDescription 
} from '@/components/ui/dialog';
import { Play, Plus, Code2, Calendar, Loader2, Trash2 } from 'lucide-solid';
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
  const [deletingWorkflows, setDeletingWorkflows] = createSignal<Set<string>>(new Set());
  
  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = createSignal(false);
  const [workflowToDelete, setWorkflowToDelete] = createSignal<Workflow | null>(null);
  const [showErrorDialog, setShowErrorDialog] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal('');

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

  const handleDeleteWorkflow = (workflow: Workflow) => {
    setWorkflowToDelete(workflow);
    setShowDeleteDialog(true);
  };

  const confirmDeleteWorkflow = async () => {
    const workflow = workflowToDelete();
    if (!workflow) return;

    try {
      setDeletingWorkflows(prev => {
        const next = new Set(prev);
        next.add(workflow.id);
        return next;
      });

      const success = await WorkflowCache.deleteFromServer(workflow.id);
      
      if (success) {
        // Update local state by removing the deleted workflow
        setWorkflows(prev => prev.filter(wf => wf.id !== workflow.id));
        setShowDeleteDialog(false);
        setWorkflowToDelete(null);
      } else {
        setErrorMessage('Failed to delete workflow. Please try again.');
        setShowErrorDialog(true);
      }
    } catch (error) {
      console.error('Error deleting workflow:', error);
      setErrorMessage('An error occurred while deleting the workflow.');
      setShowErrorDialog(true);
    } finally {
      setDeletingWorkflows(prev => {
        const next = new Set(prev);
        next.delete(workflow.id);
        return next;
      });
    }
  };

  const cancelDeleteWorkflow = () => {
    setShowDeleteDialog(false);
    setWorkflowToDelete(null);
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
                    {/* Action Buttons */}
                    <div class="flex items-center gap-2">
                      {/* Run Button */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRunWorkflow(workflow.id);
                        }}
                        disabled={runningWorkflows().has(workflow.id) || deletingWorkflows().has(workflow.id)}
                        class="flex items-center justify-center size-8 rounded-full hover:bg-primary hover:text-primary-foreground"
                        title="Run workflow"
                      >
                        {runningWorkflows().has(workflow.id) ? (
                          <Loader2 class="size-4 animate-spin" />
                        ) : (
                          <Play class="size-4" />
                        )}
                      </Button>

                      {/* Delete Button */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteWorkflow(workflow);
                        }}
                        disabled={runningWorkflows().has(workflow.id) || deletingWorkflows().has(workflow.id)}
                        class="flex items-center justify-center size-8 rounded-full hover:bg-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete workflow"
                      >
                        {deletingWorkflows().has(workflow.id) ? (
                          <Loader2 class="size-4 animate-spin" />
                        ) : (
                          <Trash2 class="size-4" />
                        )}
                      </Button>
                    </div>

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

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog()} onOpenChange={setShowDeleteDialog}>
        <DialogContent class="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Workflow</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>"{workflowToDelete()?.title}"</strong>? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              variant="outline"
              onClick={cancelDeleteWorkflow}
              disabled={deletingWorkflows().has(workflowToDelete()?.id || '')}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteWorkflow}
              disabled={deletingWorkflows().has(workflowToDelete()?.id || '')}
              class="flex items-center gap-2"
            >
              <Show when={deletingWorkflows().has(workflowToDelete()?.id || '')}>
                <Loader2 class="size-4 animate-spin" />
              </Show>
              Delete Workflow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error Dialog */}
      <Dialog open={showErrorDialog()} onOpenChange={setShowErrorDialog}>
        <DialogContent class="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Error</DialogTitle>
            <DialogDescription>
              {errorMessage()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowErrorDialog(false)}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WorkflowsPage; 