import { useEffect, useMemo, useRef, useState } from "react";
import { getSocket } from "../../services/socket";
import type { PipelineStreamMessage, PipelineState, WorkspaceStatus } from "./workspace.types";

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

    const handlers = [
      { event: "pipeline.started", handler: (payload: unknown) => {
        const data = payload as Record<string, unknown>;
        setState((prev) => ({
          ...(prev ?? empty(projectId)),
          status: "running",
          startedAt: new Date((data.startedAt as string) ?? new Date().toISOString()),
        }));
        appendEvent("pipeline.started", data);
      }},
      { event: "step.started", handler: (payload: unknown) => {
        const data = payload as Record<string, unknown>;
        setState((prev) => {
          if (!prev) return prev;
          const agent = prev.agents.find((item) => item.id === (data.agentId as string));
          if (agent) {
            agent.status = "running";
            agent.startedAt = new Date((data.startedAt as string) ?? new Date().toISOString());
          }
          return { ...prev, currentStep: data.stepId as string | undefined };
        });
        appendEvent("step.started", data);
      }},
      { event: "step.completed", handler: (payload: unknown) => {
        const data = payload as Record<string, unknown>;
        setState((prev) => {
          if (!prev) return prev;
          const agent = prev.agents.find((item) => item.id === (data.agentId as string));
          if (agent) {
            agent.status = "completed";
            agent.progress = 100;
            agent.finishedAt = new Date((data.finishedAt as string) ?? new Date().toISOString());
          }
          return prev;
        });
        appendEvent("step.completed", data);
      }},
      { event: "pipeline.progress", handler: (payload: unknown) => {
        const data = payload as Record<string, unknown>;
        setState((prev) => (prev ? { ...prev, progress: Number(data.progress ?? prev.progress) } : prev));
        appendEvent("pipeline.progress", data);
      }},
      { event: "pipeline.completed", handler: (payload: unknown) => {
        const data = payload as Record<string, unknown>;
        setState((prev) => (prev ? { ...prev, status: "completed", finishedAt: new Date(), progress: 100 } : prev));
        appendEvent("pipeline.completed", data);
      }},
      { event: "pipeline.failed", handler: (payload: unknown) => {
        const data = payload as Record<string, unknown>;
        setState((prev) => (prev ? { ...prev, status: "failed" } : prev));
        appendEvent("pipeline.failed", data);
      }},
      { event: "ai.streaming", handler: (payload: unknown) => {
        const data = payload as Record<string, unknown>;
        appendEvent("ai.streaming", data);
      }},
    ];

    for (const item of handlers) {
      socket.on(item.event, item.handler as never);
    }

    appendEvent("connection", { projectId });

    return () => {
      for (const item of handlers) {
        socket.off(item.event, item.handler as never);
      }
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

  const currentAgent = useMemo(() => state?.agents.find((item) => item.status === "running"), [state?.agents]);

  const status: WorkspaceStatus = useMemo(() => state?.status ?? "idle", [state?.status]);

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
