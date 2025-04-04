import { SidebarProvider, SidebarTrigger } from "./components/ui/sidebar";
import { AppSidebar } from "./components/app-sidebar";
import { PWAInstallButton } from "./components/pwa-install-button";
import {
  createSignal,
  createContext,
  useContext,
  createEffect,
  Show,
  Component,
} from "solid-js";
import type { Accessor, JSX, Setter } from "solid-js";
import { useIsMobile } from "./hooks/use-mobile";
import { ModeToggle } from "./components/mode-toogle";
import AvatarDropdown from "./components/avatar-dropdown";

// Move interfaces outside the component
interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatContextType {
  chats: Accessor<Conversation[]>;
  setChats: Setter<Conversation[]>;
  fetchConversations: () => Promise<void>;
  resetCurrentChat: () => void;
  resetChatTrigger: Accessor<number>;
}

// Create the context
const ChatContext = createContext<ChatContextType>();

// Create a custom hook for using the context
export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
}

interface LayoutProps {
  children: JSX.Element;
}

// Cache key for conversations in localStorage
const CONVERSATIONS_CACHE_KEY = 'cachedConversations';

const Layout: Component<LayoutProps> = (props) => {
  const isMobile = useIsMobile();
  const HOST = import.meta.env.VITE_CHAT_HOST;

  const [chats, setChats] = createSignal<Conversation[]>([]);
  
  // Create a signal to trigger chat reset
  const [resetChatTrigger, setResetChatTrigger] = createSignal(0);
  
  // Function to reset the current chat
  const resetCurrentChat = () => {
    setResetChatTrigger(prev => prev + 1);
  };

  // Load cached conversations immediately on component mount
  const loadCachedConversations = () => {
    try {
      const cachedData = localStorage.getItem(CONVERSATIONS_CACHE_KEY);
      if (cachedData) {
        const parsedData = JSON.parse(cachedData);
        setChats(parsedData);
        return true;
      }
    } catch (error) {
      console.error("Failed to load cached conversations:", error);
    }
    return false;
  };

  // Cache conversations in localStorage
  const cacheConversations = (conversationsData: Conversation[]) => {
    try {
      localStorage.setItem(CONVERSATIONS_CACHE_KEY, JSON.stringify(conversationsData));
    } catch (error) {
      console.warn("Failed to cache conversations:", error);
    }
  };

  const fetchConversations = async () => {
    // First try to load from cache for immediate display
    const hasLoadedFromCache = loadCachedConversations();
    
    try {
      // Import here to avoid circular dependency
      const { authFetch } = await import("@/lib/utils");
      const { auth } = await import("@/lib/firebase");

      // Get current user UID
      const user = auth.currentUser;
      if (!user) {
        console.error("User not authenticated");
        return;
      }

      const response = await authFetch(
        `${HOST}/api/v1/chats/users/${user.uid}/conversations`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.status === "success" && Array.isArray(data.conversations)) {
        const sortedConversations = data.conversations
          .map((conv: Conversation) => ({
            id: conv.id.toString(),
            title: conv.title,
            created_at: conv.created_at,
            updated_at: conv.updated_at,
          }))
          .sort(
            (a: { created_at: string }, b: { created_at: string }) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
          );
        
        // Update the state with fresh data
        setChats(sortedConversations);
        
        // Cache the fetched conversations
        cacheConversations(sortedConversations);
      }
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
      // If we failed to fetch but haven't loaded from cache yet, try that as fallback
      if (!hasLoadedFromCache) {
        loadCachedConversations();
      }
    }
  };

  createEffect(() => {
    fetchConversations();
  });

  createEffect(() => {
    console.log(chats());
  });

  // Provide a consistent value object to the context
  const contextValue = {
    chats: chats,
    setChats: setChats,
    fetchConversations,
    resetCurrentChat,
    resetChatTrigger,
  };

  return (
    <ChatContext.Provider value={contextValue}>
      <SidebarProvider>
        <div class="flex h-screen w-full overflow-x-hidden">
          <AppSidebar />
          <svg
            class="fixed -right-18 top-3.5 h-9 origin-top-left skew-x-[30deg] overflow-visible z-[1100]"
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
            xmlns:xlink="http://www.w3.org/1999/xlink"
            viewBox="0 0 128 32"
            preserveAspectRatio="none"
          >
            <line
              stroke="#e9ecef"
              class="dark:stroke-[#15202b]"
              stroke-width="2px"
              shape-rendering="geometricPrecision"
              vector-effect="non-scaling-stroke"
              stroke-linecap="round"
              stroke-miterlimit="10"
              x1="1"
              y1="0"
              x2="128"
              y2="0"
            />
            <path
              class="translate-y-[0.5px] fill-[#e9ecef] dark:fill-[#15202b] dark:stroke-[#15202b]"
              shape-rendering="geometricPrecision"
              stroke-width="1px"
              stroke-linecap="round"
              stroke-miterlimit="10"
              vector-effect="non-scaling-stroke"
              d="M0,0c5.9,0,10.7,4.8,10.7,10.7v10.7c0,5.9,4.8,10.7,10.7,10.7H128V0"
              stroke="#e9ecef"
            />
          </svg>
          <SidebarTrigger class="fixed left-3 top-8 z-[9999] hover:bg-accent dark:hover:bg-gray-700 rounded-lg p-2 transition-colors [&_svg:not([class*='size-'])]:size-7! md:[&_svg:not([class*='size-'])]:size-5!"></SidebarTrigger>
          <ModeToggle class="absolute right-1 top-3 z-1200" />
          <main class="flex flex-col flex-1 h-screen overflow-hidden bg-[#e9ecef] dark:bg-[#15202b] pt-0 w-full">
            <div class="overflow-hidden h-full">{props.children}</div>
          </main>
        </div>
      </SidebarProvider>
    </ChatContext.Provider>
  );
};

export default Layout;
