import { memo } from "react";
import { ChevronLeft, ChevronRight, FolderOpen } from "lucide-react";
import { ProjectExplorer } from "@/shared/ui/projects/ProjectExplorer";
import { useWorkspace } from "../core";

export const ExplorerZone = memo(function ExplorerZone() {
  const { state, setZoneState } = useWorkspace();
  const { collapsed } = state.zones.explorer;

  const toggleCollapse = () => {
    setZoneState("explorer", { collapsed: !collapsed });
  };

  return (
    <div className="relative flex h-full flex-col border-r border-white/10 bg-slate-900/70 transition-all duration-200 ease-out overflow-hidden">
      {collapsed ? (
        /* Collapsed rail */
        <div className="flex h-full flex-col items-center gap-2 py-3">
          <button
            type="button"
            onClick={toggleCollapse}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Expand explorer"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="mt-2 flex flex-col items-center gap-3">
            <FolderOpen className="h-5 w-5 text-slate-500" />
          </div>
        </div>
      ) : (
        /* Expanded explorer */
        <>
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Explorer
            </span>
            <button
              type="button"
              onClick={toggleCollapse}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Collapse explorer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ProjectExplorer />
          </div>
          {/* Resize handle */}
          <div className="absolute inset-y-0 right-0 w-1 cursor-col-resize bg-transparent transition hover:bg-brand-400/50" />
        </>
      )}
    </div>
  );
});
