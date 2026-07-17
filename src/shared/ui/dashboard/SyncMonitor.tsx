import { RefreshCw, CheckCircle, Clock, AlertTriangle } from "lucide-react";

export interface SyncMonitorProps {
  syncStatus?: "synced" | "syncing" | "error" | "idle";
  lastSync?: number;
  pendingChanges?: number;
  syncProgress?: number;
  loading?: boolean;
}

export function SyncMonitor({
  syncStatus = "idle",
  lastSync = 0,
  pendingChanges = 0,
  syncProgress = 0,
  loading = false,
}: SyncMonitorProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-glow">
        <div className="animate-pulse">
          <div className="mb-4 h-6 w-32 rounded bg-slate-800" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-slate-800" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const statusConfig = {
    synced: {
      icon: <CheckCircle className="h-4 w-4 text-success-400" />,
      label: "Synced",
      bgColor: "bg-success-500/10",
      textColor: "text-success-400",
    },
    syncing: {
      icon: <RefreshCw className="h-4 w-4 text-brand-400 animate-spin" />,
      label: "Syncing",
      bgColor: "bg-brand-500/10",
      textColor: "text-brand-400",
    },
    error: {
      icon: <AlertTriangle className="h-4 w-4 text-error-400" />,
      label: "Error",
      bgColor: "bg-error-500/10",
      textColor: "text-error-400",
    },
    idle: {
      icon: <Clock className="h-4 w-4 text-slate-400" />,
      label: "Idle",
      bgColor: "bg-slate-500/10",
      textColor: "text-slate-400",
    },
  };

  const config = statusConfig[syncStatus];

  const formatLastSync = (timestamp: number) => {
    if (!timestamp) return "Never";
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-glow backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-h3 font-semibold text-white">Sync Monitor</h3>
        <div className={`flex items-center gap-2 rounded-full px-3 py-1 ${config.bgColor} ${config.textColor}`}>
          {config.icon}
          <span className="text-xs font-medium">{config.label}</span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Last Sync */}
        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-800/50 p-3">
          <span className="text-sm text-slate-400">Last Sync</span>
          <span className="text-sm font-medium text-white">{formatLastSync(lastSync)}</span>
        </div>

        {/* Pending Changes */}
        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-800/50 p-3">
          <span className="text-sm text-slate-400">Pending Changes</span>
          <span className="text-sm font-medium text-white">{pendingChanges}</span>
        </div>

        {/* Sync Progress */}
        {syncStatus === "syncing" && (
          <div className="rounded-xl border border-white/5 bg-slate-800/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-slate-400">Progress</span>
              <span className="text-sm font-medium text-white">{syncProgress}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-700">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-brand-500 to-accent transition-all duration-300"
                style={{ width: `${syncProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Sync Button */}
        <button
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10 hover:border-brand-400/40"
          type="button"
          disabled={syncStatus === "syncing"}
        >
          {syncStatus === "syncing" ? "Syncing..." : "Sync Now"}
        </button>
      </div>
    </div>
  );
}
