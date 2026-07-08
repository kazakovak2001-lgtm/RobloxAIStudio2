/**
 * Pipeline stage definitions and state types.
 */

import { randomUUID } from "crypto";

export type StageName =
  | "REQUEST"
  | "REQUIREMENTS"
  | "GAME_DESIGN"
  | "ARCHITECTURE"
  | "ASSET_PLANNING"
  | "LUA_GENERATION"
  | "UI_GENERATION"
  | "VALIDATION"
  | "OPTIMIZATION"
  | "DOCUMENTATION"
  | "EXPORT";
export type PipelineStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "recovering"
  | "paused"
  | "cancelled";
export type StageStatus =
  "pending" | "running" | "completed" | "failed" | "skipped";

export const STAGE_ORDER: StageName[] = [
  "REQUEST",
  "REQUIREMENTS",
  "GAME_DESIGN",
  "ARCHITECTURE",
  "ASSET_PLANNING",
  "LUA_GENERATION",
  "UI_GENERATION",
  "VALIDATION",
  "OPTIMIZATION",
  "DOCUMENTATION",
  "EXPORT",
];

export const STAGE_AGENT_MAP: Record<StageName, string | null> = {
  REQUEST: null,
  REQUIREMENTS: "requirements",
  GAME_DESIGN: "game_designer",
  ARCHITECTURE: "roblox_architect",
  ASSET_PLANNING: "asset_planner",
  LUA_GENERATION: "lua_generator",
  UI_GENERATION: "ui_generator",
  VALIDATION: "tester",
  OPTIMIZATION: "performance",
  DOCUMENTATION: "documentation",
  EXPORT: null,
};

export interface StageRecord {
  name: StageName;
  status: StageStatus;
  agentId: string | null;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  output?: Record<string, unknown>;
  error?: string;
}

export interface PipelineState {
  pipelineId: string;
  projectId: string;
  currentStage: StageName | null;
  completedStages: StageName[];
  failedStages: StageName[];
  stages: StageRecord[];
  status: PipelineStatus;
  startedAt: number;
  finishedAt?: number;
}

export function createPipelineState(projectId: string): PipelineState {
  return {
    pipelineId: `pipeline-${randomUUID().slice(0, 10)}`,
    projectId,
    currentStage: null,
    completedStages: [],
    failedStages: [],
    stages: STAGE_ORDER.map((name) => ({
      name,
      status: "pending",
      agentId: STAGE_AGENT_MAP[name],
    })),
    status: "pending",
    startedAt: Date.now(),
  };
}
