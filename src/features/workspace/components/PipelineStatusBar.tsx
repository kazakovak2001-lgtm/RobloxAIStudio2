import { Clock, CheckCircle, XCircle, Loader2, Pause } from "lucide-react";
import type { PipelineState, WorkspaceStatus } from "../types";

interface PipelineStatusBarProps {
  pipeline: PipelineState | null;
  status: WorkspaceStatus;
}

export function PipelineStatusBar({
  pipeline,
  status,
}: PipelineStatusBarProps) {
  const elapsed = pipeline?.startedAt
    ? Math.round((Date.now() - pipeline.startedAt.getTime()) / 1000)
    : 0;
  const progress = pipeline?.progress ?? 0;

  const statusConfig: Record<
    string,
    { icon: typeof Clock; color: string; label: string }
  > = {
    idle: { icon: Pause, color: "text-slate-400", label: "Idle" },
    running: { icon: Loader2, color: "text-cyan-400", label: "Running" },
    completed: {
      icon: CheckCircle,
      color: "text-green-400",
      label: "Completed",
    },
    failed: { icon: XCircle, color: "text-red-400", label: "Failed" },
  };

  const config = statusConfig[status] ?? statusConfig.idle;
  const Icon = config.icon;

  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon
          className={`h-4 w-4 ${config.color} ${status === "running" ? "animate-spin" : ""}`}
        />
        <span className={`text-sm font-medium ${config.color}`}>
          {config.label}
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs text-slate-400">
        {elapsed > 0 && (
          <span>
            <Clock className="mr-1 inline h-3 w-3" />
            {elapsed}s
          </span>
        )}
        <span>{progress}%</span>
      </div>
    </div>
  );
}
