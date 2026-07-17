import { useLocation } from "react-router-dom";
import {
  Sparkles,
  Wifi,
  WifiOff,
  User,
  Bell,
  Search,
  Menu,
} from "lucide-react";
import { useSidebar } from "@/shared/hooks";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface TopBarProps {
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  activeProject?: string;
  aiStatus?: "online" | "offline" | "loading";
  robloxConnectionStatus?: "connected" | "disconnected" | "connecting";
  onUserMenuClick?: () => void;
}

export function TopBar({
  breadcrumbs,
  actions,
  activeProject = "No Active Project",
  aiStatus = "online",
  robloxConnectionStatus = "disconnected",
  onUserMenuClick,
}: TopBarProps) {
  const location = useLocation();
  const { toggle, breakpoint } = useSidebar();

  // Generate breadcrumbs from pathname if not provided
  const generateBreadcrumbs = (): BreadcrumbItem[] => {
    const pathSegments = location.pathname.split("/").filter(Boolean);
    return pathSegments.map((segment, index) => ({
      label:
        segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " "),
      href:
        index === pathSegments.length - 1
          ? undefined
          : `/${pathSegments.slice(0, index + 1).join("/")}`,
    }));
  };

  const displayBreadcrumbs = breadcrumbs || generateBreadcrumbs();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center border-b border-white/10 bg-slate-900/80 backdrop-blur-xl px-4">
      {/* Left Section */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger toggle — visible on mobile only */}
        {breakpoint === "mobile" && (
          <button
            onClick={toggle}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
            type="button"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 text-sm truncate">
          {displayBreadcrumbs.map((crumb, index) => (
            <div key={crumb.label} className="flex items-center gap-2">
              {index > 0 && <span className="text-slate-600">/</span>}
              {crumb.href ? (
                <a
                  href={crumb.href}
                  className="text-slate-400 transition hover:text-white"
                >
                  {crumb.label}
                </a>
              ) : (
                <span className="font-medium text-white">{crumb.label}</span>
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Center Section - Active Project (hidden on mobile) */}
      <div className="hidden md:flex items-center gap-2">
        <div className="flex h-8 items-center gap-2 rounded-full bg-slate-800/50 px-3">
          <Sparkles className="h-4 w-4 text-brand-400" />
          <span className="text-sm text-slate-300 truncate max-w-[180px]">
            {activeProject}
          </span>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* AI Status (hidden on mobile) */}
        <div className="hidden md:flex items-center gap-2 rounded-full bg-slate-800/50 px-3 py-1">
          <div
            className={`h-2 w-2 rounded-full ${
              aiStatus === "online"
                ? "bg-success-400 animate-pulse"
                : aiStatus === "loading"
                  ? "bg-warning-400 animate-pulse"
                  : "bg-slate-400"
            }`}
          />
          <span className="text-xs text-slate-400">
            AI{" "}
            {aiStatus === "online"
              ? "Ready"
              : aiStatus === "loading"
                ? "Loading"
                : "Offline"}
          </span>
        </div>

        {/* Roblox Connection Status (hidden on mobile) */}
        <div className="hidden md:flex items-center gap-2 rounded-full bg-slate-800/50 px-3 py-1">
          {robloxConnectionStatus === "connected" ? (
            <Wifi className="h-3 w-3 text-success-400" />
          ) : (
            <WifiOff className="h-3 w-3 text-slate-400" />
          )}
          <span className="text-xs text-slate-400">
            {robloxConnectionStatus === "connected"
              ? "Connected"
              : "Disconnected"}
          </span>
        </div>

        {/* Search */}
        <button
          className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
          type="button"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </button>

        {/* Notifications */}
        <button
          className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
          type="button"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>

        {/* User Menu */}
        <button
          onClick={onUserMenuClick}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent text-white transition hover:scale-105"
          type="button"
          aria-label="User menu"
        >
          <User className="h-4 w-4" />
        </button>

        {/* Custom Actions */}
        {actions}
      </div>
    </header>
  );
}
