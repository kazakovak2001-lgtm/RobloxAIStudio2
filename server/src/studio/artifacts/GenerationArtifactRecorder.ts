import type { TaskNode } from "../../planning/model/TaskGraph";
import {
  ArtifactStore,
  deterministicProducer,
  type ArtifactDependency,
  type ArtifactProducer,
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
import { buildWorldModel, type WorldModel } from "../../validation/worldModel";
import {
  buildGameDna,
  buildGameDnaReport,
  GAME_DNA_SCHEMA_VERSION,
  type GameDnaReport,
  type PriorGeneration,
} from "../../validation/gameDna";
import { crossValidateWorld } from "../../validation/worldCrossValidation";
import { buildWorldScene } from "../../validation/worldSceneBuilder";
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
    projectId: string,
  ): Promise<PipelineArtifact[]> {
    // Staged, not stored. STUDIO-1A holds that a rejected generation persists
    // no content at all, so nothing may be written until validation has run:
    // partial artifacts under a failed execution id are exactly what a later
    // consumer could mistake for a deliverable package.
    //
    // ARTIFACT-CONTRACT-2. Lineage is resolved during the commit loop rather
    // than while staging, because a dependency must name an artifact that is
    // already durably accepted. `dependsOn` lists the upstream stages this
    // entry was derived from; the ids and hashes are filled in from what has
    // actually been stored by the time it is written.
    const pending: Array<{
      stage: StageName;
      agent: string | null;
      content: unknown;
      producer?: ArtifactProducer;
      dependsOn?: readonly StageName[];
    }> = [];
    let luaPresent = false;
    let luaIssues: readonly string[] = [];
    let ui: UIMaterializationOutcome = { status: "not-attempted" };
    let luaScripts: readonly PlayableLuaScript[] = [];
    let gameDesign: unknown;
    let architecture: unknown;

    for (const node of nodes) {
      const stage = getArtifactStage(node.agent);
      if (!stage || node.status !== "done" || node.output === undefined)
        continue;

      // WORLD-1A. Kept so the world model can be derived from claims these
      // stages already made, rather than from an agent invented to make them.
      if (stage === "GAME_DESIGN") gameDesign = node.output;
      if (stage === "ARCHITECTURE") architecture = node.output;

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
        luaScripts = scripts;
        pending.push({ stage, agent: node.agent, content });

        // SECREVIEW-1. The playability contract already ran and accepted this
        // Lua, so the code is known-runnable; what nothing has asked is whether
        // it is exploitable. Recorded as its own artifact rather than gating
        // delivery: the review is advisory in this slice, and a reviewer that
        // could fail a generation on its own false positive would be worse than
        // the gap it closes.
        // Reviewed from the normalized scripts, not by re-reading `content`:
        // when the output already carries a `scripts` array it is returned
        // unchanged, so casting it back would hand the reviewer the raw array
        // rather than the normalized one.
        pending.push({
          stage: "SECURITY_REVIEW",
          agent: null,
          content: reviewLuaSecurity(scripts),
          producer: deterministicProducer("lua-security-review"),
          // Binds to the exact Lua it read. A report that outlives the code it
          // describes must be distinguishable from one that still applies.
          dependsOn: ["LUA_GENERATION"],
        });
        continue;
      }

      if (stage === "UI_GENERATION") {
        try {
          const built = buildUIArtifactContent(node.output);
          ui = built.outcome;
          pending.push({ stage, agent: node.agent, content: built.content });
        } catch (error) {
          // UI materialization is advisory, so output too malformed to read
          // must not abort the run — that would leave no report at all, which
          // is the gap this stage exists to close.
          ui = {
            status: "failed",
            reason:
              error instanceof Error
                ? error.message.replace(/[\r\n]/g, "")
                : "UI generation output could not be read",
          };
        }
        continue;
      }

      pending.push({ stage, agent: node.agent, content: node.output });
    }

    // WORLD-1A. The model is derived and recorded whether or not the Lua can
    // be checked against it; the cross-artifact comparison only runs when
    // there is Lua to compare, and says so when there is not.
    const world = buildWorldModel({ gameDesign, architecture });
    // WORLD-1B. The scene travels with the model rather than as a second
    // artifact, so a plugin that cannot materialize it still records the model
    // as inert metadata and nobody claims a world was built.
    pending.push({
      stage: "WORLD_MODEL",
      agent: null,
      content: { ...world, scene: buildWorldScene(world) },
      producer: deterministicProducer("world-model"),
      dependsOn: ["GAME_DESIGN", "ARCHITECTURE"],
    });

    // NOVELTY-1. The first thing that compares this generation to the ones
    // before it rather than to its own spec. Advisory: nothing below reads it
    // to make a decision, and a generation is never failed or altered for
    // resembling an earlier one — that is NOVELTY-2's question.
    pending.push({
      stage: "GAME_DNA",
      agent: null,
      content: this.buildDnaReport(executionId, projectId, world),
      producer: deterministicProducer("game-dna"),
      dependsOn: ["WORLD_MODEL"],
    });

    const report = buildGenerationValidationReport({
      luaPresent,
      luaIssues,
      ui,
      world:
        luaScripts.length > 0
          ? crossValidateWorld(world, luaScripts)
          : undefined,
    });

    if (!report.passed) {
      // The report is written even here — that is the whole point, since a
      // rejected run previously left nothing saying what was wrong. The staged
      // content is discarded rather than persisted alongside it: a rejected
      // generation must leave no package a later consumer could deliver.
      //
      // It carries no dependencies, and that is the truthful shape: nothing
      // was committed, so there is no artifact for the report to bind to. A
      // lineage edge here would point at content that does not exist.
      await this.artifactStore.store(executionId, "VALIDATION", null, report, {
        projectId,
        producer: deterministicProducer("generation-validation"),
      });
      throw new Error(
        `Generation failed deterministic validation — ${describeBlockingFailures(report)}`,
      );
    }

    const recorded: PipelineArtifact[] = [];
    const committed = new Map<StageName, PipelineArtifact>();
    const lineage = (stages?: readonly StageName[]): ArtifactDependency[] =>
      (stages ?? [])
        .map((stage) => committed.get(stage))
        .filter((artifact): artifact is PipelineArtifact => !!artifact)
        .map((artifact) => ArtifactStore.dependencyOn(artifact));

    for (const artifact of pending) {
      const stored = await this.artifactStore.store(
        executionId,
        artifact.stage,
        artifact.agent,
        artifact.content,
        {
          projectId,
          producer: artifact.producer,
          dependencies: lineage(artifact.dependsOn),
        },
      );
      recorded.push(stored);
      committed.set(artifact.stage, stored);
    }

    // Stored last so the stage artifacts keep the order they were produced in,
    // and so the report can bind to every artifact it actually checked.
    recorded.push(
      await this.artifactStore.store(executionId, "VALIDATION", null, report, {
        projectId,
        producer: deterministicProducer("generation-validation"),
        dependencies: lineage([
          "LUA_GENERATION",
          "UI_GENERATION",
          "WORLD_MODEL",
        ]),
      }),
    );

    return recorded;
  }

  /**
   * Compare this generation's structure against the project's earlier ones.
   *
   * Prior generations are read from the artifact store, which reads through
   * the storage provider, so this survives a restart. The mechanism it sits
   * beside — `gameDiversityEngine` — keeps its history in a module-level
   * `Map`, so after a restart every generation looks new to it again; that is
   * exactly the shape this must not repeat.
   *
   * Never throws. The report is advisory, and a generation that already passed
   * deterministic validation must not be lost because a comparison failed.
   */
  private buildDnaReport(
    executionId: string,
    projectId: string,
    world: WorldModel,
  ): GameDnaReport {
    const dna = buildGameDna(world);
    try {
      // Counted from world models rather than from DNA artifacts: a project
      // generated before this stage existed has real prior generations and
      // must report `prior-without-dna`, not read as having no history.
      const priorsFound = new Set(
        this.artifactStore
          .getProjectStageArtifacts(projectId, "WORLD_MODEL")
          .map((artifact) => artifact.pipelineId)
          .filter((pipelineId) => pipelineId !== executionId),
      ).size;

      const priors = this.artifactStore
        .getProjectStageArtifacts(projectId, "GAME_DNA")
        .filter((artifact) => artifact.pipelineId !== executionId)
        .map(readPriorGeneration)
        .filter((prior): prior is PriorGeneration => prior !== null);

      return buildGameDnaReport({ dna, priorsFound, priors });
    } catch {
      // A comparison that could not run reports as one that did not run.
      return buildGameDnaReport({ dna, priorsFound: 0, priors: [] });
    }
  }
}

/**
 * Read one prior generation's DNA out of a stored artifact.
 *
 * Defensive because the content is durable data that may have been written by
 * an older schema version. A prior that cannot be read is not silently
 * dropped: it stays counted in `priorsFound` and is simply not comparable,
 * which is what keeps `prior-without-dna` reachable rather than decorative.
 */
function readPriorGeneration(
  artifact: PipelineArtifact,
): PriorGeneration | null {
  const content = artifact.content as Partial<GameDnaReport> | null;
  if (!content || typeof content !== "object") return null;
  if (typeof content.fingerprint !== "string") return null;
  if (!content.dna || typeof content.dna !== "object") return null;
  if (content.dna.schemaVersion !== GAME_DNA_SCHEMA_VERSION) return null;
  return {
    executionId: artifact.pipelineId,
    fingerprint: content.fingerprint,
    dna: content.dna,
  };
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
