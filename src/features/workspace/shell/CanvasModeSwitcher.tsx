import { memo } from "react";
import { Hammer, Code, Gauge, GitBranch, Play, BarChart3 } from "lucide-react";
import type { CanvasMode } from "../core";
import { CANVAS_MODES } from "../core";

interface CanvasModeSwitcherProps {
  activeMode: CanvasMode;
  onModeChange: (mode: CanvasMode) => void;
}

const MODE_CONFIG: Record<
  CanvasMode,
  { label: string; Icon: React.ElementType; shortcut: string }
> = {
  build: { label: "Build", Icon: Hammer, shortcut: "Ctrl+1" },
  code: { label: "Code", Icon: Code, shortcut: "Ctrl+2" },
  simulation: { label: "Simulation", Icon: Gauge, shortcut: "Ctrl+3" },
  pipeline: { label: "Pipeline", Icon: GitBranch, shortcut: "Ctrl+4" },
  playtest: { label: "Playtest", Icon: Play, shortcut: "Ctrl+5" },
  analytics: { label: "Analytics", Icon: BarChart3, shortcut: "Ctrl+6" },
};

export const CanvasModeSwitcher = memo(function CanvasModeSwitcher({
  activeMode,
  onModeChange,
}: CanvasModeSwitcherProps) {
  return (
    <div className="flex items-center gap-1 border-b border-white/10 bg-slate-900/50 px-4">
      {CANVAS_MODES.map((mode) => {
        const { label, Icon, shortcut } = MODE_CONFIG[mode];
        const isActive = mode === activeMode;

        return (
          <button
            key={mode}
            type="button"
            onClick={() => onModeChange(mode)}
            className={`
              flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-all duration-200
              ${
                isActive
                  ? "border-b-2 border-brand-400 text-white"
                  : "border-b-2 border-transparent text-slate-400 hover:text-white"
              }
            `}
            title={`${label} (${shortcut})`}
            aria-label={`Switch to ${label} mode`}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
});
