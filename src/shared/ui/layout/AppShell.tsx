import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { StatusBar } from "./StatusBar";

export interface AppShellProps {
  children: ReactNode;
  /** Hide the sidebar entirely (e.g. for landing/auth pages) */
  hideSidebar?: boolean;
  /** Hide the top bar */
  hideTopBar?: boolean;
  /** Hide the status bar */
  hideStatusBar?: boolean;
}

/**
 * Unified application shell. Wraps content with Sidebar, TopBar, and StatusBar.
 * The sidebar width is controlled by SidebarProvider context — the content area
 * automatically fills remaining space via flexbox (no hardcoded margins).
 */
export function AppShell({
  children,
  hideSidebar = false,
  hideTopBar = false,
  hideStatusBar = false,
}: AppShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Sidebar — takes its own width, content fills the rest */}
      {!hideSidebar && <Sidebar />}

      {/* Main column: TopBar + content + StatusBar */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {!hideTopBar && <TopBar />}

        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>

        {!hideStatusBar && <StatusBar />}
      </div>
    </div>
  );
}
