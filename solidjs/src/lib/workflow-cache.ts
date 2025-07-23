import { auth } from "@/lib/firebase";
import { DB } from "@/aichat/utils/memory_cache";

export interface Workflow {
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

const HOST = import.meta.env.VITE_API_HOST || 'http://localhost:8000';

export class WorkflowCache {
  // Cache invalidation listeners
  private static invalidationListeners = new Set<() => void>();

  // Method to add a listener for cache invalidation events
  public static addInvalidationListener(callback: () => void) {
    WorkflowCache.invalidationListeners.add(callback);
    return () => WorkflowCache.invalidationListeners.delete(callback);
  }

  // Method to notify listeners when cache is invalidated
  private static notifyInvalidation() {
    WorkflowCache.invalidationListeners.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Error in workflow cache invalidation listener:', error);
      }
    });
  }

  // Fetch workflows from backend without using cache
  public static async fetchWorkflowsNoCache(): Promise<Workflow[]> {
    try {
      const { authFetch } = await import("@/lib/utils");
      
      // Get cached workflows for comparison
      const cachedWorkflows = await DB.getWorkflows();
      const cachedWorkflowsMap = new Map(
        (cachedWorkflows || []).map((wf: Workflow) => [wf.id, wf])
      );

      const response = await authFetch(`${HOST}/api/v1/workflows`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const workflows = await response.json() as Workflow[];
      
      // Check for updates and invalidate cache if needed
      const workflowsToInvalidate: string[] = [];
      
      for (const serverWf of workflows) {
        const cachedWf = cachedWorkflowsMap.get(serverWf.id);
        if (cachedWf) {
          const serverTimestamp = new Date(serverWf.updated_at).getTime();
          const cachedTimestamp = new Date(cachedWf.updated_at).getTime();
          
          if (serverTimestamp > cachedTimestamp) {
            workflowsToInvalidate.push(serverWf.id);
            console.log(`Workflow ${serverWf.id} needs sync - server: ${serverWf.updated_at}, cached: ${cachedWf.updated_at}`);
          }
        }
      }

      // Invalidate cached workflows that have been updated
      if (workflowsToInvalidate.length > 0) {
        console.log(`Invalidating cached data for ${workflowsToInvalidate.length} workflows`);
        WorkflowCache.notifyInvalidation();
      }

      // Update cache with fresh data
      if (response.status === 200) {
        WorkflowCache.set(workflows);
      }

      return workflows;
    } catch (error) {
      console.error("Failed to fetch workflows:", error);
      return [];
    }
  }

  public static has(): boolean {
    return sessionStorage.getItem('workflows') !== null;
  }

  public static async get(): Promise<Workflow[]> {
    // Try session storage first
    const workflows = sessionStorage.getItem('workflows');
    if (workflows) {
      return JSON.parse(workflows);
    }

    // Try IndexedDB next
    const dbWorkflows = await DB.getWorkflows();
    if (dbWorkflows) {
      WorkflowCache.set(dbWorkflows);
      return dbWorkflows;
    }

    // Finally, fetch from backend
    return await WorkflowCache.fetchWorkflowsNoCache();
  }

  public static set(workflows: Workflow[]) {
    if (!workflows) return;

    // Update session storage
    const data = JSON.stringify(workflows);
    sessionStorage.setItem("workflows", data);
    sessionStorage.setItem("workflows_timestamp", Date.now().toString());

    // Update IndexedDB
    DB.setWorkflows(workflows);
  }

  public static async delete(id: string): Promise<void> {
    try {
      // Update SessionStorage
      const storedData = sessionStorage.getItem("workflows");
      if (storedData) {
        const currentWorkflows = JSON.parse(storedData) as Workflow[];
        const updatedWorkflows = currentWorkflows.filter(wf => wf.id !== id);
        if (currentWorkflows.length !== updatedWorkflows.length) {
          sessionStorage.setItem("workflows", JSON.stringify(updatedWorkflows));
          sessionStorage.setItem("workflows_timestamp", Date.now().toString());
          console.log(`Removed workflow ${id} from SessionStorage.`);
        }
      }

      // Update IndexedDB
      await DB.deleteWorkflow(id);
    } catch (error) {
      console.error(`Error removing workflow ${id} from cache:`, error);
    }
  }

  // Method to get a single workflow by ID
  public static async getWorkflow(id: string): Promise<Workflow | null> {
    try {
      // Try session storage first
      const workflows = sessionStorage.getItem('workflows');
      if (workflows) {
        const workflowsList = JSON.parse(workflows) as Workflow[];
        const workflow = workflowsList.find(w => w.id === id);
        if (workflow) return workflow;
      }

      // Try IndexedDB next
      const dbWorkflows = await DB.getWorkflows();
      if (dbWorkflows) {
        const workflow = dbWorkflows.find(w => w.id === id);
        if (workflow) return workflow;
      }

      // Finally, fetch from backend
      const { authFetch } = await import("@/lib/utils");
      const response = await authFetch(`${HOST}/api/v1/workflows/${id}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const workflow = await response.json();
      return workflow;
    } catch (error) {
      console.error(`Failed to fetch workflow ${id}:`, error);
      return null;
    }
  }

  // Method to delete a workflow from both cache and server
  public static async deleteFromServer(id: string): Promise<boolean> {
    try {
      const { authFetch } = await import("@/lib/utils");
      
      const response = await authFetch(`${HOST}/api/v1/workflows/${id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete workflow: ${response.status} ${response.statusText}`);
      }

      // If server deletion was successful, remove from cache
      await WorkflowCache.delete(id);
      
      // Notify listeners that cache has been invalidated
      WorkflowCache.notifyInvalidation();
      
      console.log(`Successfully deleted workflow ${id} from server and cache`);
      return true;
    } catch (error) {
      console.error(`Failed to delete workflow ${id} from server:`, error);
      return false;
    }
  }

  // Method to clear all workflows from cache (useful for logout/refresh)
  public static clear(): void {
    sessionStorage.removeItem("workflows");
    sessionStorage.removeItem("workflows_timestamp");
    WorkflowCache.notifyInvalidation();
    console.log("Cleared workflow cache");
  }
} 