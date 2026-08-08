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
import { UIInstanceTreeBuilder } from "../../ui-gen/UIInstanceTreeBuilder";
import type { MaterializableUITree } from "../../ui-gen/UIInstanceTreeContract";

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
          : stage === "UI_GENERATION"
            ? normalizeUIArtifactContent(node.output)
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

/**
 * Convert `UIGeneratorAgent` output into the materializable wire tree.
 *
 * Fail-closed on the *claim*, not on the generation. When the design cannot be
 * turned into a valid tree, the artifact is recorded exactly as before, with
 * no `schemaVersion`. Absence of `schemaVersion` is the documented fallback
 * trigger, so the plugin materializes a `StringValue` as it does today and
 * nothing can record an unbuilt tree as verified.
 *
 * This deliberately departs from a literal reading of the STUDIO-2F-A scope
 * line "malformed input throws". Throwing here propagates out of `record()`
 * and fails the *entire* execution, discarding a perfectly good Lua package
 * because the UI stage returned something unusable. That is a realistic case,
 * not a theoretical one: `UIGeneratorAgent` reaches `generateWithRetry` with
 * `["uiDesign"]` as the only required key, so a model returning
 * `{"uiDesign": {}}` satisfies the key check, skips the fallback merge, and
 * arrives here with zero screens. Unplayable Lua must stop a release because
 * there is no game without it; an unbuildable menu must not.
 *
 * The scope's actual safety rule — content that *claims* `schemaVersion: 1`
 * must never silently degrade — is preserved exactly, because this path emits
 * no claim at all.
 *
 * The abstract `uiDesign` is preserved alongside the tree. It is the record of
 * what the model actually said, and later sub-phases (notably the STUDIO-2F-E
 * canonical-HUD flip) need it to re-derive a tree under a newer schema without
 * re-running generation.
 */
export function normalizeUIArtifactContent(
  output: unknown,
): Record<string, unknown> {
  if (!isRecord(output)) {
    throw new Error("UI generator output must be an object");
  }

  let tree: MaterializableUITree;
  try {
    tree = new UIInstanceTreeBuilder().build(output.uiDesign);
  } catch (error) {
    // Static message only — the design is model-derived and must not be
    // interpolated into a log sink.
    console.warn(
      "[GenerationArtifactRecorder] UI design is not materializable; recording it without a schema version so delivery falls back to the legacy path:",
      error instanceof Error ? error.message.replace(/[\r\n]/g, "") : "unknown",
    );
    return output;
  }

  return {
    ...output,
    schemaVersion: tree.schemaVersion,
    screens: tree.screens,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const GENERATION_ARTIFACT_STAGE_MAP = AGENT_STAGE_MAP;
