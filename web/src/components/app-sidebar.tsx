import { useState, useEffect, useMemo, useCallback } from "react";
import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { Link, useParams, useNavigate } from "react-router-dom";
import WhagonsLogo from "@/assets/WhagonsLogo";
import AvatarDropdown from "./avatar-dropdown";
import { useChatContext } from "@/layout";
import { MessageCache, ConversationCache } from "@/aichat/utils/memory_cache";
import { HOST } from "@/aichat/utils/utils";
import { authFetch } from "@/lib/utils";

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export function AppSidebar() {
  const { chats, setChats } = useChatContext();
  const params = useParams();
  const navigate = useNavigate();
  const currentChatId = params.id;

  const [pinnedChatIds, setPinnedChatIds] = useState<string[]>([]);
  const [confirmDeleteChatId, setConfirmDeleteChatId] = useState<string | null>(null);

  // Load pinned chats from localStorage on mount
  useEffect(() => {
    try {
      const storedPinnedIds = localStorage.getItem('pinnedChatIds');
      if (storedPinnedIds) {
        setPinnedChatIds(JSON.parse(storedPinnedIds));
      }
    } catch (error) {
      console.error("Error loading pinned chats from localStorage:", error);
      localStorage.removeItem('pinnedChatIds');
    }
  }, []);

  // Save pinned chats to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('pinnedChatIds', JSON.stringify(pinnedChatIds));
    } catch (error) {
      console.error("Error saving pinned chats to localStorage:", error);
    }
  }, [pinnedChatIds]);

  // Group chats by time periods
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const yesterday = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return d;
  }, [today]);

  const lastWeek = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 7);
    return d;
  }, [today]);

  const lastMonth = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return d;
  }, [today]);

  const currentYear = today.getFullYear();

  // Filter non-pinned chats
  const nonPinnedChats = useMemo(() => 
    chats.filter(chat => !pinnedChatIds.includes(chat.id)),
    [chats, pinnedChatIds]
  );

  // Group chats
  const groupedChats = useMemo(() => ({
    today: nonPinnedChats.filter((chat) => new Date(chat.created_at) >= today),
    yesterday: nonPinnedChats.filter((chat) => {
      const chatDate = new Date(chat.created_at);
      return chatDate >= yesterday && chatDate < today;
    }),
    lastWeek: nonPinnedChats.filter((chat) => {
      const chatDate = new Date(chat.created_at);
      return chatDate >= lastWeek && chatDate < yesterday;
    }),
    lastMonth: nonPinnedChats.filter((chat) => {
      const chatDate = new Date(chat.created_at);
      return chatDate >= lastMonth && chatDate < lastWeek;
    }),
    byMonth: nonPinnedChats.filter((chat) => {
      const chatDate = new Date(chat.created_at);
      return chatDate.getFullYear() === currentYear && chatDate < lastMonth;
    }),
    byYear: nonPinnedChats.filter((chat) => {
      const chatDate = new Date(chat.created_at);
      return chatDate.getFullYear() < currentYear;
    }),
  }), [nonPinnedChats, today, yesterday, lastWeek, lastMonth, currentYear]);

  const pinnedChats = useMemo(() => 
    chats.filter(chat => pinnedChatIds.includes(chat.id))
         .sort((a, b) => pinnedChatIds.indexOf(a.id) - pinnedChatIds.indexOf(b.id)),
    [chats, pinnedChatIds]
  );

  // Group by month
  const monthlyGroups = useMemo(() => {
    return groupedChats.byMonth.reduce<Record<string, Conversation[]>>(
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
  }, [groupedChats.byMonth]);

  // Group by year
  const yearlyGroups = useMemo(() => {
    return groupedChats.byYear.reduce<Record<number, Conversation[]>>(
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
  }, [groupedChats.byYear]);

  // Handlers
  const pinChat = useCallback((chatId: string) => {
    setPinnedChatIds(prev => {
      if (prev.length < 10 && !prev.includes(chatId)) {
        return [...prev, chatId];
      }
      return prev;
    });
  }, []);

  const unpinChat = useCallback((chatId: string) => {
    setPinnedChatIds(prev => prev.filter(id => id !== chatId));
  }, []);

  const deleteChat = useCallback(async (chatToDelete: Conversation) => {
    const originalChats = [...chats];
    const originalPinnedIds = [...pinnedChatIds];
    const chatId = chatToDelete.id;

    // Optimistic UI Update
    setChats(prev => prev.filter(chat => chat.id !== chatId));
    setPinnedChatIds(prev => prev.filter(id => id !== chatId));

    try {
      const response = await authFetch(`${HOST}/api/v1/chats/conversations/${chatId}`, { 
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete: ${response.status}`);
      }

      // Clear caches
      await ConversationCache.delete(chatId);
      sessionStorage.removeItem(`messages-${chatId}`);

      // Navigate away if current chat was deleted
      if (currentChatId === chatId) {
        navigate("/chat/");
      }

    } catch (error) {
      console.error("Error deleting chat:", error);
      alert(`Failed to delete chat: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Rollback
      setChats(originalChats);
      setPinnedChatIds(originalPinnedIds);
    }
  }, [chats, pinnedChatIds, currentChatId, navigate, setChats]);

  const renderChatSection = (title: string, chatsToRender: Conversation[]) => {
    if (chatsToRender.length === 0) return null;

    return (
      <div className="mb-4">
        <div className="text-xs font-bold text-gray-700 dark:text-gray-400 px-3 mb-2">
          {title}
        </div>
        <div className="space-y-1">
          {chatsToRender.map((chat) => (
            <div key={chat.id} className="group/menu-item relative">
              <Link
                to={`/chat/${chat.id}`}
                className={`group/link relative flex items-center gap-2 pl-3 pr-10 py-2 text-base md:text-[13px] font-medium rounded-md hover:bg-white dark:hover:bg-gray-700 w-full overflow-hidden transition-colors ${
                  currentChatId === chat.id
                    ? "bg-white dark:bg-gray-700"
                    : "text-[#696a6a] dark:text-gray-200"
                }`}
              >
                <span className="truncate font-bold">{chat.title}</span>
              </Link>
              
              {/* Hover buttons */}
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end text-gray-500 dark:text-gray-400 transition-transform transform translate-x-[102%] group-hover/menu-item:translate-x-0 group-hover/menu-item:pointer-events-auto">
                <div className="relative z-10 flex items-center pr-1 bg-transparent rounded-r-md gap-1">
                  {pinnedChatIds.includes(chat.id) ? (
                    <button
                      className="rounded-md p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600"
                      title="Unpin chat"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); unpinChat(chat.id); }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="2" x2="22" y1="2" y2="22"/>
                        <path d="M12 17v5"/>
                        <path d="M9 14v-4"/>
                        <path d="M15 14v-4"/>
                        <path d="M9 5h6"/>
                        <path d="M16 7l1 5v3H7v-3l1-5"/>
                      </svg>
                    </button>
                  ) : (
                    <button
                      className="rounded-md p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                      title="Pin chat"
                      disabled={pinnedChatIds.length >= 10}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); pinChat(chat.id); }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 17v5"/>
                        <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>
                      </svg>
                    </button>
                  )}
                  <button
                    className="rounded-md p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600"
                    title="Delete chat"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteChatId(chat.id); }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18"/>
                      <path d="m6 6 12 12"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const chatToDelete = useMemo(() => {
    if (!confirmDeleteChatId) return null;
    return chats.find(chat => chat.id === confirmDeleteChatId) || null;
  }, [confirmDeleteChatId, chats]);

  return (
    <>
      <Sidebar collapsible="offcanvas" side="left" variant="sidebar">
        <SidebarContent className="bg-sidebar flex flex-col h-screen">
          <div className="p-3 flex flex-col items-center">
            <WhagonsLogo
              fill="#535353"
              darkFill="#d1d5db"
              width={180}
              height={50}
            />
            <Link
              to="/chat/"
              className="rounded-md px-3 py-2 mt-5 text-sm font-medium w-full text-white gradient-button transition-colors block text-center"
            >
              + New Chat
            </Link>
          </div>
          
          <div className="flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto overflow-x-hidden scrollbar p-2">
              {renderChatSection("Pinned", pinnedChats)}
              {renderChatSection("Today", groupedChats.today)}
              {renderChatSection("Yesterday", groupedChats.yesterday)}
              {renderChatSection("Last 7 Days", groupedChats.lastWeek)}
              {renderChatSection("Last 30 Days", groupedChats.lastMonth)}
              
              {Object.entries(monthlyGroups)
                .sort(([aMonth], [bMonth]) => 
                  new Date(`1 ${bMonth} 2000`).getMonth() - new Date(`1 ${aMonth} 2000`).getMonth()
                )
                .map(([month, monthChats]) => (
                  <div key={month}>{renderChatSection(month, monthChats)}</div>
                ))}
              
              {Object.entries(yearlyGroups)
                .sort(([a], [b]) => Number(b) - Number(a))
                .map(([year, yearChats]) => (
                  <div key={year}>{renderChatSection(String(year), yearChats)}</div>
                ))}
            </div>
          </div>
          
          <div className="p-4 mt-auto">
            <AvatarDropdown className="w-full" />
          </div>
        </SidebarContent>
      </Sidebar>

      {/* Delete confirmation dialog */}
      {chatToDelete && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setConfirmDeleteChatId(null)}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 m-4 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Confirm Deletion
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              Are you sure you want to delete the chat "<span className="font-medium">{chatToDelete.title}</span>"?
              This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setConfirmDeleteChatId(null)}
                className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteChat(chatToDelete);
                  setConfirmDeleteChatId(null);
                }}
                className="px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
