/**
 * workspace/MissionControlPage.tsx
 * Mission Control experience page.
 * Wires usePipelineStream data into the MissionControlShell.
 */
import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "./core";
import { MissionControlShell } from "./shell";
import { usePipelineStream } from "./hooks/usePipelineStream";
import type { PipelineData } from "./shell/types";

const defaultLogs = [
  "[pipeline.started] Workspace initialized.",
  "[planner] Preparing project structure and requirements.",
  "[designer] Building the gameplay and progression plan.",
];

interface MissionControlPageProps {
  projectId?: string;
}

export default function MissionControlPage({
  projectId,
}: MissionControlPageProps) {
  const { setProjectId } = useWorkspace();
  const { state, events, status, isConnected } = usePipelineStream(projectId);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);

  useEffect(() => {
    setProjectId(projectId ?? null);
  }, [projectId, setProjectId]);

  // Track active pipeline ID from stream state
  useEffect(() => {
    if (state?.id) {
      setActivePipelineId(state.id);
    }
  }, [state?.id]);

  const agents = state?.agents ?? [];

  const logs = useMemo(() => {
    const streamLogs = state?.logs ?? [];
    return streamLogs.length ? streamLogs : defaultLogs;
  }, [state?.logs]);

  const totalCost = useMemo(
    () => agents.reduce((sum, agent) => sum + (agent.cost ?? 0), 0),
    [agents],
  );
  const totalTokens = useMemo(
    () => agents.reduce((sum, agent) => sum + (agent.tokens ?? 0), 0),
    [agents],
  );

  const pipelineData: PipelineData = useMemo(
    () => ({
      projectId: projectId ?? "",
      pipelineId: activePipelineId,
      agents,
      status,
      isConnected,
      totalCost,
      totalTokens,
      logs,
      events,
      pipeline: state,
      onPipelineStarted: (id: string) => setActivePipelineId(id),
    }),
    [
      projectId,
      activePipelineId,
      agents,
      status,
      isConnected,
      totalCost,
      totalTokens,
      logs,
      events,
      state,
    ],
  );

  return (
    <MissionControlShell projectId={projectId} pipelineData={pipelineData} />
  );
}
