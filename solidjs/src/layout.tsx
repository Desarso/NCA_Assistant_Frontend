import { SidebarProvider, SidebarTrigger, useSidebar } from "./components/ui/sidebar";
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
        <div class="flex h-screen w-full overflow-x-hidden overscroll-none">
          <AppSidebar />
          {/* Restore fixed sidebar toggle position */}
          <SidebarTrigger class="fixed left-2 top-[12px] z-[1200] hover:bg-white/20 rounded-md p-2 transition-colors [&_svg:not([class*='size-'])]:size-4!" />
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
          {/* Top Bar Header with responsive left offset based on sidebar state */}
          {(() => {
            const TopHeader: Component = () => {
              // useSidebar is safe here since we're inside SidebarProvider
              const { state } = useSidebar();
              const isExpanded = () => state() === "expanded";
              const left = () => {
                if (isMobile()) return "0";
                // Flush with sidebar when expanded, flush with window when collapsed
                return isExpanded() ? "var(--sidebar-width)" : "0";
              };
              const paddingLeft = () => {
                // Always reserve space for the left toggle so tabs never slide underneath
                // Small gutter when expanded; wider gutter when collapsed
                return isExpanded() ? "12px" : "72px";
              };
              return (
                <div class="fixed top-0 right-0 z-[1000] bg-sidebar" style={{ left: left(), height: "56px" }}>
                  <div class="flex items-center justify-between h-full pl-[72px] pr-3 md:pl-[72px] md:pr-4"
                       style={{ "padding-left": paddingLeft() }}>
                    <div class="flex items-center gap-3">
                      {/* Navigation tabs */}
                      <div class="hidden md:block max-w-full">
                        <Tabs value={getCurrentTab()} onChange={handleTabChange}>
                          <TabsList class="h-11 rounded-full bg-sidebar/20 border border-sidebar-border/60 px-1 flex items-center gap-1 backdrop-blur shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] ml-0">
                            <TabsTrigger value="chat" class="text-sm font-medium h-9 px-5 leading-none rounded-full text-foreground/85 hover:bg-sidebar-accent/60 transition-colors data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:shadow-sm">
                              Chat
                            </TabsTrigger>
                            <TabsTrigger value="workflows" class="text-sm font-medium h-9 px-5 leading-none rounded-full text-foreground/85 hover:bg-sidebar-accent/60 transition-colors data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:shadow-sm">
                              Workflows
                            </TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </div>
                    </div>
                    <div class="flex items-center gap-2">
                      <ModeToggle class="h-10 flex items-center justify-center" />
                    </div>
                  </div>
                </div>
              );
            };
            return <TopHeader />;
          })()}
          
          <main class="flex flex-col flex-1 bg-sidebar pt-14 w-full h-screen overflow-hidden overscroll-none">
            <div class="h-full overflow-hidden pl-2">{props.children}</div>
          </main>
        </div>
      </SidebarProvider>
    </ChatContext.Provider>
  );
};

export default Layout;
