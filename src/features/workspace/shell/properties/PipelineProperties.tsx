import { CostMonitor } from "../../components/CostMonitor";
import { TokenUsage } from "../../components/TokenUsage";
import type { PipelineData } from "../types";

interface PipelinePropertiesProps {
  pipelineData?: PipelineData;
}

export default function PipelineProperties({
  pipelineData,
}: PipelinePropertiesProps) {
  const cost = pipelineData?.totalCost ?? 0;
  const tokens = pipelineData?.totalTokens ?? 0;

  return (
    <div className="space-y-3 p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        Pipeline
      </p>
      <CostMonitor cost={cost} estimatedRemaining={Math.max(0, 2.5 - cost)} />
      <TokenUsage
        promptTokens={Math.round(tokens * 0.6)}
        completionTokens={Math.round(tokens * 0.4)}
        totalTokens={tokens}
      />
    </div>
  );
}
