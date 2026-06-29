import { memo } from "react";
import { BarChart3, Clock3, Coins, Sparkles, Zap } from "lucide-react";
import { Card } from "../../../components/ui/Card";

interface ProjectSummaryProps {
  agents: number;
  runTimeSeconds?: number;
  steps: number;
  retries: number;
  tokens: number;
  cost: number;
}

function ProjectSummaryComponent({
  agents,
  runTimeSeconds,
  steps,
  retries,
  tokens,
  cost,
}: ProjectSummaryProps) {
  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="rounded-2xl bg-brand-500/10 p-2 text-brand-300">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Project summary</p>
            <p className="text-xs text-slate-500">
              High-level health and budget overview.
            </p>
          </div>
        </div>
        <div className="grid gap-2 text-sm text-slate-300">
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <span className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" /> Agents
            </span>
            <span className="font-semibold text-white">{agents}</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <span className="flex items-center gap-2">
              <Clock3 className="h-3.5 w-3.5" /> Run time
            </span>
            <span className="font-semibold text-white">
              {runTimeSeconds ?? 0}s
            </span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <span className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5" /> Steps
            </span>
            <span className="font-semibold text-white">{steps}</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <span>Retries</span>
            <span className="font-semibold text-white">{retries}</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <span>Tokens</span>
            <span className="font-semibold text-white">{tokens}</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <span className="flex items-center gap-2">
              <Coins className="h-3.5 w-3.5" /> Cost
            </span>
            <span className="font-semibold text-white">${cost.toFixed(4)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export const ProjectSummary = memo(ProjectSummaryComponent);
export default ProjectSummary;
