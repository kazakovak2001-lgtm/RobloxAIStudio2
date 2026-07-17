import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Bot,
  FolderKanban,
  Puzzle,
  BarChart3,
  BookOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bot as AIIcon,
  X,
} from "lucide-react";
import { useSidebar, EXPANDED_WIDTH, COLLAPSED_WIDTH } from "@/shared/hooks";

export interface NavigationItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  disabled?: boolean;
  href: string;
}

export interface SidebarProps {
  navigationItems?: NavigationItem[];
  activeItem?: string;
  onItemClick?: (item: NavigationItem) => void;
}

const defaultNavigationItems: NavigationItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard className="h-5 w-5" />,
    href: "/dashboard",
  },
  {
    id: "ai-studio",
    label: "AI Studio",
    icon: <AIIcon className="h-5 w-5" />,
    href: "/ai-studio",
  },
  {
    id: "projects",
    label: "Projects",
    icon: <FolderKanban className="h-5 w-5" />,
    href: "/projects",
  },
  {
    id: "plugin-manager",
    label: "Plugin Manager",
    icon: <Puzzle className="h-5 w-5" />,
    href: "/plugin-manager",
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: <BarChart3 className="h-5 w-5" />,
    href: "/analytics",
  },
  {
    id: "knowledge",
    label: "Knowledge Base",
    icon: <BookOpen className="h-5 w-5" />,
    href: "/knowledge",
  },
  {
    id: "settings",
    label: "Settings",
    icon: <Settings className="h-5 w-5" />,
    href: "/settings",
  },
];

export function Sidebar({
  navigationItems = defaultNavigationItems,
  activeItem,
  onItemClick,
}: SidebarProps) {
  const location = useLocation();
  const { mode, isOpen, toggle, close, breakpoint } = useSidebar();

  const isCollapsed = mode === "collapsed" || mode === "overlay";
  const isOverlayVisible = mode === "hidden" && isOpen;

  // On desktop/tablet: show inline. On mobile: show as overlay only when open.
  const showSidebar =
    breakpoint === "desktop" || breakpoint === "tablet" || isOverlayVisible;

  const handleItemClick = (item: NavigationItem) => {
    onItemClick?.(item);
    // Close overlay on navigation (mobile only — tablet is inline)
    if (breakpoint === "mobile") {
      close();
    }
  };

  const isActive = (item: NavigationItem) => {
    if (activeItem) return activeItem === item.id;
    return (
      location.pathname === item.href ||
      location.pathname.startsWith(item.href + "/")
    );
  };

  // Determine sidebar width for current state
  const sidebarStyle =
    breakpoint === "desktop"
      ? { width: isCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }
      : breakpoint === "tablet"
        ? { width: COLLAPSED_WIDTH }
        : { width: EXPANDED_WIDTH }; // mobile overlay when open

  if (!showSidebar) return null;

  return (
    <>
      {/* Backdrop for mobile overlay mode */}
      {isOverlayVisible && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={close}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          flex flex-col border-r border-white/10 bg-slate-950/95 backdrop-blur-xl
          transition-all duration-300 ease-in-out
          ${
            breakpoint === "mobile"
              ? "fixed inset-y-0 left-0 z-50 h-full shadow-2xl"
              : "relative z-30 h-full shrink-0"
          }
        `}
        style={sidebarStyle}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-2 border-b border-white/10 px-4">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent">
            <Bot className="h-5 w-5 text-white" />
          </div>
          {!isCollapsed && (
            <span className="truncate text-sm font-semibold text-white">
              Roblox AI Studio
            </span>
          )}
          {/* Close button for mobile overlay */}
          {breakpoint === "mobile" && isOverlayVisible && (
            <button
              onClick={close}
              className="ml-auto rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              type="button"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navigationItems.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.id}
                to={item.href}
                onClick={() => handleItemClick(item)}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  active
                    ? "bg-brand-500/10 text-white border-l-2 border-brand-400"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                } ${item.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                aria-disabled={item.disabled}
                title={isCollapsed ? item.label : undefined}
              >
                <div className="flex-shrink-0">{item.icon}</div>
                {!isCollapsed && (
                  <>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <span className="flex h-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-xs text-white">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Toggle Button (desktop and tablet) */}
        {breakpoint !== "mobile" && (
          <div className="border-t border-white/10 p-3">
            <button
              onClick={toggle}
              className="flex w-full items-center justify-center gap-3 rounded-2xl px-3 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
              type="button"
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <>
                  <ChevronLeft className="h-4 w-4" />
                  <span>Collapse</span>
                </>
              )}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
