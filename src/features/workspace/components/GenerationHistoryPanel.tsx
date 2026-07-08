import { useEffect, useState } from "react";
import { Clock, CheckCircle, XCircle, History } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import {
  getExperienceHistory,
  type GenerationHistoryEntry,
} from "../../../services/conceptApi";

interface GenerationHistoryPanelProps {
  refreshTrigger?: number;
}

export function GenerationHistoryPanel({
  refreshTrigger,
}: GenerationHistoryPanelProps) {
  const [entries, setEntries] = useState<GenerationHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const result = await getExperienceHistory();
      if (result.success && result.data) {
        setEntries(result.data);
      }
      setIsLoading(false);
    };
    load();
  }, [refreshTrigger]);

  if (entries.length === 0 && !isLoading) {
    return (
      <Card>
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-400" />
          <p className="text-sm font-semibold text-white">Generation History</p>
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">
          No generation runs yet.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-400" />
          <p className="text-sm font-semibold text-white">Generation History</p>
        </div>
        <span className="text-xs text-slate-500">{entries.length} runs</span>
      </div>

      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
        {entries.map((entry) => (
          <HistoryRow key={entry.pipelineId} entry={entry} />
        ))}
      </div>
    </Card>
  );
}

function HistoryRow({ entry }: { entry: GenerationHistoryEntry }) {
  const durationMs = entry.finishedAt
    ? entry.finishedAt - entry.startedAt
    : Date.now() - entry.startedAt;
  const durationSec = Math.round(durationMs / 1000);
  const date = new Date(entry.startedAt).toLocaleString();

  return (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
      <div className="flex items-center gap-2">
        <StatusIcon status={entry.status} />
        <div>
          <p className="text-xs text-slate-300">
            {entry.pipelineId.slice(0, 18)}
          </p>
          <p className="text-[10px] text-slate-500">{date}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xs text-slate-400">
          {entry.completedStages.length}/{entry.stageCount}
        </p>
        <p className="flex items-center gap-1 text-[10px] text-slate-500">
          <Clock className="h-2.5 w-2.5" /> {durationSec}s
        </p>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") {
    return <CheckCircle className="h-3.5 w-3.5 text-green-400" />;
  }
  if (status === "failed") {
    return <XCircle className="h-3.5 w-3.5 text-red-400" />;
  }
  return <Clock className="h-3.5 w-3.5 text-cyan-400" />;
}
