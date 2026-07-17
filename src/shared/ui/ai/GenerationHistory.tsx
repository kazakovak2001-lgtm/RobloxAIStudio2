import { Trash2, Clock, CheckCircle, AlertCircle, Loader2, DollarSign } from "lucide-react";

export interface Generation {
  id: string;
  prompt: string;
  timestamp: number;
  status: "completed" | "failed" | "running";
  tokens?: number;
  cost?: number;
}

export interface GenerationHistoryProps {
  generations: Generation[];
  onSelect?: (generation: Generation) => void;
  onDelete?: (generationId: string) => void;
}

export function GenerationHistory({
  generations,
  onSelect,
  onDelete,
}: GenerationHistoryProps) {
  const statusConfig = {
    completed: {
      icon: <CheckCircle className="h-4 w-4 text-success-400" />,
      label: "Completed",
      bgColor: "bg-success-500/10",
      textColor: "text-success-400",
    },
    failed: {
      icon: <AlertCircle className="h-4 w-4 text-error-400" />,
      label: "Failed",
      bgColor: "bg-error-500/10",
      textColor: "text-error-400",
    },
    running: {
      icon: <Loader2 className="h-4 w-4 text-brand-400 animate-spin" />,
      label: "Running",
      bgColor: "bg-brand-500/10",
      textColor: "text-brand-400",
    },
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const truncatePrompt = (prompt: string, maxLength = 60) => {
    if (prompt.length <= maxLength) return prompt;
    return prompt.slice(0, maxLength) + "...";
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 shadow-glow backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 p-4">
        <h3 className="text-h3 font-semibold text-white">Generation History</h3>
        <span className="text-sm text-slate-400">{generations.length} items</span>
      </div>

      {/* List */}
      <div className="max-h-96 overflow-auto">
        {generations.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-slate-400">
            <p className="text-sm">No generations yet</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {generations.map((generation) => {
              const config = statusConfig[generation.status];
              return (
                <div
                  key={generation.id}
                  onClick={() => onSelect?.(generation)}
                  className="flex cursor-pointer items-start gap-3 p-4 transition hover:bg-white/5"
                >
                  {/* Status Icon */}
                  <div
                    className={`mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${config.bgColor} ${config.textColor}`}
                  >
                    {config.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        {truncatePrompt(generation.prompt)}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.bgColor} ${config.textColor}`}
                      >
                        {config.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{formatTimestamp(generation.timestamp)}</span>
                      </div>
                      {generation.tokens && (
                        <div className="flex items-center gap-1">
                          <span>{generation.tokens.toLocaleString()} tokens</span>
                        </div>
                      )}
                      {generation.cost && (
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          <span>${generation.cost.toFixed(4)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Delete Button */}
                  {onDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(generation.id);
                      }}
                      className="flex-shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-error-400"
                      type="button"
                      aria-label="Delete generation"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
