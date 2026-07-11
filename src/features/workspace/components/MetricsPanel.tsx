import { useEffect, useState } from "react";
import { BarChart3, Clock, Coins, Cpu } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import {
  getPipelineMetrics,
  type PipelineMetricsData,
} from "../../../services/generationMonitorApi";

interface MetricsPanelProps {
  pipelineId: string | null;
}

export function MetricsPanel({ pipelineId }: MetricsPanelProps) {
  const [metrics, setMetrics] = useState<PipelineMetricsData | null>(null);

  useEffect(() => {
    if (!pipelineId) {
      setMetrics(null);
      return;
    }
    const load = async () => {
      const result = await getPipelineMetrics(pipelineId);
      if (result.success && result.data) setMetrics(result.data);
    };
    load();
    const interval = window.setInterval(load, 4000);
    return () => window.clearInterval(interval);
  }, [pipelineId]);

  if (!pipelineId || !metrics) return null;

  const durationSec = Math.round(metrics.duration / 1000);
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  const durationStr =
    minutes > 0
      ? `${minutes}:${String(seconds).padStart(2, "0")}`
      : `${seconds}s`;

  return (
    <Card>
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-brand-400" />
        <p className="text-sm font-semibold text-white">Generation Metrics</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MetricItem
          icon={Clock}
          label="Duration"
          value={durationStr}
          color="text-cyan-400"
        />
        <MetricItem
          icon={Cpu}
          label="Stages"
          value={`${metrics.stagesCompleted}/${metrics.stagesTotal}`}
          color="text-green-400"
        />
        <MetricItem
          icon={BarChart3}
          label="Tokens"
          value={
            metrics.tokenUsage > 0 ? metrics.tokenUsage.toLocaleString() : "—"
          }
          color="text-purple-400"
        />
        <MetricItem
          icon={Coins}
          label="AI Cost"
          value={metrics.aiCost > 0 ? `$${metrics.aiCost.toFixed(4)}` : "—"}
          color="text-yellow-400"
        />
      </div>

      {metrics.failures > 0 && (
        <div className="mt-2 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-400">
          {metrics.failures} failure{metrics.failures !== 1 ? "s" : ""} •{" "}
          {metrics.retryCount} retries
        </div>
      )}
    </Card>
  );
}

function MetricItem({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.02] px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3 w-3 ${color}`} />
        <span className="text-[10px] text-slate-500">{label}</span>
      </div>
      <p className="mt-0.5 text-sm font-medium text-slate-200">{value}</p>
    </div>
  );
}
