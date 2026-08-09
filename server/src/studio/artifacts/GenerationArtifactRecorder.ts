import type { TaskNode } from "../../planning/model/TaskGraph";
import {
  ArtifactStore,
  type PipelineArtifact,
  type StageName,
} from "../../pipeline/v2";
import {
  assertPlayableLuaScripts,
  getPlayableLuaIssues,
  normalizeLuaScripts,
  type PlayableLuaScript,
} from "../../types/playableLua";
import { reviewLuaSecurity } from "../../validation/luaSecurityReview";
import {
  buildGenerationValidationReport,
  describeBlockingFailures,
  type UIMaterializationOutcome,
} from "../../validation/generationValidation";
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
  // `tester` is deliberately absent. It emits a checklist of tests whose
  // status is `pending`; stored under `VALIDATION` that reads as a validation
  // result for work that never ran. The VALIDATION artifact is produced
  // deterministically below instead — see PIPELINE-1B.
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
    // Staged, not stored. STUDIO-1A holds that a rejected generation persists
    // no content at all, so nothing may be written until validation has run:
    // partial artifacts under a failed execution id are exactly what a later
    // consumer could mistake for a deliverable package.
    const pending: Array<{
      stage: StageName;
      agent: string | null;
      content: unknown;
    }> = [];
    let luaPresent = false;
    let luaIssues: readonly string[] = [];
    let ui: UIMaterializationOutcome = { status: "not-attempted" };

    for (const node of nodes) {
      const stage = getArtifactStage(node.agent);
      if (!stage || node.status !== "done" || node.output === undefined)
        continue;

      if (stage === "LUA_GENERATION") {
        luaPresent = true;
        let scripts: PlayableLuaScript[] | undefined;
        try {
          scripts = normalizeLuaScripts(node.output);
        } catch (error) {
          // Output too malformed to read as scripts at all. The messages are
          // the contract's own static text, never model content.
          luaIssues = [
            error instanceof Error
              ? error.message
              : "Lua generation output could not be read",
          ];
        }
        if (!scripts) continue;

        luaIssues = getPlayableLuaIssues(scripts);

        // PIPELINE-1B. The contract used to throw from here. It no longer
        // does, so the remaining stages are still examined and their findings
        // reach the report; unplayable Lua is simply never staged, because it
        // must not reach delivery.
        if (luaIssues.length > 0) continue;

        const content = normalizeLuaArtifactContent(node.output);
        pending.push({ stage, agent: node.agent, content });

        // SECREVIEW-1. The playability contract already ran and accepted this
        // Lua, so the code is known-runnable; what nothing has asked is whether
        // it is exploitable. Recorded as its own artifact rather than gating
        // delivery: the review is advisory in this slice, and a reviewer that
        // could fail a generation on its own false positive would be worse than
        // the gap it closes.
        pending.push({
          stage: "SECURITY_REVIEW",
          agent: null,
          content: reviewLuaSecurity(
            (content as { scripts: PlayableLuaScript[] }).scripts,
          ),
        });
        continue;
      }

      if (stage === "UI_GENERATION") {
        const built = buildUIArtifactContent(node.output);
        ui = built.outcome;
        pending.push({ stage, agent: node.agent, content: built.content });
        continue;
      }

      pending.push({ stage, agent: node.agent, content: node.output });
    }

    const report = buildGenerationValidationReport({
      luaPresent,
      luaIssues,
      ui,
    });

    if (!report.passed) {
      // The report is written even here — that is the whole point, since a
      // rejected run previously left nothing saying what was wrong. The staged
      // content is discarded rather than persisted alongside it: a rejected
      // generation must leave no package a later consumer could deliver.
      await this.artifactStore.store(executionId, "VALIDATION", null, report);
      throw new Error(
        `Generation failed deterministic validation — ${describeBlockingFailures(report)}`,
      );
    }

    const recorded: PipelineArtifact[] = [];
    for (const artifact of pending) {
      recorded.push(
        await this.artifactStore.store(
          executionId,
          artifact.stage,
          artifact.agent,
          artifact.content,
        ),
      );
    }

    // Stored last so the stage artifacts keep the order they were produced in.
    recorded.push(
      await this.artifactStore.store(executionId, "VALIDATION", null, report),
    );

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
  return buildUIArtifactContent(output).content;
}

/**
 * The same conversion, with the outcome kept rather than discarded.
 *
 * PIPELINE-1B. This function always knew whether the design could be built;
 * before, a failure went to `console.warn` and nowhere else, so the artifact
 * recorded a silent degrade and nothing durable said the UI had not
 * materialized. The reason now travels to the validation report.
 */
export function buildUIArtifactContent(output: unknown): {
  content: Record<string, unknown>;
  outcome: UIMaterializationOutcome;
} {
  if (!isRecord(output)) {
    throw new Error("UI generator output must be an object");
  }

  let tree: MaterializableUITree;
  try {
    tree = new UIInstanceTreeBuilder().build(output.uiDesign);
  } catch (error) {
    // Static message only — the design is model-derived and must not be
    // interpolated into a log sink.
    const reason =
      error instanceof Error ? error.message.replace(/[\r\n]/g, "") : "unknown";
    console.warn(
      "[GenerationArtifactRecorder] UI design is not materializable; recording it without a schema version so delivery falls back to the legacy path:",
      reason,
    );
    return { content: output, outcome: { status: "failed", reason } };
  }

  return {
    content: {
      ...output,
      schemaVersion: tree.schemaVersion,
      screens: tree.screens,
    },
    outcome: { status: "built" },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const GENERATION_ARTIFACT_STAGE_MAP = AGENT_STAGE_MAP;
