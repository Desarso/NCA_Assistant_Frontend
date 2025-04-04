import { MessageSquare } from "lucide-solid";

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
import { createMemo, For, onMount } from "solid-js";
import NCALogo from "@/assets/NCALogo";
import AvatarDropdown from "./avatar-dropdown";
import { prefetchMessageHistory } from "@/aichat/utils/utils";


// Define the Conversation type to match what's in layout.tsx
interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

// // Menu items.
// const items = [
//   // {
//   //   title: "Home",
//   //   url: "#",
//   //   icon: Home,
//   // },
//   // {
//   //   title: "Inbox",
//   //   url: "#",
//   //   icon: Inbox,
//   // },
//   // {
//   //   title: "Calendar",
//   //   url: "#",
//   //   icon: Calendar,
//   // },
//   // {
//   //   title: "Search",
//   //   url: "#",
//   //   icon: Search,
//   // },
//   {
//     title: "Settings",
//     url: "/settings",
//     icon: Settings,
//   },
// ];

export function AppSidebar() {
  try {
    const { chats, fetchConversations, resetCurrentChat } = useChatContext();
    const { setOpenMobile } = useSidebar();
    const params = useParams();
    const navigate = useNavigate();
    const id = createMemo(() => params.id);
    // Ensure chats data is loaded
    onMount(() => {
      fetchConversations();
    });

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

    // Group chats by time periods using createMemo
    const groupedChats = createMemo(() => ({
      today: chats().filter((chat) => new Date(chat.created_at) >= today),
      yesterday: chats().filter((chat) => {
        const chatDate = new Date(chat.created_at);
        return chatDate >= yesterday && chatDate < today;
      }),
      lastWeek: chats().filter((chat) => {
        const chatDate = new Date(chat.created_at);
        return chatDate >= lastWeek && chatDate < yesterday;
      }),
      lastMonth: chats().filter((chat) => {
        const chatDate = new Date(chat.created_at);
        return chatDate >= lastMonth && chatDate < lastWeek;
      }),
      byMonth: chats().filter((chat) => {
        const chatDate = new Date(chat.created_at);
        return chatDate.getFullYear() === currentYear && chatDate < lastMonth;
      }),
      byYear: chats().filter((chat) => {
        const chatDate = new Date(chat.created_at);
        return chatDate.getFullYear() < currentYear;
      }),
    }));

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

    const renderChatSection = (title: string, chats: Conversation[]) => {
      if (chats.length === 0) return null;

      return (
        <div class="mb-4">
          <SidebarGroupLabel class="text-xs font-medium text-gray-900 dark:text-gray-400 px-3 mb-2">
            {title}
          </SidebarGroupLabel>
          <SidebarMenu class="space-y-1">
            <For each={chats}>
              {(chat) => (
                <SidebarMenuItem>
                  <A
                    href={`/chat/${chat.id}`}
                    onClick={() => setOpenMobile(false)}
                    onMouseEnter={() => prefetchMessageHistory(chat.id)}
                    class="flex items-center gap-2 px-3 py-2 text-base md:text-[13px] font-medium text-[#696a6a] dark:text-gray-200 rounded-md hover:bg-white dark:hover:bg-gray-700 "
                    classList={{
                      "bg-white dark:bg-gray-700": id() === chat.id,
                    }}
                  >
                    <span class="truncate pl-2">{chat.title}</span>
                  </A>
                </SidebarMenuItem>
              )}
            </For>
          </SidebarMenu>
        </div>
      );
    };

    return (
      <Sidebar collapsible="offcanvas" side="left" variant="sidebar">
        <SidebarContent class="bg-[#e9ecef] dark:bg-[#15202b]">
          <SidebarGroup>
            <div class="flex flex-col items-center justify-between p-3">
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
            <SidebarGroupContent>
              <div class="max-h-[70vh] overflow-y-auto scrollbar">
                {renderChatSection("Today", groupedChats().today)}
                {renderChatSection("Yesterday", groupedChats().yesterday)}
                {renderChatSection("Last 7 Days", groupedChats().lastWeek)}
                {renderChatSection("Last 30 Days", groupedChats().lastMonth)}
                <For
                  each={Object.entries(monthlyGroups()).sort(
                    ([a], [b]) => new Date(b).getTime() - new Date(a).getTime()
                  )}
                >
                  {([month, chats]) => renderChatSection(month, chats)}
                </For>
                <For
                  each={Object.entries(yearlyGroups()).sort(
                    ([a], [b]) => Number(b) - Number(a)
                  )}
                >
                  {([year, chats]) => renderChatSection(year, chats)}
                </For>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
          <AvatarDropdown class="absolute bottom-10 left-4 z-10" />
        </SidebarContent>
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
      resetCurrentChat = context.resetCurrentChat;
    } catch (e) {
      // Function stub if context is unavailable
      resetCurrentChat = () => {};
    }

    return (
      <Sidebar collapsible="offcanvas" side="left" variant="sidebar">
        <SidebarContent class="bg-[#ebebeb] dark:bg-[#15202b]">
          <SidebarGroup>
            <div class="flex flex-col items-center justify-between p-3">
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
          </SidebarGroup>
          <AvatarDropdown class="absolute bottom-5 left-4 z-10" />
        </SidebarContent>
      </Sidebar>
    );
  }
}
