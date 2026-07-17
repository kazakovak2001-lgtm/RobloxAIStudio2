import { useEffect, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Card } from "@/shared/ui/Card";
import {
  getProtocolLog,
  getProtocolInfo,
  getSyncStatus,
  type ProtocolLogEntry,
  type ProtocolInfo,
  type SyncStatusData,
} from "@/services/studioBridgeApi";

interface ProtocolMonitorProps {
  isConnected: boolean;
}

export function ProtocolMonitor({ isConnected }: ProtocolMonitorProps) {
  const [info, setInfo] = useState<ProtocolInfo | null>(null);
  const [log, setLog] = useState<ProtocolLogEntry[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatusData | null>(null);

  useEffect(() => {
    const loadInfo = async () => {
      const result = await getProtocolInfo();
      if (result.success && result.data) setInfo(result.data);
    };
    loadInfo();
  }, []);

  useEffect(() => {
    if (!isConnected) return;
    const loadData = async () => {
      const [logResult, syncResult] = await Promise.all([
        getProtocolLog(20),
        getSyncStatus(),
      ]);
      if (logResult.success && logResult.data) setLog(logResult.data);
      if (syncResult.success && syncResult.data) setSyncStatus(syncResult.data);
    };
    loadData();
    const interval = window.setInterval(loadData, 5000);
    return () => window.clearInterval(interval);
  }, [isConnected]);

  const lastEntry = log.length > 0 ? log[log.length - 1] : null;
  const avgRoundTrip =
    log.length > 0
      ? Math.round(
          log.reduce((sum, e) => sum + (e.roundTripMs ?? 0), 0) / log.length,
        )
      : 0;
  const errorCount = log.filter((e) => e.status === "error").length;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-slate-400" />
          <p className="text-sm font-semibold text-white">Protocol Monitor</p>
        </div>
        {info && (
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">
            v{info.protocolVersion}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-white/[0.02] px-2 py-1.5">
          <p className="text-[10px] text-slate-500">RTT</p>
          <p className="text-xs font-medium text-slate-300">{avgRoundTrip}ms</p>
        </div>
        <div className="rounded-lg bg-white/[0.02] px-2 py-1.5">
          <p className="text-[10px] text-slate-500">Messages</p>
          <p className="text-xs font-medium text-slate-300">{log.length}</p>
        </div>
        <div className="rounded-lg bg-white/[0.02] px-2 py-1.5">
          <p className="text-[10px] text-slate-500">Errors</p>
          <p
            className={`text-xs font-medium ${errorCount > 0 ? "text-error-400" : "text-slate-300"}`}
          >
            {errorCount}
          </p>
        </div>
      </div>

      {/* Last command */}
      {lastEntry && (
        <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Last Command</span>
            <span className="text-slate-300">{lastEntry.type}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-slate-400">
              <Clock className="mr-0.5 inline h-2.5 w-2.5" />
              RTT
            </span>
            <span className="text-slate-300">{lastEntry.roundTripMs}ms</span>
          </div>
        </div>
      )}

      {/* Message log */}
      {log.length > 0 && (
        <div className="mt-3 max-h-32 space-y-1 overflow-y-auto">
          {log
            .slice(-10)
            .reverse()
            .map((entry) => (
              <LogRow key={entry.messageId} entry={entry} />
            ))}
        </div>
      )}

      {/* Sync status */}
      {syncStatus && isConnected && (
        <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5 mb-1.5">
            <RefreshCw className="h-3 w-3 text-slate-400" />
            <span className="font-medium text-slate-300">Sync Status</span>
            {syncStatus.conflictCount > 0 && (
              <AlertTriangle className="h-3 w-3 text-yellow-400" />
            )}
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Version</span>
              <span className="text-slate-300 text-[10px]">
                {syncStatus.currentVersion.slice(0, 14)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Pending</span>
              <span className="text-slate-300">
                {syncStatus.pendingChanges}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Conflicts</span>
              <span
                className={
                  syncStatus.conflictCount > 0
                    ? "text-yellow-400"
                    : "text-slate-300"
                }
              >
                {syncStatus.conflictCount}
              </span>
            </div>
            {syncStatus.lastSyncTimestamp && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Last sync</span>
                <span className="text-slate-300 text-[10px]">
                  {new Date(syncStatus.lastSyncTimestamp).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {!isConnected && (
        <p className="mt-3 text-center text-[10px] text-slate-500">
          Connect to Studio to see protocol activity.
        </p>
      )}
    </Card>
  );
}

const SYNC_MESSAGE_TYPES = new Set([
  "GET_PROJECT",
  "GET_ARTIFACTS",
  "SYNC_REQUEST",
  "SYNC_RESPONSE",
  "VALIDATE",
]);

function LogRow({ entry }: { entry: ProtocolLogEntry }) {
  const isSync = SYNC_MESSAGE_TYPES.has(entry.type);
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/[0.01] px-2 py-1 text-[10px]">
      <div className="flex items-center gap-1.5">
        {entry.direction === "client_to_server" ? (
          <ArrowUpRight className="h-2.5 w-2.5 text-cyan-400" />
        ) : (
          <ArrowDownLeft className="h-2.5 w-2.5 text-purple-400" />
        )}
        {isSync && <RefreshCw className="h-2.5 w-2.5 text-teal-400" />}
        <span className={isSync ? "text-teal-300" : "text-slate-400"}>
          {entry.type}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-slate-600">{entry.payloadSize}B</span>
        {entry.status === "ok" ? (
          <CheckCircle className="h-2.5 w-2.5 text-success-400" />
        ) : (
          <XCircle className="h-2.5 w-2.5 text-error-400" />
        )}
      </div>
    </div>
  );
}
