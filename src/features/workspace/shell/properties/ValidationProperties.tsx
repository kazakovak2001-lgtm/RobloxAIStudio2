import { ReviewSummaryPanel } from "../../components/ReviewSummaryPanel";
import { GenerationHistoryPanel } from "../../components/GenerationHistoryPanel";
import type { PipelineData } from "../types";

interface ValidationPropertiesProps {
  pipelineData?: PipelineData;
}

export default function ValidationProperties({
  pipelineData,
}: ValidationPropertiesProps) {
  const pipelineId = pipelineData?.pipelineId ?? null;

  return (
    <div className="space-y-3 p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        Validation & Review
      </p>
      <ReviewSummaryPanel pipelineId={pipelineId} />
      <GenerationHistoryPanel />
    </div>
  );
}
