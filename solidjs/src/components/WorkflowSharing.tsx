import { Component, createSignal, Show, For } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Share2, UserPlus, Check, ChevronsUpDown } from 'lucide-solid';
import { authFetch } from '@/lib/utils';

const HOST = import.meta.env.VITE_API_HOST || 'http://localhost:8000';

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

interface WorkflowSharingProps {
  workflowId: string;
  sharedUsers: SharedUser[];
  onSharedUsersChange: (users: SharedUser[]) => void;
}

const WorkflowSharing: Component<WorkflowSharingProps> = (props) => {
  const [sharingError, setSharingError] = createSignal('');
  const [searchTerm, setSearchTerm] = createSignal('');
  const [users, setUsers] = createSignal<User[]>([]);
  const [selectedUser, setSelectedUser] = createSignal<User | null>(null);
  const [isSearchOpen, setIsSearchOpen] = createSignal(false);
  const [isSearching, setIsSearching] = createSignal(false);

  // Add function to load shared users
  const loadSharedUsers = async () => {
    try {
      const response = await authFetch(`${HOST}/api/v1/workflows/${props.workflowId}/shared`);
      if (response.ok) {
        const data = await response.json();
        props.onSharedUsersChange(data);
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

  // Share workflow function
  const shareWorkflow = async () => {
    try {
      setSharingError('');
      const user = selectedUser();
      if (!user) return;

      const response = await authFetch(`${HOST}/api/v1/workflows/${props.workflowId}/share`, {
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
      const response = await authFetch(`${HOST}/api/v1/workflows/${props.workflowId}/share/${userId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadSharedUsers();
      }
    } catch (error) {
      console.error('Error removing shared access:', error);
    }
  };

  return (
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
            when={props.sharedUsers.length > 0} 
            fallback={
              <p class="text-muted-foreground">This workflow hasn't been shared with anyone yet.</p>
            }
          >
            <For each={props.sharedUsers}>
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
  );
};

export default WorkflowSharing; 