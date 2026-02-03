// Simplified sidebar component - full implementation would require more complex state management
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MOBILE_BREAKPOINT = 768;
const SIDEBAR_COOKIE_NAME = "sidebar:state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "17rem";
const SIDEBAR_WIDTH_ICON = "3rem";

type SidebarContextType = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = createContext<SidebarContextType | null>(null);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}

function useIsMobileSidebar(fallback = false) {
  const [isMobile, setIsMobile] = useState(fallback);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };
    mql.addEventListener("change", onChange);
    onChange(mql);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

interface SidebarProviderProps {
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SidebarProvider({ children, defaultOpen = false, open: openProp, onOpenChange }: SidebarProviderProps) {
  const isMobile = useIsMobileSidebar();
  const [openMobile, setOpenMobile] = useState(false);
  const [_open, _setOpen] = useState(() => {
    try {
      const cookies = document.cookie.split(';');
      const sidebarCookie = cookies.find(cookie => cookie.trim().startsWith(`${SIDEBAR_COOKIE_NAME}=`));
      if (sidebarCookie) {
        return sidebarCookie.split('=')[1] === 'true';
      }
    } catch (error) {
      console.warn('Failed to read sidebar state from cookie:', error);
    }
    return defaultOpen ?? false;
  });

  const open = openProp ?? _open;
  const setOpen = (value: boolean | ((value: boolean) => boolean)) => {
    const openState = typeof value === "function" ? value(open) : value;
    if (onOpenChange) {
      onOpenChange(openState);
    } else {
      _setOpen(openState);
    }
    document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
  };

  const toggleSidebar = () => {
    if (isMobile) {
      setOpenMobile((prev) => !prev);
    } else {
      setOpen((prevOpen) => !prevOpen);
    }
  };

  const state = open ? "expanded" : "collapsed";

  const contextValue: SidebarContextType = {
    state,
    open,
    setOpen,
    isMobile,
    openMobile,
    setOpenMobile,
    toggleSidebar
  };

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        style={{
          "--sidebar-width": SIDEBAR_WIDTH,
          "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
          "--sidebar-width-mobile": SIDEBAR_WIDTH_MOBILE,
        } as React.CSSProperties}
        className="group/sidebar-wrapper flex min-h-svh w-full text-sidebar-foreground"
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

interface SidebarProps {
  children: ReactNode;
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
  className?: string;
}

export function Sidebar({ children, side = "left", variant = "sidebar", collapsible = "none", className }: SidebarProps) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent 
          side={side === "right" ? "right" : "left"} 
          className={cn("p-0 w-[var(--sidebar-width-mobile)] bg-transparent z-[9999]", className)}
        >
          <div className="bg-sidebar flex h-full flex-col w-[300px] relative z-[10000]">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className={cn(
        "group peer text-sidebar-foreground hidden md:block",
        collapsible === "offcanvas" && "transition-transform duration-500",
        className
      )}
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
    >
      <div
        className={cn(
          "relative w-[var(--sidebar-width)] bg-transparent transition-[width] duration-100 ease-in-out",
          collapsible === "offcanvas" && state === "collapsed" && "w-0"
        )}
      />
      <div
        className={cn(
          "relative inset-y-0 z-10 hidden h-svh w-[var(--sidebar-width)] transition-[width] duration-100 ease-in-out md:flex",
          collapsible === "offcanvas" && state === "collapsed" && "!w-0 border-none overflow-hidden",
          className
        )}
      >
        <div
          className={cn(
            "bg-sidebar sidebar-surface flex h-full flex-col",
            "transition-transform duration-200 ease-in-out",
            "w-[var(--sidebar-width)] min-w-[var(--sidebar-width)]",
            collapsible === "offcanvas" && state === "collapsed" && "-translate-x-full"
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function SidebarContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-auto", className)}>
      {children}
    </div>
  );
}

export function SidebarTrigger({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      data-sidebar="trigger"
      variant="ghost"
      size="icon"
      className={cn("size-7", className)}
      onClick={(e) => {
        props.onClick?.(e);
        toggleSidebar();
      }}
      {...props}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M9 3v18" />
      </svg>
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}
