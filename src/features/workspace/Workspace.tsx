import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { AppLayout } from "../../layouts/AppLayout";
import { useToast } from "../../components/ui/Toast";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { AgentBoard } from "./components/AgentBoard";
import { LiveConsole } from "./components/LiveConsole";
import { CostMonitor } from "./components/CostMonitor";
import { TokenUsage } from "./components/TokenUsage";
import { ProjectSummary } from "./components/ProjectSummary";
import { ActivityFeed } from "./components/ActivityFeed";
import { GenerateButton } from "./components/GenerateButton";
import { GenerationStatusPanel } from "./components/GenerationStatusPanel";
import { GenerationHistoryPanel } from "./components/GenerationHistoryPanel";
import { ArtifactExplorer } from "./components/ArtifactExplorer";
import { ExportPreview } from "./components/ExportPreview";
import { ReviewSummaryPanel } from "./components/ReviewSummaryPanel";
import { ValidationResults } from "./components/ValidationResults";
import { PipelineStatusBar } from "./components/PipelineStatusBar";
import { PipelineStatusViewer } from "./components/PipelineStatusViewer";
import { StudioBridgePanel } from "./components/StudioBridgePanel";
import { ProtocolMonitor } from "./components/ProtocolMonitor";
import { GameArchitectPanel } from "./components/GameArchitectPanel";
import { MetricsPanel } from "./components/MetricsPanel";
import { AuditLogViewer } from "./components/AuditLogViewer";
import { PipelineView } from "./PipelineView";
import { usePipelineStream } from "./usePipelineStream";
import { Loader } from "../../components/ui/Loader";
import {
  getArtifacts,
  getReviewSummary,
  type ArtifactSummary,
  type ReviewSummary,
} from "../../services/conceptApi";

const defaultLogs = [
  "[pipeline.started] Workspace initialized.",
  "[planner] Preparing project structure and requirements.",
  "[designer] Building the gameplay and progression plan.",
];

export default function WorkspacePage() {
  const { id } = useParams();
  const { state, events, status, isConnected } = usePipelineStream(id);
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [artifactList, setArtifactList] = useState<ArtifactSummary[]>([]);
  const [reviewData, setReviewData] = useState<ReviewSummary | null>(null);
  const [reviewRefresh, setReviewRefresh] = useState(0);

  const agents = state?.agents ?? [];
  const logs = useMemo(() => {
    const streamLogs = state?.logs ?? [];
    return streamLogs.length ? streamLogs : defaultLogs;
  }, [state?.logs]);
  const cost = useMemo(
    () => state?.agents.reduce((sum, item) => (item.cost ?? 0) + sum, 0) ?? 0,
    [state?.agents],
  );
  const tokens = useMemo(
    () => state?.agents.reduce((sum, item) => (item.tokens ?? 0) + sum, 0) ?? 0,
    [state?.agents],
  );
  const steps = useMemo(
    () => state?.agents.length ?? 0,
    [state?.agents.length],
  );
  const retries = 0;

  const refreshReviewData = useCallback(async () => {
    if (!activePipelineId) return;
    const [artifactsRes, reviewRes] = await Promise.all([
      getArtifacts(activePipelineId),
      getReviewSummary(activePipelineId),
    ]);
    if (artifactsRes.success && artifactsRes.data) {
      setArtifactList(artifactsRes.data);
    }
    if (reviewRes.success && reviewRes.data) {
      setReviewData(reviewRes.data);
    }
    setReviewRefresh((prev) => prev + 1);
  }, [activePipelineId]);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 250);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!status) return;
    if (status === "running") {
      toast({
        variant: "info",
        title: "Pipeline live",
        description: "The workspace is receiving SSE updates.",
      });
    }
    if (status === "completed") {
      toast({
        variant: "success",
        title: "Pipeline complete",
        description: "All agents finished successfully.",
      });
    }
    if (status === "failed") {
      toast({
        variant: "error",
        title: "Pipeline failed",
        description: "The pipeline hit an error state.",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <AppLayout withSidebar>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-brand-300">
              Workspace
            </p>
            <h1 className="text-3xl font-semibold text-white">
              Live AI workspace
            </h1>
            <p className="mt-2 text-slate-400">
              Realtime pipeline and agent observability for Roblox AI Studio.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`h-2.5 w-2.5 rounded-full ${isConnected ? "bg-emerald-400" : "bg-slate-500"}`}
            />
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {status}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-[50vh] items-center justify-center rounded-3xl border border-white/10 bg-slate-900/60 p-10">
            <Loader label="Preparing workspace" size="lg" />
          </div>
        ) : (
          <ErrorBoundary>
            <div className="grid gap-4 xl:grid-cols-[1fr_1.15fr_0.95fr]">
              <div className="space-y-4">
                <GenerateButton
                  projectId={id ?? ""}
                  pipelineStatus={status}
                  onStarted={(execId) => {
                    setActivePipelineId(execId);
                    toast({
                      variant: "info",
                      title: "Generation started",
                      description: `Execution: ${execId}`,
                    });
                  }}
                  onError={(err) =>
                    toast({
                      variant: "error",
                      title: "Generation failed",
                      description: err,
                    })
                  }
                />
                <GenerationStatusPanel
                  pipelineId={activePipelineId}
                  onCompleted={async () => {
                    setHistoryRefresh((prev) => prev + 1);
                    await refreshReviewData();
                    toast({
                      variant: "success",
                      title: "Generation complete",
                      description: "All pipeline stages finished.",
                    });
                  }}
                  onFailed={(err) =>
                    toast({
                      variant: "error",
                      title: "Pipeline failed",
                      description: err,
                    })
                  }
                />
                <PipelineStatusBar pipeline={state} status={status} />
                <PipelineStatusViewer pipeline={state} status={status} />
                <AgentBoard agents={agents} />
                <CostMonitor
                  cost={cost}
                  estimatedRemaining={Math.max(0, 2.5 - cost)}
                />
                <TokenUsage
                  promptTokens={Math.round(tokens * 0.6)}
                  completionTokens={Math.round(tokens * 0.4)}
                  totalTokens={tokens}
                />
                <MetricsPanel pipelineId={activePipelineId} />
              </div>
              <div className="space-y-4">
                <PipelineView pipeline={state} status={status} />
                <LiveConsole logs={logs} />
                <GameArchitectPanel />
                <ArtifactExplorer
                  pipelineId={activePipelineId}
                  onReviewChange={refreshReviewData}
                />
                <ExportPreview
                  artifacts={artifactList}
                  reviewSummary={reviewData}
                />
              </div>
              <div className="space-y-4">
                <ReviewSummaryPanel
                  pipelineId={activePipelineId}
                  refreshTrigger={reviewRefresh}
                />
                <ActivityFeed events={events} />
                <AuditLogViewer pipelineId={activePipelineId} />
                <ValidationResults />
                <GenerationHistoryPanel refreshTrigger={historyRefresh} />
                <StudioBridgePanel projectId={id ?? ""} status={status} />
                <ProtocolMonitor isConnected={isConnected} />
                <ProjectSummary
                  agents={agents.length}
                  runTimeSeconds={
                    state?.startedAt
                      ? Math.round(
                          (Date.now() - state.startedAt.getTime()) / 1000,
                        )
                      : 0
                  }
                  steps={steps}
                  retries={retries}
                  tokens={tokens}
                  cost={cost}
                />
              </div>
            </div>
          </ErrorBoundary>
        )}
      </div>
    </AppLayout>
  );
}
