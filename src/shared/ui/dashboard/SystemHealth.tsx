import { Server, Cpu, HardDrive, Activity, CheckCircle, AlertCircle } from "lucide-react";

export interface SystemHealthProps {
  generationEngineStatus?: "online" | "offline" | "error";
  jobQueueStatus?: "online" | "offline" | "error";
  studioBridgeStatus?: "online" | "offline" | "error";
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  loading?: boolean;
}

export function SystemHealth({
  generationEngineStatus = "online",
  jobQueueStatus = "online",
  studioBridgeStatus = "offline",
  cpuUsage = 45,
  memoryUsage = 62,
  diskUsage = 38,
  loading = false,
}: SystemHealthProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-glow">
        <div className="animate-pulse">
          <div className="mb-4 h-6 w-32 rounded bg-slate-800" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-slate-800" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "online":
        return <CheckCircle className="h-4 w-4 text-success-400" />;
      case "offline":
        return <AlertCircle className="h-4 w-4 text-slate-400" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-error-400" />;
      default:
        return <AlertCircle className="h-4 w-4 text-slate-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
        return "text-success-400";
      case "offline":
        return "text-slate-400";
      case "error":
        return "text-error-400";
      default:
        return "text-slate-400";
    }
  };

  const getUsageColor = (usage: number) => {
    if (usage >= 90) return "bg-error-400";
    if (usage >= 70) return "bg-warning-400";
    return "bg-success-400";
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-glow backdrop-blur-xl">
      <h3 className="mb-4 text-h3 font-semibold text-white">System Health</h3>

      <div className="space-y-4">
        {/* Generation Engine */}
        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-800/50 p-3">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-brand-400" />
            <span className="text-sm text-slate-400">Generation Engine</span>
          </div>
          <div className={`flex items-center gap-2 ${getStatusColor(generationEngineStatus)}`}>
            {getStatusIcon(generationEngineStatus)}
            <span className="text-xs font-medium capitalize">
              {generationEngineStatus}
            </span>
          </div>
        </div>

        {/* Job Queue */}
        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-800/50 p-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-accent" />
            <span className="text-sm text-slate-400">Job Queue</span>
          </div>
          <div className={`flex items-center gap-2 ${getStatusColor(jobQueueStatus)}`}>
            {getStatusIcon(jobQueueStatus)}
            <span className="text-xs font-medium capitalize">{jobQueueStatus}</span>
          </div>
        </div>

        {/* Studio Bridge */}
        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-800/50 p-3">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-brand-400" />
            <span className="text-sm text-slate-400">Studio Bridge</span>
          </div>
          <div className={`flex items-center gap-2 ${getStatusColor(studioBridgeStatus)}`}>
            {getStatusIcon(studioBridgeStatus)}
            <span className="text-xs font-medium capitalize">
              {studioBridgeStatus}
            </span>
          </div>
        </div>

        {/* CPU Usage */}
        <div className="rounded-xl border border-white/5 bg-slate-800/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-brand-400" />
              <span className="text-sm text-slate-400">CPU Usage</span>
            </div>
            <span className="text-sm font-medium text-white">{cpuUsage}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-700">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${getUsageColor(cpuUsage)}`}
              style={{ width: `${cpuUsage}%` }}
            />
          </div>
        </div>

        {/* Memory Usage */}
        <div className="rounded-xl border border-white/5 bg-slate-800/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-accent" />
              <span className="text-sm text-slate-400">Memory Usage</span>
            </div>
            <span className="text-sm font-medium text-white">{memoryUsage}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-700">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${getUsageColor(memoryUsage)}`}
              style={{ width: `${memoryUsage}%` }}
            />
          </div>
        </div>

        {/* Disk Usage */}
        <div className="rounded-xl border border-white/5 bg-slate-800/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-brand-400" />
              <span className="text-sm text-slate-400">Disk Usage</span>
            </div>
            <span className="text-sm font-medium text-white">{diskUsage}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-700">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${getUsageColor(diskUsage)}`}
              style={{ width: `${diskUsage}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
