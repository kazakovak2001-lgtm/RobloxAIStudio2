import { CostMonitor } from "../../components/CostMonitor";
import { TokenUsage } from "../../components/TokenUsage";
import { ProjectSummary } from "../../components/ProjectSummary";
import type { PipelineData } from "../types";

interface DefaultPropertiesProps {
  pipelineData?: PipelineData;
}

export default function DefaultProperties({
  pipelineData,
}: DefaultPropertiesProps) {
  const cost = pipelineData?.totalCost ?? 0;
  const tokens = pipelineData?.totalTokens ?? 0;
  const agents = pipelineData?.agents ?? [];
  const pipeline = pipelineData?.pipeline;

  const runTimeSeconds = pipeline?.startedAt
    ? Math.round((Date.now() - pipeline.startedAt.getTime()) / 1000)
    : 0;

  return (
    <div className="space-y-3 p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        Overview
      </p>
      <ProjectSummary
        agents={agents.length}
        runTimeSeconds={runTimeSeconds}
        steps={agents.length}
        retries={0}
        tokens={tokens}
        cost={cost}
      />
      <CostMonitor cost={cost} estimatedRemaining={Math.max(0, 2.5 - cost)} />
      <TokenUsage
        promptTokens={Math.round(tokens * 0.6)}
        completionTokens={Math.round(tokens * 0.4)}
        totalTokens={tokens}
      />
    </div>
  );
}
