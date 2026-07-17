import { useEffect, useRef, useState } from "react";
import {
  Upload,
  Wifi,
  WifiOff,
  Loader2,
  CheckCircle,
  XCircle,
  ArrowRight,
  Circle,
  Plug,
  Unplug,
  Heart,
} from "lucide-react";
import { Card } from "@/shared/ui/Card";
import {
  syncToStudio,
  getStudioStatus,
  connectStudio,
  disconnectStudio,
  sendHeartbeat,
  type SyncResult,
  type StudioStatusData,
} from "@/services/studioBridgeApi";

interface StudioBridgePanelProps {
  projectId: string;
  status: string;
}

type SyncStatus = "idle" | "syncing" | "success" | "error";
type WorkflowStage = { label: string; done: boolean; active: boolean };

export function StudioBridgePanel({
  projectId,
  status,
}: StudioBridgePanelProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<StudioStatusData | null>(
    null,
  );
  const [clientId, setClientId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const heartbeatRef = useRef<number | null>(null);

  const isGenerated = status === "completed";
  const hasSynced = lastResult?.success === true;
  const isStudioConnected = bridgeStatus?.connected ?? false;

  // Poll bridge status
  useEffect(() => {
    const loadStatus = async () => {
      const result = await getStudioStatus();
      if (result.success && result.data) {
        setBridgeStatus(result.data);
      }
    };
    loadStatus();
    const interval = window.setInterval(loadStatus, 10_000);
    return () => window.clearInterval(interval);
  }, []);

  // Heartbeat when connected
  useEffect(() => {
    if (!clientId) return;
    heartbeatRef.current = window.setInterval(() => {
      sendHeartbeat(clientId);
    }, 15_000);
    return () => {
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    };
  }, [clientId]);

  const handleConnect = async () => {
    setIsConnecting(true);
    const result = await connectStudio("2024.1.0", projectId);
    if (result.success && result.data) {
      setClientId(result.data.clientId);
      // Refresh status
      const statusResult = await getStudioStatus();
      if (statusResult.success && statusResult.data) {
        setBridgeStatus(statusResult.data);
      }
    }
    setIsConnecting(false);
  };

  const handleDisconnect = async () => {
    if (!clientId) return;
    await disconnectStudio(clientId);
    setClientId(null);
    const statusResult = await getStudioStatus();
    if (statusResult.success && statusResult.data) {
      setBridgeStatus(statusResult.data);
    }
  };

  const handleSync = async () => {
    if (syncStatus === "syncing") return;
    setSyncStatus("syncing");
    const result = await syncToStudio(projectId);
    setLastResult(result);
    setSyncStatus(result.success ? "success" : "error");
    setTimeout(() => setSyncStatus("idle"), 5000);
  };

  // Workflow stages
  const stages: WorkflowStage[] = [
    { label: "Generate", done: isGenerated, active: status === "running" },
    { label: "Validate", done: isGenerated, active: false },
    {
      label: "Bridge",
      done: isStudioConnected,
      active: isConnecting,
    },
    { label: "Sync", done: hasSynced, active: syncStatus === "syncing" },
    { label: "Publish", done: false, active: false },
  ];

  const activeClient = bridgeStatus?.clients?.[0];

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Studio Bridge</p>
        {isStudioConnected ? (
          <Wifi className="h-4 w-4 text-success-400" />
        ) : (
          <WifiOff className="h-4 w-4 text-slate-500" />
        )}
      </div>

      {/* Connection status */}
      <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Status</span>
          <span
            className={
              isStudioConnected ? "text-success-400" : "text-slate-500"
            }
          >
            {isStudioConnected ? "Connected" : "Disconnected"}
          </span>
        </div>
        {activeClient && (
          <>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-slate-400">Studio</span>
              <span className="text-slate-300">
                v{activeClient.studioVersion}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-slate-400">
                <Heart className="mr-1 inline h-2.5 w-2.5" />
                Heartbeat
              </span>
              <span className="text-slate-300">
                {Math.round((Date.now() - activeClient.lastHeartbeat) / 1000)}s
                ago
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-slate-400">Session</span>
              <span className="text-slate-500 text-[10px]">
                {activeClient.clientId.slice(0, 14)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Connect/Disconnect */}
      <div className="mt-2 flex gap-2">
        {!isStudioConnected ? (
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-success-500/10 px-3 py-2 text-xs text-success-400 hover:bg-success-500/20 disabled:opacity-50"
          >
            {isConnecting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plug className="h-3 w-3" />
            )}
            Connect
          </button>
        ) : (
          <button
            onClick={handleDisconnect}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-error-500/10 px-3 py-2 text-xs text-error-400 hover:bg-error-500/20"
          >
            <Unplug className="h-3 w-3" /> Disconnect
          </button>
        )}
      </div>

      {/* Sync Button */}
      <button
        onClick={handleSync}
        disabled={
          syncStatus === "syncing" || !isGenerated || !isStudioConnected
        }
        className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
          syncStatus === "success"
            ? "bg-success-500/20 text-success-300"
            : syncStatus === "error"
              ? "bg-error-500/20 text-error-300"
              : "bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30"
        }`}
      >
        {syncStatus === "syncing" && (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        )}
        {syncStatus === "idle" && <Upload className="h-3.5 w-3.5" />}
        {syncStatus === "success" && <CheckCircle className="h-3.5 w-3.5" />}
        {syncStatus === "error" && <XCircle className="h-3.5 w-3.5" />}
        {syncStatus === "idle" &&
          (!isGenerated
            ? "Generate first"
            : !isStudioConnected
              ? "Connect Studio first"
              : "Sync to Studio")}
        {syncStatus === "syncing" && "Syncing..."}
        {syncStatus === "success" &&
          `Synced ${lastResult?.itemsSynced ?? 0} items`}
        {syncStatus === "error" && (lastResult?.error ?? "Failed")}
      </button>

      {/* Publish Workflow */}
      <div className="mt-4 flex items-center gap-0.5">
        {stages.map((stage, i) => (
          <div key={stage.label} className="flex items-center">
            <div className="flex flex-col items-center">
              {stage.done ? (
                <CheckCircle className="h-3 w-3 text-success-400" />
              ) : (
                <Circle
                  className={`h-3 w-3 ${stage.active ? "text-cyan-400" : "text-slate-600"}`}
                />
              )}
              <span
                className={`mt-0.5 text-[10px] ${stage.done ? "text-success-400" : stage.active ? "text-cyan-300" : "text-slate-500"}`}
              >
                {stage.label}
              </span>
            </div>
            {i < stages.length - 1 && (
              <ArrowRight className="mx-0.5 h-2.5 w-2.5 text-slate-700" />
            )}
          </div>
        ))}
      </div>

      {lastResult && !lastResult.success && (
        <p className="mt-2 text-[10px] text-error-400">{lastResult.error}</p>
      )}
    </Card>
  );
}
