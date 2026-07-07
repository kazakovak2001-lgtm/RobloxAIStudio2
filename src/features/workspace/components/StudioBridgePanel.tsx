import { useState } from "react";
import {
  Upload,
  Wifi,
  WifiOff,
  Loader2,
  CheckCircle,
  XCircle,
  ArrowRight,
  Circle,
} from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { syncToStudio, type SyncResult } from "../../../services/studioService";

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

  const isGenerated = status === "completed";
  const hasSynced = lastResult?.success === true;

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
    { label: "Sync", done: hasSynced, active: syncStatus === "syncing" },
    { label: "Test", done: false, active: false },
    { label: "Publish", done: false, active: false },
  ];

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Studio Bridge</p>
        {hasSynced ? (
          <Wifi className="h-4 w-4 text-green-400" />
        ) : (
          <WifiOff className="h-4 w-4 text-slate-500" />
        )}
      </div>

      {/* Sync Button */}
      <button
        onClick={handleSync}
        disabled={syncStatus === "syncing" || !isGenerated}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
          syncStatus === "success"
            ? "bg-green-500/20 text-green-300"
            : syncStatus === "error"
              ? "bg-red-500/20 text-red-300"
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
          (isGenerated ? "Sync to Studio" : "Generate first")}
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
                <CheckCircle className="h-3 w-3 text-green-400" />
              ) : (
                <Circle
                  className={`h-3 w-3 ${stage.active ? "text-cyan-400" : "text-slate-600"}`}
                />
              )}
              <span
                className={`mt-0.5 text-[10px] ${stage.done ? "text-green-400" : stage.active ? "text-cyan-300" : "text-slate-500"}`}
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
        <p className="mt-2 text-[10px] text-red-400">{lastResult.error}</p>
      )}
    </Card>
  );
}
