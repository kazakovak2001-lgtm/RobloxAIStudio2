import { useEffect, useMemo, useRef, useState } from "react";
import { getSocket } from "../../services/socket";
import type {
  PipelineStreamMessage,
  PipelineState,
  WorkspaceStatus,
} from "./workspace.types";
import type {
  GenerationStartEvent,
  GenerationProgressEvent,
  GenerationCompleteEvent,
  GenerationErrorEvent,
} from "../../../shared/events";

export function usePipelineStream(projectId?: string) {
  const [state, setState] = useState<PipelineState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [events, setEvents] = useState<PipelineStreamMessage[]>([]);
  const connectionRef = useRef<ReturnType<typeof getSocket> | null>(null);

  useEffect(() => {
    const socket = getSocket();
    connectionRef.current = socket;

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  useEffect(() => {
    if (!projectId) return;

    const socket = connectionRef.current;
    if (!socket) return;

    socket.emit("project:join", { projectId });

    // Pipeline started
    const onStarted = (payload: GenerationStartEvent) => {
      setState((prev) => ({
        ...(prev ?? empty(projectId)),
        status: "running",
        startedAt: new Date(payload.startedAt ?? new Date().toISOString()),
      }));
      appendEvent(
        "pipeline.started",
        payload as unknown as Record<string, unknown>,
      );
    };

    // Step started
    const onStepStarted = (payload: GenerationProgressEvent) => {
      setState((prev) => {
        if (!prev) return prev;
        const agent = prev.agents.find((item) => item.id === payload.agentId);
        if (agent) {
          agent.status = "running";
          agent.startedAt = new Date(
            payload.timestamp ?? new Date().toISOString(),
          );
        }
        return { ...prev, currentStep: payload.stepId };
      });
      appendEvent(
        "step.started",
        payload as unknown as Record<string, unknown>,
      );
    };

    // Step completed
    const onStepCompleted = (payload: GenerationProgressEvent) => {
      setState((prev) => {
        if (!prev) return prev;
        const agent = prev.agents.find((item) => item.id === payload.agentId);
        if (agent) {
          agent.status = "completed";
          agent.progress = 100;
          agent.finishedAt = new Date(
            payload.timestamp ?? new Date().toISOString(),
          );
        }
        return prev;
      });
      appendEvent(
        "step.completed",
        payload as unknown as Record<string, unknown>,
      );
    };

    // Pipeline completed
    const onCompleted = (payload: GenerationCompleteEvent) => {
      setState((prev) =>
        prev
          ? {
              ...prev,
              status: "completed",
              finishedAt: new Date(),
              progress: 100,
            }
          : prev,
      );
      appendEvent(
        "pipeline.completed",
        payload as unknown as Record<string, unknown>,
      );
    };

    // Pipeline failed
    const onFailed = (payload: GenerationErrorEvent) => {
      setState((prev) => (prev ? { ...prev, status: "failed" } : prev));
      appendEvent(
        "pipeline.failed",
        payload as unknown as Record<string, unknown>,
      );
    };

    socket.on("pipeline.started", onStarted as never);
    socket.on("step.started", onStepStarted as never);
    socket.on("step.completed", onStepCompleted as never);
    socket.on("pipeline.completed", onCompleted as never);
    socket.on("pipeline.failed", onFailed as never);

    appendEvent("connection", { projectId });

    return () => {
      socket.off("pipeline.started", onStarted as never);
      socket.off("step.started", onStepStarted as never);
      socket.off("step.completed", onStepCompleted as never);
      socket.off("pipeline.completed", onCompleted as never);
      socket.off("pipeline.failed", onFailed as never);
      socket.emit("project:leave", { projectId });
    };
  }, [projectId]);

  const appendEvent = (type: string, data?: Record<string, unknown>) => {
    const message: PipelineStreamMessage = {
      type,
      data,
      timestamp: new Date().toISOString(),
    };
    setEvents((prev) => [...prev.slice(-200), message]);
  };

  const currentAgent = useMemo(
    () => state?.agents.find((item) => item.status === "running"),
    [state?.agents],
  );

  const status: WorkspaceStatus = useMemo(
    () => state?.status ?? "idle",
    [state?.status],
  );

  return { state, isConnected, events, status, currentAgent };
}

function empty(projectId: string): PipelineState {
  return {
    id: `pipeline_${projectId}`,
    projectId,
    status: "idle",
    progress: 0,
    agents: [],
    logs: [],
  };
}
