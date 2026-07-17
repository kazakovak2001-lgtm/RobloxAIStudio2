import { Search, Filter, RefreshCw, Plus, FolderOpen } from "lucide-react";
import { TreeView, TreeNode } from "../data/TreeView";

export interface ProjectExplorerProps {
  projects?: TreeNode[];
  selectedProject?: string;
  onProjectSelect?: (projectId: string) => void;
  onCreateProject?: () => void;
  onRefresh?: () => void;
  loading?: boolean;
}

export function ProjectExplorer({
  projects = [],
  selectedProject,
  onProjectSelect,
  onCreateProject,
  onRefresh,
  loading = false,
}: ProjectExplorerProps) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-slate-900/70 shadow-glow backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 p-4">
        <h3 className="text-h3 font-semibold text-white">Project Explorer</h3>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
              type="button"
              aria-label="Refresh projects"
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          )}
          {onCreateProject && (
            <button
              onClick={onCreateProject}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand-500 to-accent px-3 py-1.5 text-sm font-medium text-white transition hover:translate-y-[-1px]"
              type="button"
            >
              <Plus className="h-4 w-4" />
              <span>New</span>
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="border-b border-white/10 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search projects..."
            className="w-full rounded-xl border border-white/10 bg-slate-950/70 pl-10 pr-4 py-2 text-sm text-white outline-none transition-colors focus:border-brand-400/50"
          />
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2">
        <button
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-400 transition hover:bg-white/10 hover:text-white"
          type="button"
        >
          <Filter className="h-4 w-4" />
          <span>Filter</span>
        </button>
        <div className="flex-1" />
        <span className="text-xs text-slate-500">
          {projects.length} projects
        </span>
      </div>

      {/* Tree View */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <RefreshCw className="h-5 w-5 animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <FolderOpen className="h-12 w-12 mb-2 opacity-50" />
            <p className="text-sm">No projects found</p>
            {onCreateProject && (
              <button
                onClick={onCreateProject}
                className="mt-4 text-sm text-brand-400 hover:text-brand-300"
                type="button"
              >
                Create your first project
              </button>
            )}
          </div>
        ) : (
          <TreeView
            nodes={projects}
            selectedId={selectedProject}
            onSelect={onProjectSelect}
          />
        )}
      </div>
    </div>
  );
}
