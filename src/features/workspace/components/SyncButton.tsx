import { useState } from "react";
import { Upload, Loader2, CheckCircle, XCircle } from "lucide-react";
import { syncToStudio, type SyncResult } from "@/services/studioBridgeApi";

type SyncStatus = "idle" | "syncing" | "success" | "error";

interface SyncButtonProps {
  projectId: string;
  disabled?: boolean;
  onComplete?: (result: SyncResult) => void;
}

export function SyncButton({
  projectId,
  disabled,
  onComplete,
}: SyncButtonProps) {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [result, setResult] = useState<SyncResult | null>(null);

  const handleSync = async () => {
    if (status === "syncing" || disabled) return;
    setStatus("syncing");
    setResult(null);

    const res = await syncToStudio(projectId);
    setResult(res);
    setStatus(res.success ? "success" : "error");

    onComplete?.(res);

    // Reset after 4s
    setTimeout(() => setStatus("idle"), 4000);
  };

  const config = {
    idle: {
      color: "from-cyan-500 to-blue-500",
      icon: Upload,
      label: "Sync to Studio",
    },
    syncing: {
      color: "from-yellow-500 to-orange-500",
      icon: Loader2,
      label: "Syncing...",
    },
    success: {
      color: "from-green-500 to-emerald-500",
      icon: CheckCircle,
      label: `Synced ${result?.itemsSynced ?? 0} items`,
    },
    error: {
      color: "from-red-500 to-rose-500",
      icon: XCircle,
      label: result?.error ?? "Sync failed",
    },
  }[status];

  const Icon = config.icon;

  return (
    <button
      onClick={handleSync}
      disabled={status === "syncing" || disabled}
      className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r ${config.color} px-4 py-2.5 text-sm font-medium text-white transition-all hover:translate-y-[-1px] disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      <Icon
        className={`h-4 w-4 ${status === "syncing" ? "animate-spin" : ""}`}
      />
      {config.label}
    </button>
  );
}
