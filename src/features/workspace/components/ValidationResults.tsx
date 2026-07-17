import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Card } from "@/shared/ui/Card";

interface ValidationResultsProps {
  score?: number;
  passed?: boolean;
  errors?: string[];
  warnings?: string[];
}

export function ValidationResults({
  score,
  passed,
  errors = [],
  warnings = [],
}: ValidationResultsProps) {
  if (score === undefined) {
    return (
      <Card>
        <p className="text-sm font-semibold text-white">Validation</p>
        <p className="mt-2 text-xs text-slate-400">
          Results will appear after generation completes.
        </p>
      </Card>
    );
  }

  const status = passed ? "PASS" : errors.length > 0 ? "FAILED" : "WARNING";
  const statusColor =
    status === "PASS"
      ? "text-success-400"
      : status === "WARNING"
        ? "text-warning-400"
        : "text-error-400";
  const Icon =
    status === "PASS"
      ? CheckCircle
      : status === "WARNING"
        ? AlertTriangle
        : XCircle;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Validation Results</p>
        <div className={`flex items-center gap-1 text-xs ${statusColor}`}>
          <Icon className="h-3.5 w-3.5" />
          <span>{status}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="text-3xl font-bold text-white">{score}</div>
        <div className="text-xs text-slate-400">
          /100
          <br />
          quality score
        </div>
      </div>

      <div className="mt-3 h-2 rounded-full bg-slate-800">
        <div
          className={`h-2 rounded-full ${score >= 70 ? "bg-success-500" : score >= 50 ? "bg-warning-500" : "bg-error-500"}`}
          style={{ width: `${score}%` }}
        />
      </div>

      {errors.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-xs font-medium text-error-400">
            Errors ({errors.length})
          </p>
          {errors.slice(0, 3).map((err, i) => (
            <p key={i} className="text-xs text-error-300/70">
              • {err}
            </p>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-xs font-medium text-warning-400">
            Warnings ({warnings.length})
          </p>
          {warnings.slice(0, 3).map((w, i) => (
            <p key={i} className="text-xs text-warning-300/70">
              • {w}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}
