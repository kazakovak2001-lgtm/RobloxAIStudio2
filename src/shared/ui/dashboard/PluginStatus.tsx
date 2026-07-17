import { Puzzle, Wifi, WifiOff, Activity } from "lucide-react";

export interface PluginStatusProps {
  connected?: boolean;
  pluginVersion?: string;
  clientCount?: number;
  uptime?: number;
  lastHeartbeat?: number;
  loading?: boolean;
}

export function PluginStatus({
  connected = false,
  pluginVersion = "1.0.0",
  clientCount = 0,
  uptime = 0,
  lastHeartbeat = 0,
  loading = false,
}: PluginStatusProps) {
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

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatLastHeartbeat = (timestamp: number) => {
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
        <h3 className="text-h3 font-semibold text-white">Plugin Status</h3>
        <div
          className={`flex items-center gap-2 rounded-full px-3 py-1 ${
            connected
              ? "bg-success-500/10 text-success-400"
              : "bg-error-500/10 text-error-400"
          }`}
        >
          {connected ? (
            <Wifi className="h-3 w-3" />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          <span className="text-xs font-medium">
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Plugin Version */}
        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-800/50 p-3">
          <div className="flex items-center gap-2">
            <Puzzle className="h-4 w-4 text-brand-400" />
            <span className="text-sm text-slate-400">Version</span>
          </div>
          <span className="text-sm font-medium text-white">{pluginVersion}</span>
        </div>

        {/* Client Count */}
        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-800/50 p-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-accent" />
            <span className="text-sm text-slate-400">Active Clients</span>
          </div>
          <span className="text-sm font-medium text-white">{clientCount}</span>
        </div>

        {/* Uptime */}
        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-800/50 p-3">
          <span className="text-sm text-slate-400">Uptime</span>
          <span className="text-sm font-medium text-white">{formatUptime(uptime)}</span>
        </div>

        {/* Last Heartbeat */}
        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-800/50 p-3">
          <span className="text-sm text-slate-400">Last Heartbeat</span>
          <span className="text-sm font-medium text-white">
            {formatLastHeartbeat(lastHeartbeat)}
          </span>
        </div>
      </div>
    </div>
  );
}
