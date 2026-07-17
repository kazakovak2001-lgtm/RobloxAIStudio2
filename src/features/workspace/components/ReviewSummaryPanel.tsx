import { useEffect, useState } from "react";
import {
  ClipboardCheck,
  CheckCircle,
  XCircle,
  Pencil,
  Clock,
} from "lucide-react";
import { Card } from "@/shared/ui/Card";
import { getReviewSummary, type ReviewSummary } from "@/services/conceptApi";

interface ReviewSummaryPanelProps {
  pipelineId: string | null;
  refreshTrigger?: number;
}

export function ReviewSummaryPanel({
  pipelineId,
  refreshTrigger,
}: ReviewSummaryPanelProps) {
  const [summary, setSummary] = useState<ReviewSummary | null>(null);

  useEffect(() => {
    if (!pipelineId) {
      setSummary(null);
      return;
    }
    const load = async () => {
      const result = await getReviewSummary(pipelineId);
      if (result.success && result.data) {
        setSummary(result.data);
      }
    };
    load();
  }, [pipelineId, refreshTrigger]);

  if (!pipelineId || !summary) return null;

  const completionPct =
    summary.total > 0
      ? Math.round(((summary.approved + summary.edited) / summary.total) * 100)
      : 0;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-slate-400" />
          <p className="text-sm font-semibold text-white">Review Summary</p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            summary.allApproved
              ? "bg-success-500/10 text-success-400"
              : "bg-warning-500/10 text-warning-400"
          }`}
        >
          {completionPct}% complete
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              summary.allApproved ? "bg-success-500" : "bg-brand-500"
            }`}
            style={{ width: `${completionPct}%` }}
          />
        </div>
      </div>

      {/* Stats grid */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatItem
          icon={CheckCircle}
          color="text-success-400"
          label="Approved"
          value={summary.approved}
        />
        <StatItem
          icon={Pencil}
          color="text-warning-400"
          label="Edited"
          value={summary.edited}
        />
        <StatItem
          icon={Clock}
          color="text-slate-400"
          label="Pending"
          value={summary.pending}
        />
        <StatItem
          icon={XCircle}
          color="text-error-400"
          label="Rejected"
          value={summary.rejected}
        />
      </div>

      <div className="mt-2 border-t border-white/5 pt-2 text-xs text-slate-400">
        <p>Total artifacts: {summary.total}</p>
      </div>
    </Card>
  );
}

function StatItem({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: typeof CheckCircle;
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-2.5 py-1.5">
      <Icon className={`h-3.5 w-3.5 ${color}`} />
      <div>
        <p className="text-[10px] text-slate-500">{label}</p>
        <p className="text-xs font-medium text-slate-300">{value}</p>
      </div>
    </div>
  );
}
