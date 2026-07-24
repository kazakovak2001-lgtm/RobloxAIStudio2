import type { TaskNode } from "../../planning/model/TaskGraph";
import {
  ArtifactStore,
  type PipelineArtifact,
  type StageName,
} from "../../pipeline/v2";

const AGENT_STAGE_MAP: Readonly<Record<string, StageName>> = {
  requirements: "REQUIREMENTS",
  planner: "REQUEST",
  game_designer: "GAME_DESIGN",
  roblox_architect: "ARCHITECTURE",
  asset_planner: "ASSET_PLANNING",
  lua_generator: "LUA_GENERATION",
  ui_generator: "UI_GENERATION",
  tester: "VALIDATION",
  performance: "OPTIMIZATION",
  documentation: "DOCUMENTATION",
  orchestrator: "EXPORT",
};

/**
 * Stores real outputs from the canonical PlanExecutor under the durable
 * generation execution ID. Unmapped or incomplete tasks are intentionally
 * skipped instead of being converted into synthetic Studio artifacts.
 */
export class GenerationArtifactRecorder {
  constructor(private readonly artifactStore: ArtifactStore) {}

  record(executionId: string, nodes: readonly TaskNode[]): PipelineArtifact[] {
    const recorded: PipelineArtifact[] = [];

    for (const node of nodes) {
      const stage = getArtifactStage(node.agent);
      if (!stage || node.status !== "done" || node.output === undefined)
        continue;

      recorded.push(
        this.artifactStore.store(executionId, stage, node.agent, node.output),
      );
    }

    return recorded;
  }
}

export function getArtifactStage(agent: string): StageName | undefined {
  return AGENT_STAGE_MAP[agent];
}

export const GENERATION_ARTIFACT_STAGE_MAP = AGENT_STAGE_MAP;
