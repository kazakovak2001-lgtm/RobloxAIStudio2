import type { ReactNode } from "react";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  GitBranch,
  Clock,
} from "lucide-react";

export interface StatusBarProps {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  backendStatus?: "online" | "offline" | "loading";
  pluginStatus?: "connected" | "disconnected" | "syncing";
  syncStatus?: "synced" | "syncing" | "error" | "idle";
}

export function StatusBar({
  left,
  center,
  right,
  backendStatus = "online",
  pluginStatus = "disconnected",
  syncStatus = "idle",
}: StatusBarProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "online":
      case "connected":
      case "synced":
        return <CheckCircle className="h-3 w-3 text-success-400" />;
      case "offline":
      case "disconnected":
      case "error":
        return <XCircle className="h-3 w-3 text-error-400" />;
      case "loading":
      case "syncing":
        return <Loader2 className="h-3 w-3 text-warning-400 animate-spin" />;
      case "idle":
        return <AlertCircle className="h-3 w-3 text-slate-400" />;
      default:
        return <AlertCircle className="h-3 w-3 text-slate-400" />;
    }
  };

  const getStatusText = (status: string, type: string) => {
    switch (status) {
      case "online":
      case "connected":
      case "synced":
        return type === "backend"
          ? "Backend Online"
          : type === "plugin"
            ? "Plugin Connected"
            : "Synced";
      case "offline":
      case "disconnected":
        return type === "backend"
          ? "Backend Offline"
          : type === "plugin"
            ? "Plugin Disconnected"
            : "Disconnected";
      case "loading":
      case "syncing":
        return type === "backend"
          ? "Loading..."
          : type === "plugin"
            ? "Syncing..."
            : "Syncing...";
      case "idle":
        return "Idle";
      case "error":
        return "Error";
      default:
        return "Unknown";
    }
  };

  return (
    <footer className="flex h-8 items-center justify-between border-t border-white/10 bg-slate-900 px-4 text-xs">
      {/* Left Section */}
      <div className="flex items-center gap-4">
        {left ?? (
          <div className="flex items-center gap-3">
            {/* Backend Status */}
            <div className="flex items-center gap-1.5 text-slate-400">
              {getStatusIcon(backendStatus)}
              <span>{getStatusText(backendStatus, "backend")}</span>
            </div>

            {/* Plugin Status */}
            <div className="flex items-center gap-1.5 text-slate-400">
              {getStatusIcon(pluginStatus)}
              <span>{getStatusText(pluginStatus, "plugin")}</span>
            </div>

            {/* Sync Status */}
            <div className="flex items-center gap-1.5 text-slate-400">
              {getStatusIcon(syncStatus)}
              <span>{getStatusText(syncStatus, "sync")}</span>
            </div>
          </div>
        )}
      </div>

      {/* Center Section */}
      <div className="flex items-center">
        {center ?? (
          <div className="flex items-center gap-2 text-slate-400">
            <GitBranch className="h-3 w-3" />
            <span>main</span>
          </div>
        )}
      </div>

      {/* Right Section */}
      <div className="flex items-center">
        {right ?? (
          <div className="flex items-center gap-3 text-slate-400">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              <span>Ln 1, Col 1</span>
            </div>
            <span>UTF-8</span>
            <span>TypeScript React</span>
          </div>
        )}
      </div>
    </footer>
  );
}
