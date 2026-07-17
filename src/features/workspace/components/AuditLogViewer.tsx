import { useEffect, useState } from "react";
import { ScrollText, CheckCircle, XCircle, Play, Pause } from "lucide-react";
import { Card } from "@/shared/ui/Card";
import {
  getPipelineAuditLog,
  type AuditLogEntry,
} from "@/services/generationMonitorApi";

interface AuditLogViewerProps {
  pipelineId: string | null;
}

export function AuditLogViewer({ pipelineId }: AuditLogViewerProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    if (!pipelineId) {
      setEntries([]);
      return;
    }
    const load = async () => {
      const result = await getPipelineAuditLog(pipelineId);
      if (result.success && result.data) setEntries(result.data);
    };
    load();
    const interval = window.setInterval(load, 5000);
    return () => window.clearInterval(interval);
  }, [pipelineId]);

  if (!pipelineId) return null;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-slate-400" />
          <p className="text-sm font-semibold text-white">Pipeline Events</p>
        </div>
        <span className="text-[10px] text-slate-500">
          {entries.length} events
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="mt-3 text-center text-xs text-slate-500">
          Events will appear during generation.
        </p>
      ) : (
        <div className="mt-3 max-h-48 space-y-1 overflow-y-auto">
          {entries
            .slice(-15)
            .reverse()
            .map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
        </div>
      )}
    </Card>
  );
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const time = new Date(entry.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex items-start gap-2 rounded-lg bg-white/[0.01] px-2 py-1.5 text-[10px]">
      <EventIcon type={entry.eventType} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-medium text-slate-300 truncate">
            {entry.message}
          </span>
          <span className="ml-2 flex-shrink-0 text-slate-600">{time}</span>
        </div>
        {entry.stage && (
          <span className="text-slate-500">{formatStage(entry.stage)}</span>
        )}
      </div>
    </div>
  );
}

function EventIcon({ type }: { type: string }) {
  if (type.includes("Completed") || type.includes("completed")) {
    return (
      <CheckCircle className="mt-0.5 h-3 w-3 flex-shrink-0 text-success-400" />
    );
  }
  if (type.includes("Failed") || type.includes("failed")) {
    return <XCircle className="mt-0.5 h-3 w-3 flex-shrink-0 text-error-400" />;
  }
  if (type.includes("Paused") || type.includes("Cancelled")) {
    return <Pause className="mt-0.5 h-3 w-3 flex-shrink-0 text-warning-400" />;
  }
  return <Play className="mt-0.5 h-3 w-3 flex-shrink-0 text-cyan-400" />;
}

function formatStage(stage: string): string {
  return stage
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}
