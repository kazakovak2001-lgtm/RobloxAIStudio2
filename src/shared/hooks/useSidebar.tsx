import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useBreakpoint, type Breakpoint } from "./useBreakpoint";

export type SidebarMode = "expanded" | "collapsed" | "overlay" | "hidden";

interface SidebarContextValue {
  /** Current visual mode of the sidebar */
  mode: SidebarMode;
  /** Current breakpoint */
  breakpoint: Breakpoint;
  /** Whether the mobile/overlay drawer is open */
  isOpen: boolean;
  /** User's preferred desktop state (persisted across nav) */
  desktopCollapsed: boolean;
  /** Toggle sidebar — on desktop toggles expanded/collapsed, on mobile/tablet toggles overlay */
  toggle: () => void;
  /** Close mobile/overlay drawer */
  close: () => void;
  /** Sidebar width in px for the current mode */
  sidebarWidth: number;
}

const EXPANDED_WIDTH = 260;
const COLLAPSED_WIDTH = 72;

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const breakpoint = useBreakpoint();
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Close overlay on breakpoint change to desktop
  useEffect(() => {
    if (breakpoint === "desktop") {
      setIsOpen(false);
    }
  }, [breakpoint]);

  // Close overlay on route change (handled by pages re-rendering)
  // The parent can call close() on navigation if needed

  const toggle = useCallback(() => {
    if (breakpoint === "desktop") {
      setDesktopCollapsed((prev) => !prev);
    } else {
      // mobile or tablet — toggle the overlay drawer
      setIsOpen((prev) => !prev);
    }
  }, [breakpoint]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const mode: SidebarMode = useMemo(() => {
    if (breakpoint === "desktop") {
      return desktopCollapsed ? "collapsed" : "expanded";
    }
    if (breakpoint === "tablet") {
      return "overlay";
    }
    return "hidden";
  }, [breakpoint, desktopCollapsed]);

  const sidebarWidth = useMemo(() => {
    if (breakpoint === "desktop") {
      return desktopCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;
    }
    if (breakpoint === "tablet") {
      return COLLAPSED_WIDTH; // Inline collapsed rail on tablet
    }
    // On mobile the sidebar is overlay — content takes full width
    return 0;
  }, [breakpoint, desktopCollapsed]);

  const value: SidebarContextValue = useMemo(
    () => ({
      mode,
      breakpoint,
      isOpen,
      desktopCollapsed,
      toggle,
      close,
      sidebarWidth,
    }),
    [mode, breakpoint, isOpen, desktopCollapsed, toggle, close, sidebarWidth],
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return ctx;
}

export { EXPANDED_WIDTH, COLLAPSED_WIDTH };
