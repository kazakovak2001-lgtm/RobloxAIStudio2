import { X, Clock } from "lucide-react";

export interface SyncProgressProps {
  progress: number;
  total: number;
  current?: string;
  onCancel?: () => void;
}

export function SyncProgress({
  progress,
  total,
  current,
  onCancel,
}: SyncProgressProps) {
  const percentage = total > 0 ? (progress / total) * 100 : 0;
  const isComplete = progress >= total;

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-glow backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-brand-400" />
          <span className="text-sm font-medium text-white">
            {isComplete ? "Sync Complete" : "Syncing..."}
          </span>
        </div>
        {onCancel && !isComplete && (
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            type="button"
            aria-label="Cancel sync"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-2">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-slate-400">
            {progress} / {total} items
          </span>
          <span className="text-slate-400">{percentage.toFixed(0)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-800">
          <div
            className={`h-2 rounded-full bg-gradient-to-r from-brand-500 to-accent transition-all duration-300 ${
              isComplete ? "bg-success-400" : ""
            }`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>

      {/* Current Operation */}
      {current && (
        <div className="text-xs text-slate-400">
          <span className="opacity-70">Current:</span> {current}
        </div>
      )}
    </div>
  );
}
