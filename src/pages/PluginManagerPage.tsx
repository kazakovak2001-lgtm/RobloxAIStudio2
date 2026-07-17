import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/shared/ui/Card";
import {
  ConnectionBadge,
  StatusIndicator,
  SyncProgress,
} from "@/shared/ui/system";
import { Button } from "@/shared/ui/Button";
import { Loader } from "@/shared/ui/Loader";
import {
  getStudioStatus,
  getProtocolInfo,
  getProtocolLog,
  connectStudio,
  disconnectStudio,
  requestProjectSync,
  getSyncStatus,
  type StudioStatusData,
  type ProtocolInfo,
  type ProtocolLogEntry,
  type SyncStatusData,
} from "@/services/studioBridgeApi";

type ServiceStatus = {
  name: string;
  status: "online" | "offline" | "warning";
  detail: string;
};

export default function PluginManagerPage() {
  // --- Core state ---
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- API data ---
  const [studioStatus, setStudioStatus] = useState<StudioStatusData | null>(
    null,
  );
  const [protocolInfo, setProtocolInfo] = useState<ProtocolInfo | null>(null);
  const [protocolLog, setProtocolLog] = useState<ProtocolLogEntry[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatusData | null>(null);

  // --- Sync UI state ---
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // --- Refs for cleanup ---
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Derived state ---
  const connected = studioStatus?.connected ?? false;
  const clientCount = studioStatus?.clientCount ?? 0;
  const latency =
    protocolLog.length > 0
      ? protocolLog.find((e) => e.roundTripMs !== undefined)?.roundTripMs
      : undefined;
  const lastHeartbeat = studioStatus?.clients?.[0]?.lastHeartbeat;

  // --- Build services list from real data ---
  const services: ServiceStatus[] = (() => {
    if (!studioStatus) return [];

    const list: ServiceStatus[] = [];

    // Backend bridge status
    list.push({
      name: "Studio Bridge",
      status: connected ? "online" : "offline",
      detail: connected ? `${clientCount} client(s)` : "No connection",
    });

    // Each connected client
    studioStatus.clients.forEach((client) => {
      list.push({
        name: `Client: ${client.studioVersion}`,
        status: client.status === "connected" ? "online" : "warning",
        detail: client.projectId ?? "No project",
      });
    });

    // Sync service
    list.push({
      name: "Sync Service",
      status: syncStatus
        ? syncStatus.conflictCount > 0
          ? "warning"
          : "online"
        : "offline",
      detail: syncStatus
        ? `${syncStatus.pendingChanges} pending`
        : "Unavailable",
    });

    // Protocol
    list.push({
      name: "Protocol",
      status: protocolInfo ? "online" : "offline",
      detail: protocolInfo ? `v${protocolInfo.protocolVersion}` : "Unavailable",
    });

    return list;
  })();

  // --- Fetch all initial data ---
  const fetchData = useCallback(async () => {
    try {
      const [statusRes, infoRes, logRes, syncRes] = await Promise.all([
        getStudioStatus(),
        getProtocolInfo(),
        getProtocolLog(30),
        getSyncStatus(),
      ]);

      if (statusRes.success && statusRes.data) {
        setStudioStatus(statusRes.data);
      } else {
        setError(statusRes.error ?? "Failed to fetch studio status");
      }

      if (infoRes.success && infoRes.data) {
        setProtocolInfo(infoRes.data);
      }

      if (logRes.success && logRes.data) {
        setProtocolLog(logRes.data);
      }

      if (syncRes.success && syncRes.data) {
        setSyncStatus(syncRes.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, []);

  // --- Initial fetch + polling ---
  useEffect(() => {
    fetchData();

    pollingRef.current = setInterval(() => {
      // Refresh status, log, and sync status every 5s
      getStudioStatus().then((res) => {
        if (res.success && res.data) setStudioStatus(res.data);
      });
      getProtocolLog(30).then((res) => {
        if (res.success && res.data) setProtocolLog(res.data);
      });
      getSyncStatus().then((res) => {
        if (res.success && res.data) setSyncStatus(res.data);
      });
    }, 5000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (syncPollingRef.current) clearInterval(syncPollingRef.current);
    };
  }, [fetchData]);

  // --- Connect handler ---
  const handleConnect = async () => {
    setError(null);
    const result = await connectStudio("latest", "default-project");
    if (result.success) {
      // Refresh data after connecting
      const statusRes = await getStudioStatus();
      if (statusRes.success && statusRes.data) setStudioStatus(statusRes.data);
    } else {
      setError(result.error ?? "Failed to connect");
    }
  };

  // --- Disconnect handler ---
  const handleDisconnect = async () => {
    if (!studioStatus?.clients.length) return;
    const clientId = studioStatus.clients[0].clientId;
    const result = await disconnectStudio(clientId);
    if (result.success) {
      const statusRes = await getStudioStatus();
      if (statusRes.success && statusRes.data) setStudioStatus(statusRes.data);
    } else {
      setError(result.error ?? "Failed to disconnect");
    }
  };

  // --- Sync handler ---
  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);

    const projectId =
      studioStatus?.clients?.[0]?.projectId ?? "default-project";
    const result = await requestProjectSync(projectId);

    if (!result.success) {
      setSyncError(result.error ?? "Sync request failed");
      setSyncing(false);
      return;
    }

    // Poll sync status until complete
    syncPollingRef.current = setInterval(async () => {
      const syncRes = await getSyncStatus(projectId);
      if (syncRes.success && syncRes.data) {
        setSyncStatus(syncRes.data);
        // If no pending changes remain, sync is done
        if (syncRes.data.pendingChanges === 0) {
          if (syncPollingRef.current) clearInterval(syncPollingRef.current);
          setSyncing(false);
        }
      } else {
        if (syncPollingRef.current) clearInterval(syncPollingRef.current);
        setSyncError(syncRes.error ?? "Failed to poll sync status");
        setSyncing(false);
      }
    }, 1000);
  };

  // --- Format timestamp for event log ---
  const formatTimestamp = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // ─── Loading State ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-24 sm:px-6 lg:px-8">
        <Loader size="lg" label="Connecting to Studio Bridge..." />
      </div>
    );
  }

  // ─── Error State (full page error — no data at all) ─────────────────────
  if (error && !studioStatus) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Card>
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="rounded-full bg-error-500/10 p-3">
              <span className="text-2xl">⚠️</span>
            </div>
            <h2 className="text-lg font-semibold text-white">
              Connection Error
            </h2>
            <p className="text-sm text-slate-400">{error}</p>
            <Button variant="primary" onClick={fetchData}>
              Retry
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ─── Main Render ────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-brand-300">
            Plugin Manager
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Roblox Studio Connection
          </h1>
          <p className="mt-2 text-slate-400">
            Manage your Roblox Studio plugin connection and sync settings.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionBadge
            connected={connected}
            latency={latency}
            lastHeartbeat={lastHeartbeat}
            onDisconnect={connected ? handleDisconnect : undefined}
          />
          {!connected && (
            <Button variant="primary" onClick={handleConnect}>
              Connect
            </Button>
          )}
        </div>
      </div>

      {/* Inline error banner */}
      {error && studioStatus && (
        <div className="mb-6 rounded-lg border border-error-400/20 bg-error-500/10 px-4 py-3 text-sm text-error-400">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
          {/* Sync Card */}
          <Card>
            <h3 className="text-lg font-semibold text-white mb-4">
              Sync Status
            </h3>
            {syncing ? (
              <SyncProgress
                progress={
                  syncStatus
                    ? Math.max(0, syncStatus.pendingChanges > 0 ? 50 : 100)
                    : 0
                }
                total={100}
                current="Synchronizing project..."
                onCancel={() => {
                  if (syncPollingRef.current)
                    clearInterval(syncPollingRef.current);
                  setSyncing(false);
                }}
              />
            ) : (
              <>
                {syncStatus && (
                  <div className="mb-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Pending Changes</span>
                      <span className="text-white">
                        {syncStatus.pendingChanges}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Conflicts</span>
                      <span
                        className={
                          syncStatus.conflictCount > 0
                            ? "text-warning-400"
                            : "text-white"
                        }
                      >
                        {syncStatus.conflictCount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Version</span>
                      <span className="text-white">
                        {syncStatus.currentVersion}
                      </span>
                    </div>
                    {syncStatus.lastSyncTimestamp && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Last Sync</span>
                        <span className="text-white">
                          {formatTimestamp(syncStatus.lastSyncTimestamp)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {syncError && (
                  <p className="mb-3 text-xs text-error-400">{syncError}</p>
                )}
                <Button
                  onClick={handleSync}
                  className="w-full"
                  variant="primary"
                  disabled={!connected}
                >
                  Start Sync
                </Button>
              </>
            )}
          </Card>

          {/* Services Card */}
          <Card>
            <h3 className="text-lg font-semibold text-white mb-4">Services</h3>
            <div className="space-y-3">
              {services.map((service) => (
                <div
                  key={service.name}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-800/50 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-white">
                      {service.name}
                    </p>
                    <p className="text-xs text-slate-400">{service.detail}</p>
                  </div>
                  <StatusIndicator status={service.status} />
                </div>
              ))}
              {services.length === 0 && (
                <p className="text-sm text-slate-400">No services available</p>
              )}
            </div>
          </Card>
        </div>

        {/* Event Log Card */}
        <Card className="lg:col-span-2">
          <h3 className="text-lg font-semibold text-white mb-4">Event Log</h3>
          {protocolLog.length === 0 ? (
            <p className="text-sm text-slate-400">
              No protocol events recorded yet.
            </p>
          ) : (
            <div className="max-h-[500px] space-y-2 overflow-y-auto pr-2">
              {protocolLog.map((entry) => (
                <div
                  key={entry.messageId}
                  className="flex items-start gap-3 rounded-lg border border-white/5 bg-slate-800/30 p-3"
                >
                  {/* Direction indicator */}
                  <span
                    className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                      entry.direction === "client_to_server"
                        ? "bg-brand-400"
                        : "bg-accent"
                    }`}
                    title={
                      entry.direction === "client_to_server"
                        ? "Client → Server"
                        : "Server → Client"
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-white">
                        {entry.type}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {formatTimestamp(entry.timestamp)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                      <span
                        className={`rounded px-1.5 py-0.5 font-medium ${
                          entry.status === "ok"
                            ? "bg-success-500/10 text-success-400"
                            : entry.status === "error"
                              ? "bg-error-500/10 text-error-400"
                              : "bg-warning-500/10 text-warning-400"
                        }`}
                      >
                        {entry.status}
                      </span>
                      {entry.roundTripMs !== undefined && (
                        <span>{entry.roundTripMs}ms</span>
                      )}
                      <span>{entry.payloadSize}B</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
