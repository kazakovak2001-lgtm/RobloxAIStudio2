export type WorkspaceStatus = "idle" | "running" | "paused" | "retrying" | "completed" | "cancelled" | "failed";

export interface AgentState {
  id: string;
  name: string;
  status: WorkspaceStatus;
  progress: number;
  model?: string;
  provider?: string;
  startedAt?: Date;
  finishedAt?: Date;
  duration?: number;
  tokens?: number;
  cost?: number;
}

export interface PipelineState {
  id: string;
  projectId: string;
  status: WorkspaceStatus;
  currentStep?: string;
  progress: number;
  agents: AgentState[];
  logs: string[];
  startedAt?: Date;
  finishedAt?: Date;
  estimatedRemaining?: number;
}

export interface PipelineStreamMessage {
  type: string;
  data?: Record<string, unknown>;
  timestamp?: string;
}
