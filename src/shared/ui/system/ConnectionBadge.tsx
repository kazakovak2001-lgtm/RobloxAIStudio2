import { Wifi, WifiOff, X } from "lucide-react";

export interface ConnectionBadgeProps {
  connected: boolean;
  latency?: number;
  lastHeartbeat?: number;
  onDisconnect?: () => void;
}

export function ConnectionBadge({
  connected,
  latency,
  lastHeartbeat,
  onDisconnect,
}: ConnectionBadgeProps) {
  const formatLatency = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
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
    <div
      className={`flex items-center gap-3 rounded-full px-4 py-2 ${
        connected
          ? "bg-success-500/10 text-success-400 border-success-400/20"
          : "bg-slate-500/10 text-slate-400 border-slate-400/20"
      } border`}
    >
      <div className="flex items-center gap-2">
        {connected ? (
          <Wifi className="h-4 w-4" />
        ) : (
          <WifiOff className="h-4 w-4" />
        )}
        <span className="text-sm font-medium">
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {connected && latency && (
        <div className="flex items-center gap-1 text-xs">
          <span className="opacity-70">Latency:</span>
          <span className="font-medium">{formatLatency(latency)}</span>
        </div>
      )}

      {connected && lastHeartbeat && (
        <div className="flex items-center gap-1 text-xs">
          <span className="opacity-70">Last:</span>
          <span className="font-medium">
            {formatLastHeartbeat(lastHeartbeat)}
          </span>
        </div>
      )}

      {connected && onDisconnect && (
        <button
          onClick={onDisconnect}
          className="ml-2 rounded-full p-1 transition hover:bg-white/10"
          type="button"
          aria-label="Disconnect"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
