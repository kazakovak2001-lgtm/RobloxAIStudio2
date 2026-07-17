/**
 * workspace/shell/types.ts
 * Shared types for the Mission Control shell components.
 */
import type {
  AgentState,
  PipelineState,
  PipelineStreamMessage,
  WorkspaceStatus,
} from "../types";

/** Pipeline data passed from MissionControlPage to shell components */
export interface PipelineData {
  projectId: string;
  pipelineId: string | null;
  agents: AgentState[];
  status: WorkspaceStatus | null;
  isConnected: boolean;
  // Derived data for properties panels
  totalCost: number;
  totalTokens: number;
  // AI Command Center data
  logs: string[];
  events: PipelineStreamMessage[];
  pipeline: PipelineState | null;
  // Callbacks for child-to-parent communication
  onPipelineStarted?: (pipelineId: string) => void;
}
