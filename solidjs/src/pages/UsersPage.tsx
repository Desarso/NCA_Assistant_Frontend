import { Component, createSignal, For, onMount, Show, createMemo, createEffect, onCleanup } from 'solid-js';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogFooter, 
  DialogTitle, 
  DialogDescription 
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { User, Shield, Key, Loader2, Plus, X, Search, ChevronDown, Check } from 'lucide-solid';
import { authFetch } from '@/lib/utils';
import { useTheme } from '@/lib/theme-provider';
import AgGridSolid from 'solid-ag-grid';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

const HOST = import.meta.env.VITE_CHAT_HOST;

interface UserWithRoles {
  id: string;
  email: string;
  name: string | null;
  roles: string[];
  permissions: string[];
  created_at: string | null;
  microsoft_consent_given: boolean;
  total_bytes: number;
}

interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  user_count: number;
}

interface Permission {
  id: string;
  name: string;
  description: string | null;
  roles: string[];
}

const UsersPage: Component = () => {
  const { theme } = useTheme();
  const [users, setUsers] = createSignal<UserWithRoles[]>([]);
  const [roles, setRoles] = createSignal<Role[]>([]);
  const [permissions, setPermissions] = createSignal<Permission[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [selectedUser, setSelectedUser] = createSignal<UserWithRoles | null>(null);
  const [showUserDialog, setShowUserDialog] = createSignal(false);
  const [showRoleDialog, setShowRoleDialog] = createSignal(false);
  const [selectedRole, setSelectedRole] = createSignal<string>('');
  const [selectedRoleForEdit, setSelectedRoleForEdit] = createSignal<Role | null>(null);
  const [showRoleEditDialog, setShowRoleEditDialog] = createSignal(false);
  const [selectedPermissions, setSelectedPermissions] = createSignal<string[]>([]);
  const [activeTab, setActiveTab] = createSignal<'users' | 'roles'>('users');
  const [searchQuery, setSearchQuery] = createSignal('');
  const [selectedRoles, setSelectedRoles] = createSignal<string[]>([]);
  const [isRolePopoverOpen, setIsRolePopoverOpen] = createSignal(false);
  const [systemPrefersDark, setSystemPrefersDark] = createSignal(
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  // Determine if dark mode is active
  const isDarkMode = createMemo(() => {
    const currentTheme = theme();
    if (currentTheme === 'dark') return true;
    if (currentTheme === 'light') return false;
    // For 'system', use the system preference signal
    return systemPrefersDark();
  });

  // Get the appropriate ag-grid theme class and styles
  const gridThemeClass = createMemo(() => 'ag-theme-quartz');
  
  const gridStyles = createMemo(() => {
    if (isDarkMode()) {
      return {
        height: '600px',
        width: '100%',
        '--ag-background-color': 'rgb(15, 23, 42)', // slate-900
        '--ag-header-background-color': 'rgb(30, 41, 59)', // slate-800
        '--ag-odd-row-background-color': 'rgb(15, 23, 42)', // slate-900
        '--ag-row-hover-color': 'rgb(30, 41, 59)', // slate-800
        '--ag-border-color': 'rgb(51, 65, 85)', // slate-700
        '--ag-header-foreground-color': 'rgb(226, 232, 240)', // slate-200
        '--ag-foreground-color': 'rgb(226, 232, 240)', // slate-200
        '--ag-secondary-foreground-color': 'rgb(203, 213, 225)', // slate-300
        '--ag-input-disabled-background-color': 'rgb(30, 41, 59)', // slate-800
        '--ag-input-disabled-border-color': 'rgb(51, 65, 85)', // slate-700
        '--ag-selected-row-background-color': 'rgb(30, 58, 138)', // blue-900
        '--ag-range-selection-background-color': 'rgba(30, 58, 138, 0.2)', // blue-900 with opacity
      };
    }
    return { height: '600px', width: '100%' };
  });

  // Listen for system theme changes
  createEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    onCleanup(() => {
      mediaQuery.removeEventListener('change', handleChange);
    });
  });

  // Load data on mount
  onMount(async () => {
    await loadData();
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersRes, rolesRes, permissionsRes] = await Promise.all([
        authFetch(`${HOST}/api/v1/users/admin/users`),
        authFetch(`${HOST}/api/v1/users/admin/roles`),
        authFetch(`${HOST}/api/v1/users/admin/permissions`),
      ]);

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData);
      }

      if (rolesRes.ok) {
        const rolesData = await rolesRes.json();
        setRoles(rolesData);
      }

      if (permissionsRes.ok) {
        const permissionsData = await permissionsRes.json();
        setPermissions(permissionsData);
      }
    } catch (error) {
      console.error('Error loading users data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUserClick = (user: UserWithRoles) => {
    setSelectedUser(user);
    setShowUserDialog(true);
  };

  const handleAssignRole = async (userId: string, roleId: string) => {
    try {
      const response = await authFetch(`${HOST}/api/v1/users/admin/users/${userId}/roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role_id: roleId }),
      });

      if (response.ok) {
        await loadData();
        if (selectedUser()?.id === userId) {
          const updatedUser = users().find(u => u.id === userId);
          if (updatedUser) setSelectedUser(updatedUser);
        }
      } else {
        const error = await response.json();
        alert(`Failed to assign role: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error assigning role:', error);
      alert('Failed to assign role');
    }
  };

  const handleRemoveRole = async (userId: string, roleId: string) => {
    try {
      const response = await authFetch(`${HOST}/api/v1/users/admin/users/${userId}/roles/${roleId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadData();
        if (selectedUser()?.id === userId) {
          const updatedUser = users().find(u => u.id === userId);
          if (updatedUser) setSelectedUser(updatedUser);
        }
      } else {
        const error = await response.json();
        alert(`Failed to remove role: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error removing role:', error);
      alert('Failed to remove role');
    }
  };

  const handleRoleClick = (role: Role) => {
    setSelectedRoleForEdit(role);
    setSelectedPermissions([...role.permissions]);
    setShowRoleEditDialog(true);
  };

  const handleUpdateRolePermissions = async () => {
    const role = selectedRoleForEdit();
    if (!role) return;

    try {
      const response = await authFetch(`${HOST}/api/v1/users/admin/roles/${role.id}/permissions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ permission_ids: selectedPermissions() }),
      });

      if (response.ok) {
        await loadData();
        setShowRoleEditDialog(false);
        setSelectedRoleForEdit(null);
        setSelectedPermissions([]);
      } else {
        const error = await response.json();
        alert(`Failed to update permissions: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error updating role permissions:', error);
      alert('Failed to update permissions');
    }
  };

  const togglePermission = (permissionId: string) => {
    const current = selectedPermissions();
    if (current.includes(permissionId)) {
      setSelectedPermissions(current.filter(p => p !== permissionId));
    } else {
      setSelectedPermissions([...current, permissionId]);
    }
  };

  // Filter users based on search query and selected roles
  const filteredUsers = createMemo(() => {
    let filtered = users();
    
    // Filter by search query (email and name)
    const query = searchQuery().toLowerCase().trim();
    if (query) {
      filtered = filtered.filter(user => {
        const emailMatch = user.email.toLowerCase().includes(query);
        const nameMatch = user.name?.toLowerCase().includes(query) || false;
        return emailMatch || nameMatch;
      });
    }
    
    // Filter by selected roles
    const roleFilter = selectedRoles();
    if (roleFilter.length > 0) {
      filtered = filtered.filter(user => {
        // Check if user has any of the selected roles
        return roleFilter.some(roleId => user.roles.includes(roleId));
      });
    }
    
    return filtered;
  });

  // Get unique role IDs from all users with their names
  const availableRoles = createMemo(() => {
    const roleSet = new Set<string>();
    users().forEach(user => {
      user.roles.forEach(role => roleSet.add(role));
    });
    const roleIds = Array.from(roleSet).sort();
    // Map role IDs to role objects with names
    return roleIds.map(roleId => {
      const role = roles().find(r => r.id === roleId);
      return {
        id: roleId,
        name: role?.name || roleId
      };
    });
  });

  // Toggle role selection
  const toggleRole = (roleId: string) => {
    const current = selectedRoles();
    if (current.includes(roleId)) {
      setSelectedRoles(current.filter(r => r !== roleId));
    } else {
      setSelectedRoles([...current, roleId]);
    }
  };

  // AG Grid column definitions for users
  const columnDefs = createMemo(() => [
    {
      field: 'email',
      headerName: 'Email',
      sortable: true,
      flex: 1,
      minWidth: 200,
    },
    {
      field: 'name',
      headerName: 'Name',
      sortable: true,
      flex: 1,
      minWidth: 150,
      valueGetter: (params: any) => params.data?.name || 'No name',
    },
    {
      field: 'roles',
      headerName: 'Role',
      sortable: true,
      flex: 1,
      minWidth: 200,
      valueGetter: (params: any) => {
        const roles = params.data?.roles || [];
        return roles.join(', ') || 'No roles';
      },
    },
    {
      field: 'total_bytes',
      headerName: 'Total Bytes',
      sortable: true,
      flex: 1,
      minWidth: 150,
      valueGetter: (params: any) => params.data?.total_bytes || 0,
      cellRenderer: (params: any) => {
        const bytes = params.value || 0;
        return bytes.toLocaleString();
      },
    },
  ]);

  const defaultColDef = createMemo(() => ({
    resizable: true,
    sortable: true,
  }));

  // Sort roles so super_admin is first
  const sortedRoles = createMemo(() => {
    const allRoles = roles();
    const superAdmin = allRoles.find(r => r.id === 'super_admin');
    const otherRoles = allRoles.filter(r => r.id !== 'super_admin');
    return superAdmin ? [superAdmin, ...otherRoles] : allRoles;
  });

  // AG Grid column definitions for roles
  const roleColumnDefs = createMemo(() => [
    {
      field: 'name',
      headerName: 'Name',
      sortable: true,
      flex: 1,
      minWidth: 150,
    },
    {
      field: 'permissions',
      headerName: 'Permissions',
      sortable: true,
      flex: 1,
      minWidth: 200,
      valueGetter: (params: any) => {
        const perms = params.data?.permissions || [];
        return `${perms.length} permission${perms.length !== 1 ? 's' : ''}`;
      },
    },
    {
      field: 'user_count',
      headerName: 'Users',
      sortable: true,
      width: 100,
      valueGetter: (params: any) => params.data?.user_count || 0,
    },
  ]);

  const roleGridOptions = createMemo(() => ({
    defaultColDef: defaultColDef(),
    pagination: false,
    animateRows: true,
    rowSelection: 'single' as const,
    getRowStyle: (params: any) => {
      if (params.data?.id === 'super_admin') {
        return { 
          opacity: '0.6',
          cursor: 'not-allowed'
        };
      }
      return { cursor: 'pointer' };
    },
    onRowClicked: (event: any) => {
      if (event.data && event.data.id !== 'super_admin') {
        handleRoleClick(event.data);
      }
    },
  }));

  const gridOptions = createMemo(() => ({
    defaultColDef: defaultColDef(),
    pagination: false,
    animateRows: true,
    rowSelection: 'single' as const,
    onRowClicked: (event: any) => {
      if (event.data) {
        handleUserClick(event.data);
      }
    },
  }));

  return (
    <div class="flex flex-col h-full w-full overflow-hidden">
      <div class="flex-1 overflow-y-auto p-6">
        <div class="max-w-7xl mx-auto">
          <div class="mb-6">
            <h1 class="text-3xl font-bold mb-2">Users Management</h1>
            <p class="text-muted-foreground">Manage users, roles, and permissions</p>
          </div>

          <Show when={loading()}>
            <div class="flex items-center justify-center py-12">
              <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </Show>

          <Show when={!loading()}>
            <Tabs value={activeTab()} onChange={(value) => setActiveTab(value as 'users' | 'roles')}>
              <TabsList class="mb-6">
                <TabsTrigger value="users" class="flex items-center gap-2">
                  <User class="h-4 w-4" />
                  Users ({users().length})
                </TabsTrigger>
                <TabsTrigger value="roles" class="flex items-center gap-2">
                  <Shield class="h-4 w-4" />
                  Roles ({roles().length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="users" class="mt-0">
                <div class="bg-card rounded-lg border border-border p-6">
                  <div class="flex items-center justify-between mb-4">
                    <h2 class="text-xl font-semibold flex items-center gap-2">
                      <User class="h-5 w-5" />
                      Users
                    </h2>
                  </div>
                  
                  {/* Search and Filter Controls */}
                  <div class="flex flex-col sm:flex-row gap-4 mb-4">
                    {/* Search Bar */}
                    <div class="flex-1 relative">
                      <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Search by email or name..."
                        value={searchQuery()}
                        onInput={(e) => setSearchQuery(e.currentTarget.value)}
                        class="pl-9"
                      />
                    </div>
                    
                    {/* Role Filter Multi-Select */}
                    <Popover open={isRolePopoverOpen()} onOpenChange={setIsRolePopoverOpen}>
                      <PopoverTrigger as="button" class="inline-flex items-center justify-between gap-2 h-9 px-4 py-2 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent hover:text-accent-foreground min-w-[200px]">
                        <span class="flex items-center gap-2">
                          <Shield class="h-4 w-4" />
                          {selectedRoles().length === 0 
                            ? 'All Roles' 
                            : `${selectedRoles().length} role${selectedRoles().length !== 1 ? 's' : ''} selected`}
                        </span>
                        <ChevronDown class="h-4 w-4 opacity-50" />
                      </PopoverTrigger>
                      <PopoverContent class="w-[200px] p-0">
                        <div class="p-2">
                          <div class="px-2 py-1.5 text-sm font-semibold">Filter by Role</div>
                          <div class="max-h-[300px] overflow-y-auto">
                            <For each={availableRoles()}>
                              {(role) => {
                                const isSelected = () => selectedRoles().includes(role.id);
                                return (
                                  <button
                                    onClick={() => toggleRole(role.id)}
                                    class="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                                  >
                                    <Check class={`h-4 w-4 ${isSelected() ? 'opacity-100' : 'opacity-0'}`} />
                                    <span>{role.name}</span>
                                  </button>
                                );
                              }}
                            </For>
                          </div>
                          {selectedRoles().length > 0 && (
                            <div class="mt-2 pt-2 border-t border-border">
                              <button
                                onClick={() => setSelectedRoles([])}
                                class="w-full text-sm text-muted-foreground hover:text-foreground px-2 py-1.5"
                              >
                                Clear filters
                              </button>
                            </div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  <div class={gridThemeClass()} style={gridStyles()}>
                    <AgGridSolid
                      gridOptions={gridOptions() as any}
                      rowData={filteredUsers()}
                      columnDefs={columnDefs() as any}
                      defaultColDef={defaultColDef()}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="roles" class="mt-0">
                <div class="space-y-6">
                  {/* Roles Table */}
                  <div class="bg-card rounded-lg border border-border p-6">
                    <h2 class="text-xl font-semibold mb-4 flex items-center gap-2">
                      <Shield class="h-5 w-5" />
                      Roles ({roles().length})
                    </h2>
                    <div class="mb-2 text-sm text-muted-foreground">
                      Click a role to edit its permissions.
                    </div>
                    <div class={gridThemeClass()} style={gridStyles()}>
                      <AgGridSolid
                        gridOptions={roleGridOptions() as any}
                        rowData={sortedRoles()}
                        columnDefs={roleColumnDefs() as any}
                        defaultColDef={defaultColDef()}
                      />
                    </div>
                  </div>

                  {/* Permissions Summary */}
                  <div class="bg-card rounded-lg border border-border p-6">
                    <h2 class="text-xl font-semibold mb-4 flex items-center gap-2">
                      <Key class="h-5 w-5" />
                      Permissions ({permissions().length})
                    </h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      <For each={permissions()}>
                        {(permission) => (
                          <div class="p-3 rounded-md border border-border bg-muted/30">
                            <div class="font-medium text-sm mb-1">{permission.name}</div>
                            <div class="text-xs text-muted-foreground">
                              {permission.roles.length} role{permission.roles.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </Show>
        </div>
      </div>

      {/* User Details Dialog */}
      <Dialog open={showUserDialog()} onOpenChange={setShowUserDialog}>
        <DialogContent class="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>
              Manage roles and permissions for {selectedUser()?.email}
            </DialogDescription>
          </DialogHeader>
          <Show when={selectedUser()}>
            {(user) => (
              <div class="space-y-4">
                <div>
                  <div class="text-sm font-medium mb-2">Email</div>
                  <div class="text-sm text-muted-foreground">{user().email}</div>
                </div>
                <div>
                  <div class="text-sm font-medium mb-2">Name</div>
                  <div class="text-sm text-muted-foreground">{user().name || 'No name'}</div>
                </div>
                <div>
                  <div class="text-sm font-medium mb-2">Current Roles</div>
                  <div class="flex flex-wrap gap-2 mb-4">
                    <For each={user().roles}>
                      {(role) => (
                        <div class="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm">
                          <span>{role}</span>
                          <button
                            onClick={() => handleRemoveRole(user().id, role)}
                            class="hover:text-destructive"
                          >
                            <X class="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
                <div>
                  <div class="text-sm font-medium mb-2">Assign Role</div>
                  <div class="flex gap-2">
                    <select
                      value={selectedRole()}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      class="flex-1 px-3 py-2 rounded-md border border-border bg-background"
                    >
                      <option value="">Select a role...</option>
                      <For each={roles().filter(r => !user().roles.includes(r.id))}>
                        {(role) => (
                          <option value={role.id}>{role.name}</option>
                        )}
                      </For>
                    </select>
                    <Button
                      onClick={() => {
                        if (selectedRole()) {
                          handleAssignRole(user().id, selectedRole());
                          setSelectedRole('');
                        }
                      }}
                      disabled={!selectedRole()}
                    >
                      <Plus class="h-4 w-4 mr-2" />
                      Add
                    </Button>
                  </div>
                </div>
                <div>
                  <div class="text-sm font-medium mb-2">Permissions</div>
                  <div class="flex flex-wrap gap-2">
                    <For each={user().permissions}>
                      {(permission) => (
                        <span class="px-2 py-1 rounded-md bg-muted text-sm">{permission}</span>
                      )}
                    </For>
                  </div>
                </div>
              </div>
            )}
          </Show>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUserDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Edit Dialog */}
      <Dialog open={showRoleEditDialog()} onOpenChange={setShowRoleEditDialog}>
        <DialogContent class="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Role Permissions</DialogTitle>
            <DialogDescription>
              Manage permissions for {selectedRoleForEdit()?.name}
            </DialogDescription>
          </DialogHeader>
          <Show when={selectedRoleForEdit()}>
            {(role) => (
              <div class="space-y-4">
                <div>
                  <div class="text-sm font-medium mb-2">Role Name</div>
                  <div class="text-sm text-muted-foreground">{role().name}</div>
                </div>
                <div>
                  <div class="text-sm font-medium mb-2">Description</div>
                  <div class="text-sm text-muted-foreground">{role().description || 'No description'}</div>
                </div>
                <div>
                  <div class="text-sm font-medium mb-2">Select Permissions</div>
                  <div class="space-y-2 max-h-[300px] overflow-y-auto border border-border rounded-md p-3">
                    <For each={permissions()}>
                      {(permission) => {
                        const isSelected = () => selectedPermissions().includes(permission.id);
                        return (
                          <button
                            onClick={() => togglePermission(permission.id)}
                            class="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors text-left"
                          >
                            <Check class={`h-4 w-4 ${isSelected() ? 'opacity-100' : 'opacity-0'}`} />
                            <div class="flex-1">
                              <div class="text-sm font-medium">{permission.name}</div>
                              {permission.description && (
                                <div class="text-xs text-muted-foreground">{permission.description}</div>
                              )}
                            </div>
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </div>
              </div>
            )}
          </Show>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowRoleEditDialog(false);
              setSelectedRoleForEdit(null);
              setSelectedPermissions([]);
            }}>
              Cancel
            </Button>
            <Button onClick={handleUpdateRolePermissions}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersPage;

