import { CheckCircle, Circle, ArrowRight } from "lucide-react";
import { Card } from "@/shared/ui/Card";

type StageStatus = "pending" | "active" | "done" | "failed";

interface WorkflowStage {
  label: string;
  status: StageStatus;
}

interface PublishWorkflowProps {
  pipelineStatus: string;
  hasSynced?: boolean;
}

export function PublishWorkflow({
  pipelineStatus,
  hasSynced = false,
}: PublishWorkflowProps) {
  const isGenerated = pipelineStatus === "completed";

  const stages: WorkflowStage[] = [
    {
      label: "Generate",
      status:
        pipelineStatus === "running"
          ? "active"
          : isGenerated
            ? "done"
            : "pending",
    },
    { label: "Validate", status: isGenerated ? "done" : "pending" },
    {
      label: "Sync",
      status:
        isGenerated && hasSynced ? "done" : isGenerated ? "active" : "pending",
    },
    { label: "Test", status: hasSynced ? "active" : "pending" },
    { label: "Publish", status: "pending" },
  ];

  return (
    <Card>
      <p className="text-sm font-semibold text-white">Publish Workflow</p>
      <div className="mt-4 flex items-center gap-1">
        {stages.map((stage, i) => (
          <div key={stage.label} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              {stage.status === "done" ? (
                <CheckCircle className="h-4 w-4 text-green-400" />
              ) : (
                <Circle
                  className={`h-4 w-4 ${stage.status === "active" ? "text-brand-400" : "text-slate-600"}`}
                />
              )}
              <span
                className={`text-xs ${stage.status === "done" ? "text-green-400" : stage.status === "active" ? "text-brand-300" : "text-slate-500"}`}
              >
                {stage.label}
              </span>
            </div>
            {i < stages.length - 1 && (
              <ArrowRight className="mx-1 h-3 w-3 flex-shrink-0 text-slate-600" />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
