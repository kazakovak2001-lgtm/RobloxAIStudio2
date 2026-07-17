import type { ReactNode } from "react";

export interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  closable?: boolean;
}

export interface WorkspacePanel {
  id: string;
  title: string;
  content: ReactNode;
  position: "left" | "right" | "bottom";
  size?: number;
}

export interface WorkspaceProps {
  tabs?: Tab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  onTabClose?: (tabId: string) => void;
  children: ReactNode;
  panels?: WorkspacePanel[];
  className?: string;
}

export function Workspace({
  tabs,
  activeTab,
  onTabChange,
  onTabClose,
  children,
  panels,
  className = "",
}: WorkspaceProps) {
  return (
    <div className={`flex h-full flex-col ${className}`}>
      {/* Tabs */}
      {tabs && tabs.length > 0 && (
        <div className="flex items-center gap-1 border-b border-white/10 bg-slate-900/50 px-4">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange?.(tab.id)}
                className={`flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-slate-950 text-white border-t-2 border-brand-400"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
                type="button"
              >
                {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
                <span>{tab.label}</span>
                {tab.closable && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTabClose?.(tab.id);
                    }}
                    className="ml-1 rounded p-0.5 text-slate-400 hover:bg-white/10 hover:text-white"
                    type="button"
                    aria-label={`Close ${tab.label}`}
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content Area with Panels */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        {panels?.find((p) => p.position === "left") && (
          <div
            className="border-r border-white/10 bg-slate-900/30"
            style={{
              width: panels.find((p) => p.position === "left")?.size || 250,
            }}
          >
            {panels.find((p) => p.position === "left")?.content}
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>

        {/* Right Panel */}
        {panels?.find((p) => p.position === "right") && (
          <div
            className="border-l border-white/10 bg-slate-900/30"
            style={{
              width: panels.find((p) => p.position === "right")?.size || 250,
            }}
          >
            {panels.find((p) => p.position === "right")?.content}
          </div>
        )}
      </div>

      {/* Bottom Panel */}
      {panels?.find((p) => p.position === "bottom") && (
        <div
          className="border-t border-white/10 bg-slate-900/30"
          style={{
            height: panels.find((p) => p.position === "bottom")?.size || 200,
          }}
        >
          {panels.find((p) => p.position === "bottom")?.content}
        </div>
      )}
    </div>
  );
}
