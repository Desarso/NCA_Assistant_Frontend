import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { A, Navigate, useParams, useNavigate } from "@solidjs/router";
import { useChatContext } from "@/layout";
import { createMemo, For, onMount, createSignal, Show, Switch, Match, createEffect } from "solid-js";
import { Portal } from "solid-js/web";
import NCALogo from "@/assets/NCALogo";
import AvatarDropdown from "./avatar-dropdown";
import { prefetchMessageHistory, MessageCache, DB, ConversationCache } from "@/aichat/utils/memory_cache";
import { HOST } from "@/aichat/utils/utils";
import { authFetch } from "@/lib/utils";
import { Pin, X, PinOff } from 'lucide-solid';
import { toast } from 'solid-toast';


// Define the Conversation type to match what's in layout.tsx
export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}


export function AppSidebar() {
  try {
    const { chats, setChats } = useChatContext();
    const { setOpenMobile } = useSidebar();
    const params = useParams();
    const navigate = useNavigate();
    const id = createMemo(() => params.id);
    
    // Initialize pinnedChatIds from localStorage or default to empty array
    const initialPinnedIds = () => {
        try {
            const stored = localStorage.getItem('pinnedChatIds');
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error("Failed to parse pinned chats from localStorage", e);
            return [];
        }
    };

    const [pinnedChatIds, setPinnedChatIds] = createSignal<string[]>([]);
    // State for confirmation dialog
    const [confirmDeleteChatId, setConfirmDeleteChatId] = createSignal<string | null>(null);
    // Ensure chats data is loaded

    // Load pinned chats from localStorage on component mount
    onMount(() => {
      try {
        const storedPinnedIds = localStorage.getItem('pinnedChatIds');
        if (storedPinnedIds) {
          setPinnedChatIds(JSON.parse(storedPinnedIds));
        }
      } catch (error) {
        console.error("Error loading pinned chats from localStorage:", error);
        localStorage.removeItem('pinnedChatIds'); // Clear corrupted data
      }
    });

    // Save pinned chats to localStorage whenever they change
    createEffect(() => {
      try {
        localStorage.setItem('pinnedChatIds', JSON.stringify(pinnedChatIds()));
      } catch (error) {
        console.error("Error saving pinned chats to localStorage:", error);
      }
    });

    // Check if we need to prefetch messages
    const handleChatMouseEnter = (chatId: string) => {
      // Only prefetch if not already in cache
      if (!MessageCache.has(chatId)) {
        prefetchMessageHistory(chatId);
      }
    };

    // Group chats by age
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const lastMonth = new Date(today);
    lastMonth.setDate(lastMonth.getDate() - 30);

    const currentYear = today.getFullYear();

    // Filter out pinned chats from the main list before grouping
    const nonPinnedChats = createMemo(() => 
      chats().filter(chat => !pinnedChatIds().includes(chat.id))
    );

    // Group chats by time periods using createMemo
    const groupedChats = createMemo(() => ({
      today: nonPinnedChats().filter((chat) => new Date(chat.created_at) >= today),
      yesterday: nonPinnedChats().filter((chat) => {
        const chatDate = new Date(chat.created_at);
        return chatDate >= yesterday && chatDate < today;
      }),
      lastWeek: nonPinnedChats().filter((chat) => {
        const chatDate = new Date(chat.created_at);
        return chatDate >= lastWeek && chatDate < yesterday;
      }),
      lastMonth: nonPinnedChats().filter((chat) => {
        const chatDate = new Date(chat.created_at);
        return chatDate >= lastMonth && chatDate < lastWeek;
      }),
      byMonth: nonPinnedChats().filter((chat) => {
        const chatDate = new Date(chat.created_at);
        return chatDate.getFullYear() === currentYear && chatDate < lastMonth;
      }),
      byYear: nonPinnedChats().filter((chat) => {
        const chatDate = new Date(chat.created_at);
        return chatDate.getFullYear() < currentYear;
      }),
    }));
    
    // Create a memo for pinned chats
    const pinnedChats = createMemo(() => 
       chats().filter(chat => pinnedChatIds().includes(chat.id))
               .sort((a, b) => pinnedChatIds().indexOf(a.id) - pinnedChatIds().indexOf(b.id)) // Maintain pin order
    );

    // --- Handler Functions ---

    const pinChat = (chatId: string) => {
      setPinnedChatIds(prev => {
        if (prev.length < 10 && !prev.includes(chatId)) {
          return [...prev, chatId];
        }
        return prev; // Return unchanged if limit reached or already pinned
      });
    };

    const unpinChat = (chatId: string) => {
      setPinnedChatIds(prev => prev.filter(id => id !== chatId));
    };

    const deleteChat = async (chatToDelete: Conversation) => {
        const originalChats = [...chats()]; // Store original list for potential rollback
        const originalPinnedIds = [...pinnedChatIds()]; // Store original pinned list
        const chatId = chatToDelete.id;
        const chatTitle = chatToDelete.title; // Store title for toast message

        // Optimistic UI Update: Remove the chat immediately
        setChats(prev => prev.filter(chat => chat.id !== chatId));
        setPinnedChatIds(prev => prev.filter(id => id !== chatId)); // Also remove from pinned if it was pinned

        try {
            // Use authFetch for the API endpoint
            const response = await authFetch(`${HOST}/api/v1/chats/conversations/${chatId}`, { 
                method: 'DELETE',
                // No need to set Content-Type or other headers usually, authFetch handles auth
            });

            if (!response.ok) {
                 // Extract error message from response if possible
                 let errorData;
                 try {
                     errorData = await response.json();
                 } catch (jsonError) {
                     // Ignore if response is not JSON
                 }
                 const errorMessage = errorData?.detail || `HTTP error! status: ${response.status}`;
                 throw new Error(`${errorMessage}`); // Throw extracted/generic error
            }
            
            // --- Success --- 
            
            // 1. Clear message history from IndexedDB cache
            try {
                await DB.deleteMessageHistory(chatId);
            } catch (cacheError) {
                console.error("Failed to clear message history from IndexedDB:", cacheError);
            }
            
            // 2. Clear conversation entry from ConversationCache (SessionStorage & IndexedDB)
            try {
                // Use the new dedicated delete function
                await ConversationCache.delete(chatId);
            } catch (cacheError) {
                console.error("Failed to update ConversationCache after deletion:", cacheError);
            }

            // 3. Clear message entry from SessionStorage 
            try {
                sessionStorage.removeItem(`messages-${chatId}`); 
                console.log(`Removed messages for conversation ${chatId} from SessionStorage`);
            } catch (storageError) {
                 console.error("Failed to remove message entry from SessionStorage:", storageError);
            }

            // 4. Navigate away if current chat was deleted
            if (id() === chatId) {
                navigate("/chat/");
                setOpenMobile(false); 
            }
            
            // Optional: Show a success toast
            // toast.success(`Chat "${chatTitle}" deleted.`); 

        } catch (error) {
            console.error("Error deleting chat:", error);
            // Show error toast with the specific error message
            toast.error(`Failed to delete chat "${chatTitle}": ${error instanceof Error ? error.message : 'Unknown error'}`);
            
            // Rollback: Restore the chat list and original pinned IDs
            setChats(originalChats); 
            setPinnedChatIds(originalPinnedIds);
        }
    };

    // Helper to find the chat object for deletion confirmation
    const chatToConfirmDelete = createMemo(() => {
      const chatId = confirmDeleteChatId();
      if (!chatId) return null;
      return chats().find(chat => chat.id === chatId) || null;
    });

    // Function to handle the actual deletion after confirmation
    const handleConfirmDelete = () => {
      const chat = chatToConfirmDelete();
      if (chat) {
        deleteChat(chat);
      }
      setConfirmDeleteChatId(null); // Close dialog
    };

    // Function to cancel deletion
    const handleCancelDelete = () => {
      setConfirmDeleteChatId(null); // Close dialog
    };

    // Group chats by month for the current year
    const monthlyGroups = createMemo(() => {
      return groupedChats().byMonth.reduce<Record<string, Conversation[]>>(
        (acc, chat) => {
          const date = new Date(chat.created_at);
          const month = date.toLocaleString("default", { month: "long" });
          if (!acc[month]) {
            acc[month] = [];
          }
          acc[month].push(chat);
          return acc;
        },
        {}
      );
    });

    // Group chats by year for older chats
    const yearlyGroups = createMemo(() => {
      return groupedChats().byYear.reduce<Record<number, Conversation[]>>(
        (acc, chat) => {
          const year = new Date(chat.created_at).getFullYear();
          if (!acc[year]) {
            acc[year] = [];
          }
          acc[year].push(chat);
          return acc;
        },
        {}
      );
    });

    const renderChatSection = (title: string, chatsToRender: Conversation[]) => {
        if (chatsToRender.length === 0) return null; 

      return (
        <div class="mb-4">
          <SidebarGroupLabel class="text-xs font-bold text-gray-700 dark:text-gray-400 px-3 mb-2">
            {title}
          </SidebarGroupLabel>
          <SidebarMenu class="space-y-1">
            <For each={chatsToRender}>
              {(chat) => (
                <SidebarMenuItem class="group/menu-item relative">
                  <A
                    href={`/chat/${chat.id}`}
                    onClick={() => setOpenMobile(false)}
                    onMouseEnter={() => handleChatMouseEnter(chat.id)}
                    class="group/link relative flex items-center gap-2 pl-3 pr-10 py-2 text-base md:text-[13px] font-medium text-[#696a6a] dark:text-gray-200 rounded-md group-hover/menu-item:bg-white dark:group-hover/menu-item:bg-gray-700 w-full overflow-hidden" 
                    classList={{
                      "bg-white dark:bg-gray-700": id() === chat.id,
                    }}
                  >
                    <span class="truncate font-bold">{chat.title}</span>
                  </A>
                   <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end text-gray-500 dark:text-gray-400 transition-transform transform translate-x-[102%] group-hover/menu-item:translate-x-0 group-hover/menu-item:pointer-events-auto">
                      <div 
                        class="absolute inset-y-0 right-full w-12 h-full bg-gradient-to-l from-[#e9ecef] dark:from-[#15202b] to-transparent opacity-0 group-hover/menu-item:opacity-100 group-hover/menu-item:from-white dark:group-hover/menu-item:from-gray-700 pointer-events-none" 
                        classList={{ "from-white dark:from-gray-700": id() === chat.id }}
                      />
                      <div 
                        class="relative z-10 flex items-center pr-1 bg-[#e9ecef] dark:bg-[#15202b] rounded-r-md group-hover/menu-item:bg-white dark:group-hover/menu-item:bg-gray-700"
                        classList={{ "bg-white dark:bg-gray-700": id() === chat.id }}
                      >
                        <Show 
                          when={pinnedChatIds().includes(chat.id)}
                          fallback={
                            <button 
                                class="rounded-md p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50" 
                                title="Pin chat"
                                disabled={pinnedChatIds().length >= 10}
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); pinChat(chat.id); }}
                            >
                                <Pin class="w-4 h-4" />
                            </button>
                         }
                       >
                            <button 
                                class="rounded-md p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600" 
                                title="Unpin chat"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); unpinChat(chat.id); }}
                            >
                                <PinOff class="w-4 h-4" />
                            </button>
                       </Show>
                       <button 
                          class="rounded-md p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600" 
                          title="Delete chat"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteChatId(chat.id); }}
                        >
                          <X class="w-4 h-4" /> 
                        </button>
                     </div>
                   </div>
                </SidebarMenuItem>
              )}
            </For>
          </SidebarMenu>
        </div>
      );
    };

    return (
      <Sidebar collapsible="offcanvas" side="left" variant="sidebar">
        <SidebarContent class="bg-[#e9ecef] dark:bg-[#15202b] flex flex-col h-screen">
          <div class="p-3 flex flex-col items-center">
            <NCALogo
              fill="#535353"
              darkFill="#d1d5db"
              width={180}
              height={50}
            />
            <A
              href="/chat/"
              onClick={() => setOpenMobile(false)}
              class="rounded-md px-3 py-2 mt-5 text-sm font-medium w-full text-white gradient-button transition-colors block text-center"
            >
              + New Chat
            </A>
          </div>
          
          <div class="flex-1 overflow-hidden">
            <div class="h-full overflow-y-auto overflow-x-hidden scrollbar p-2">
              {renderChatSection("Pinned", pinnedChats())}
              {renderChatSection("Today", groupedChats().today)}
              {renderChatSection("Yesterday", groupedChats().yesterday)}
              {renderChatSection("Last 7 Days", groupedChats().lastWeek)}
              {renderChatSection("Last 30 Days", groupedChats().lastMonth)}
              <For
                each={Object.entries(monthlyGroups()).sort(
                  ([aMonth], [bMonth]) => new Date(`1 ${bMonth} 2000`).getMonth() - new Date(`1 ${aMonth} 2000`).getMonth() 
                )}
              >
                {([month, monthChats]) => renderChatSection(month, monthChats)}
              </For>
              <For
                each={Object.entries(yearlyGroups()).sort(
                  ([a], [b]) => Number(b) - Number(a)
                )}
              >
                {([year, yearChats]) => renderChatSection(String(year), yearChats)} 
              </For>
            </div>
          </div>
          
          <div class="p-4 mt-auto">
            <AvatarDropdown class="w-full" />
          </div>
        </SidebarContent>
        <Portal>
            <Show when={chatToConfirmDelete()}>{(chat) =>
                    <div 
                        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" 
                        onClick={() => handleCancelDelete()} 
                    >
                        <div 
                            class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 m-4 max-w-sm w-full" 
                            onClick={(e) => e.stopPropagation()} 
                        > 
                            <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Confirm Deletion</h2>
                            <p class="text-sm text-gray-600 dark:text-gray-300 mb-6">
                                Are you sure you want to delete the chat "<span class="font-medium">{chat().title}</span>"?
                                This action cannot be undone.
                            </p>
                            <div class="flex justify-end space-x-3">
                                <button 
                                    onClick={() => handleCancelDelete()}
                                    class="px-4 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 dark:focus:ring-offset-gray-800"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={() => handleConfirmDelete()}
                                    class="px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:focus:ring-offset-gray-800"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                }</Show>
        </Portal>
      </Sidebar>
    );
  } catch (error) {
    console.error("Error in AppSidebar:", error);
    // Return a minimal sidebar when there's an error
    const navigate = useNavigate();
    const { setOpenMobile } = useSidebar();
    // Get context in error case too
    let resetCurrentChat;
    try {
       const context = useChatContext(); 
    } catch (e) {
      // Function stub if context is unavailable
      resetCurrentChat = () => {};
    }

    return (
      <Sidebar collapsible="offcanvas" side="left" variant="sidebar">
        <SidebarContent class="bg-[#ebebeb] dark:bg-[#15202b] flex flex-col h-screen">
          <div class="p-3 flex flex-col items-center">
            <NCALogo
              fill="#535353"
              darkFill="#d1d5db"
              width={180}
              height={50}
            />
            <A
              href="/chat/"
              onClick={() => setOpenMobile(false)}
              class="rounded-md px-3 py-2 mt-5 text-sm font-medium w-full text-white gradient-button transition-colors block text-center"
            >
              + New Chat
            </A>
          </div>
          
          <div class="flex-1">
            <div class="p-4 text-red-600">Error loading chat history.</div>
          </div>
          
          <div class="p-4 mt-auto">
            <AvatarDropdown class="w-full" />
          </div>
        </SidebarContent>
      </Sidebar>
    );
  }
}
