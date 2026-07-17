import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCcw, Loader2 } from "lucide-react";
import { Card } from "@/shared/ui/Card";
import {
  getProjectStudioStatus as getStudioStatus,
  type StudioSession,
} from "@/services/studioBridgeApi";

interface StudioConnectionStatusProps {
  projectId: string;
}

export function StudioConnectionStatus({
  projectId,
}: StudioConnectionStatusProps) {
  const [session, setSession] = useState<StudioSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const data = await getStudioStatus(projectId);
    setSession(data);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 10000);
    return () => clearInterval(interval);
  }, [projectId]);

  const connected = session !== null;
  const syncing = session?.status === "syncing";

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Studio Bridge</p>
        <button
          onClick={refresh}
          className="rounded-lg p-1 text-slate-400 hover:text-white transition-colors"
          aria-label="Refresh"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        ) : connected ? (
          <Wifi
            className={`h-4 w-4 ${syncing ? "text-warning-400" : "text-success-400"}`}
          />
        ) : (
          <WifiOff className="h-4 w-4 text-slate-500" />
        )}
        <span
          className={`text-sm font-medium ${loading ? "text-slate-400" : connected ? (syncing ? "text-warning-400" : "text-success-400") : "text-slate-500"}`}
        >
          {loading
            ? "Checking..."
            : connected
              ? syncing
                ? "SYNCING"
                : "CONNECTED"
              : "DISCONNECTED"}
        </span>
      </div>

      {session && (
        <div className="mt-3 space-y-1 text-xs text-slate-400">
          <p>Session: {session.sessionId.slice(0, 16)}…</p>
          {session.lastSyncAt && (
            <p>
              Last sync: {new Date(session.lastSyncAt).toLocaleTimeString()}
            </p>
          )}
          {session.syncCount !== undefined && <p>Syncs: {session.syncCount}</p>}
          {session.version !== undefined && <p>Version: {session.version}</p>}
        </div>
      )}

      {!connected && !loading && (
        <p className="mt-3 text-xs text-slate-500">
          No active Studio session. Sync will create one.
        </p>
      )}
    </Card>
  );
}
