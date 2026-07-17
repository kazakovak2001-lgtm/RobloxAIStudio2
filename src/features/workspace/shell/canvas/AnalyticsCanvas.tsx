import { MetricsPanel } from "../../components/MetricsPanel";
import { CostMonitor } from "../../components/CostMonitor";
import { TokenUsage } from "../../components/TokenUsage";
import type { PipelineData } from "../types";

interface AnalyticsCanvasProps {
  pipelineData?: PipelineData;
}

export default function AnalyticsCanvas({
  pipelineData,
}: AnalyticsCanvasProps) {
  const cost = pipelineData?.totalCost ?? 0;
  const tokens = pipelineData?.totalTokens ?? 0;
  const pipelineId = pipelineData?.pipelineId ?? null;

  return (
    <div className="space-y-4 p-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <CostMonitor cost={cost} estimatedRemaining={Math.max(0, 2.5 - cost)} />
        <TokenUsage
          promptTokens={Math.round(tokens * 0.6)}
          completionTokens={Math.round(tokens * 0.4)}
          totalTokens={tokens}
        />
      </div>
      <MetricsPanel pipelineId={pipelineId} />
    </div>
  );
}
