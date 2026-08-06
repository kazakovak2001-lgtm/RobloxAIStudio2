import type { TaskNode } from "../../planning/model/TaskGraph";
import {
  ArtifactStore,
  type PipelineArtifact,
  type StageName,
} from "../../pipeline/v2";
import {
  assertPlayableLuaScripts,
  normalizeLuaScripts,
  type PlayableLuaScript,
} from "../../types/playableLua";

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

interface StudioLuaArtifactContent {
  scripts: PlayableLuaScript[];
}

/**
 * Stores real outputs from the canonical PlanExecutor under the durable
 * generation execution ID. Unmapped or incomplete tasks are intentionally
 * skipped instead of being converted into synthetic Studio artifacts.
 */
export class GenerationArtifactRecorder {
  constructor(private readonly artifactStore: ArtifactStore) {}

  async record(
    executionId: string,
    nodes: readonly TaskNode[],
  ): Promise<PipelineArtifact[]> {
    const recorded: PipelineArtifact[] = [];

    for (const node of nodes) {
      const stage = getArtifactStage(node.agent);
      if (!stage || node.status !== "done" || node.output === undefined)
        continue;

      const content =
        stage === "LUA_GENERATION"
          ? normalizeLuaArtifactContent(node.output)
          : node.output;

      recorded.push(
        await this.artifactStore.store(executionId, stage, node.agent, content),
      );
    }

    return recorded;
  }
}

export function getArtifactStage(agent: string): StageName | undefined {
  return AGENT_STAGE_MAP[agent];
}

export function normalizeLuaArtifactContent(
  output: unknown,
): StudioLuaArtifactContent | Record<string, unknown> {
  if (!isRecord(output)) {
    throw new Error("Lua generator output must be an object");
  }

  const scripts = normalizeLuaScripts(output);
  assertPlayableLuaScripts(scripts);
  return Array.isArray(output.scripts) ? output : { scripts };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const GENERATION_ARTIFACT_STAGE_MAP = AGENT_STAGE_MAP;
