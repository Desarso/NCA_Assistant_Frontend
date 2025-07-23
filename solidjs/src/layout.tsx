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
  onMount,
} from "solid-js";
import type { Accessor, JSX, Setter } from "solid-js";
import { useIsMobile } from "./hooks/use-mobile";
import { ModeToggle } from "./components/mode-toogle";
import AvatarDropdown from "./components/avatar-dropdown";
import { ConversationCache } from "./aichat/utils/memory_cache";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import { useLocation, useNavigate } from "@solidjs/router";

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
  const location = useLocation();
  const navigate = useNavigate();

  const [chats, setChats] = createSignal<Conversation[]>([]);
  const [resetChatTrigger, setResetChatTrigger] = createSignal(0);
  
  // Function to reset the current chat
  const resetCurrentChat = () => {
    setResetChatTrigger(prev => prev + 1);
  };

  // Determine current tab based on route
  const getCurrentTab = () => {
    const path = location.pathname;
    if (path.startsWith('/chat')) return 'chat';
    if (path.startsWith('/workflows')) return 'workflows';
    return 'chat'; // default
  };

  // Handle tab change
  const handleTabChange = (value: string) => {
    if (value === 'chat') {
      navigate('/chat/');
    } else if (value === 'workflows') {
      navigate('/workflows');
    }
  };


  //on mount immeditely load conversations from cache then fetch from server
  onMount(async () => {
    console.log("Layout mounted - starting to load conversations");
    try {
      const cachedChats = await ConversationCache.get();
      console.log("Got cached chats:", cachedChats);
      setChats(cachedChats);

      const freshChats = await ConversationCache.fetchConversationsNoCache();
      console.log("Got fresh chats:", freshChats);
      setChats(freshChats);
    } catch (error) {
      console.error("Failed to load conversations:", error);
    }
  });



  // createEffect(() => {
  //   console.log(chats());
  // });

  // Provide a consistent value object to the context
  const contextValue = {
    chats: chats,
    setChats: setChats,
    resetCurrentChat,
    resetChatTrigger,
  };

  const isWorkflowEditPage = () => location.pathname.includes('/workflows/') && location.pathname.includes('/edit');



  return (
    <ChatContext.Provider value={contextValue}>
      <SidebarProvider>
        <div class="flex h-screen w-full overflow-x-hidden">
          <AppSidebar />
          {/* <svg
            class="fixed -right-15 top-13 h-9 origin-top-left skew-x-[30deg] overflow-visible z-[1100]"
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
          </svg> */}
          {/* Top Bar Header */}
          <div class="fixed top-0 right-0 left-0 z-[1000] h-5 bg-transparent dark:bg-transparent">
            <div class="flex items-center justify-between h-full px-3">
              <div class="flex items-center gap-2">
                <SidebarTrigger class="mt-11 hover:bg-accent dark:hover:bg-gray-700 rounded-lg p-1.5 transition-colors [&_svg:not([class*='size-'])]:size-4!"></SidebarTrigger>
                {/* Navigation tabs */}
                <div class="mt-10 ml-60">
                  <Tabs value={getCurrentTab()} onChange={handleTabChange}>
                    <TabsList class="h-8 bg-white/10 dark:bg-black/10 border border-gray-300 dark:border-gray-600">
                      <TabsTrigger value="chat" class="text-xs px-3 py-1 data-[selected]:bg-white dark:data-[selected]:bg-gray-800">
                        Chat
                      </TabsTrigger>
                      <TabsTrigger value="workflows" class="text-xs px-3 py-1 data-[selected]:bg-white dark:data-[selected]:bg-gray-800">
                        Workflows
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>
            </div>
          </div>
          {/* Dark mode toggle positioned below navbar but above decorative elements */}
          <ModeToggle class="fixed right-3 top-4 z-[1100]" />
          
          <main class="flex flex-col flex-1 bg-[#e9ecef] dark:bg-[#15202b] pt-12 w-full h-screen overflow-hidden">
            <div class="h-full overflow-hidden">{props.children}</div>
          </main>
        </div>
      </SidebarProvider>
    </ChatContext.Provider>
  );
};

export default Layout;
