import type { TaskNode } from "../../planning/model/TaskGraph";
import {
  ArtifactStore,
  STAGE_ORDER,
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
import {
  buildAssetPlan,
  type AssetPlanResult,
} from "../../validation/assetPlan";
import { buildWorldModel, type WorldModel } from "../../validation/worldModel";
import {
  buildGameDna,
  buildGameDnaReport,
  decodeGameDna,
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
import {
  LEGACY_WORLD_RUNTIME_MODE,
  type WorldRuntimeMode,
} from "../../types/worldRuntimeMode";

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

/**
 * GEN-ARTIFACT-INTEGRITY-1. Durable content for the `LUA_GENERATION` stage.
 *
 * `generationMode` and `objectiveNames`/`objectiveCount` are optional and
 * additive: every existing reader (`normalizeLuaScripts`, `RepairEngine`,
 * `RepairInputAssembler`, the Studio import/export adapters) reads `scripts`
 * and ignores unknown keys, so a consumer written before this slice sees
 * exactly what it always saw. Absent, not defaulted — see
 * `readLuaGenerationProvenance`.
 */
export interface StudioLuaArtifactContent {
  scripts: PlayableLuaScript[];
  /** Which tier of LuaGeneratorAgent's repair cascade produced this Lua. */
  generationMode?: LuaGenerationMode;
  /** Compact semantic evidence: the objectives the accepted Lua actually names. */
  objectiveNames?: readonly string[];
  objectiveCount?: number;
}

const KNOWN_LUA_GENERATION_MODES = [
  "primary",
  "repaired",
  "constrained_repair",
  "safe_repair",
] as const;
type LuaGenerationMode = (typeof KNOWN_LUA_GENERATION_MODES)[number];

function isKnownGenerationMode(value: unknown): value is LuaGenerationMode {
  return (
    typeof value === "string" &&
    (KNOWN_LUA_GENERATION_MODES as readonly string[]).includes(value)
  );
}

/**
 * Read the provenance LuaGeneratorAgent stamped onto its own output, when it
 * did.
 *
 * Fails closed on the label, not on the record: absent or unrecognized
 * `generationMode` is omitted, never defaulted to `"primary"`. A durable
 * artifact from before this slice, or from `RepairEngine`/the legacy Studio
 * adapter (which write a bare `{scripts}` shape with no `lua_generator` at
 * all), must read as *unknown* provenance, not as a claim this store cannot
 * verify.
 */
function readLuaGenerationProvenance(
  luaGenerator: unknown,
): Pick<
  StudioLuaArtifactContent,
  "generationMode" | "objectiveNames" | "objectiveCount"
> {
  if (!isRecord(luaGenerator)) return {};

  const provenance: Pick<
    StudioLuaArtifactContent,
    "generationMode" | "objectiveNames" | "objectiveCount"
  > = {};

  if (isKnownGenerationMode(luaGenerator.generationMode)) {
    provenance.generationMode = luaGenerator.generationMode;
  }

  const names = luaGenerator.mechanicNames;
  if (Array.isArray(names) && names.every((n) => typeof n === "string")) {
    provenance.objectiveNames = names;
    provenance.objectiveCount = names.length;
  }

  return provenance;
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
    options: { worldRuntimeMode?: WorldRuntimeMode } = {},
  ): Promise<PipelineArtifact[]> {
    const worldRuntimeMode =
      options.worldRuntimeMode ?? LEGACY_WORLD_RUNTIME_MODE;
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
    // Undefined until the asset stage produces something. A run whose
    // asset stage never ran has no plan to judge, which the report states
    // rather than reporting as a clean one.
    let assets: AssetPlanResult | undefined;
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

      if (stage === "ASSET_PLANNING") {
        // ASSET-FABRIC-1. The typed plan is stored when the output reads as
        // one, the same way STUDIO-2F-A stores the built UI tree. When it does
        // not, the original output is stored exactly as before with no
        // `schemaVersion`, so a malformed plan is preserved for inspection
        // rather than replaced by a tidier record of nothing.
        assets = buildAssetPlan(node.output);
        pending.push({
          stage,
          agent: node.agent,
          content: assets.outcome === "planned" ? assets.plan : node.output,
          dependsOn: ["GAME_DESIGN"],
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
      content: {
        ...world,
        worldRuntimeMode,
        scene: buildWorldScene(world),
      },
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
      worldRuntimeMode,
      luaPresent,
      luaIssues,
      ui,
      world:
        luaScripts.length > 0
          ? crossValidateWorld(world, luaScripts)
          : undefined,
      assets,
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

    // ASSET-FABRIC-1. `ASSET_PLANNING` must name the `GAME_DESIGN` it derives
    // from, and lineage resolves only from stages already committed — so the
    // design has to be written first. `pending` follows the order the plan
    // executor returned its nodes in, which nothing constrains, so a run that
    // listed the asset stage first would have thrown here and lost a
    // generation that had already passed validation. Ordered by the stage
    // sequence instead, which is the order the dependency rules are written
    // against. Stable, so stages the sequence does not rank keep their
    // relative order.
    const stageRank = (stage: StageName): number => {
      const index = STAGE_ORDER.indexOf(stage);
      return index === -1 ? STAGE_ORDER.length : index;
    };
    pending.sort(
      (left, right) => stageRank(left.stage) - stageRank(right.stage),
    );

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

    // WORLD-1C. The marker is the only publication boundary for new explicit
    // ownership packages. If this final durable write fails, the raw stage
    // artifacts remain inspectable but Studio cannot deliver them.
    await this.artifactStore.commitPackage({
      pipelineId: executionId,
      projectId,
      worldRuntimeMode,
      source: "generation",
      artifacts: recorded,
    });

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

      // One DNA per prior execution. A re-recorded execution — which is what
      // repair does — stores a second GAME_DNA artifact under the same
      // pipeline id, and counting both would make `priorsCompared` exceed
      // `priorsFound` and compare one generation twice. The newest wins,
      // because it describes the state that execution ended in.
      const latestByExecution = new Map<string, PipelineArtifact>();
      for (const artifact of this.artifactStore.getProjectStageArtifacts(
        projectId,
        "GAME_DNA",
      )) {
        if (artifact.pipelineId === executionId) continue;
        const held = latestByExecution.get(artifact.pipelineId);
        if (!held || held.createdAt <= artifact.createdAt) {
          latestByExecution.set(artifact.pipelineId, artifact);
        }
      }

      const priors = [...latestByExecution.values()]
        .map(readPriorGeneration)
        .filter((prior): prior is PriorGeneration => prior !== null);

      return buildGameDnaReport({ dna, priorsFound, priors });
    } catch {
      // A comparison that could not run says so. Reporting it as
      // `no-prior-generations` would assert this project has no history,
      // which is a stronger claim than the failure supports.
      return buildGameDnaReport({
        dna,
        priorsFound: 0,
        priors: [],
        failed: true,
      });
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
  // Fully decoded rather than shape-checked. A durable record can be edited or
  // written by a version that no longer exists, and a partially-read DNA
  // compares to `NaN` distances that look like measurements.
  const dna = decodeGameDna(content.dna);
  if (!dna) return null;
  return {
    executionId: artifact.pipelineId,
    fingerprint: content.fingerprint,
    dna,
  };
}

export function getArtifactStage(agent: string): StageName | undefined {
  return AGENT_STAGE_MAP[agent];
}

/**
 * GEN-ARTIFACT-INTEGRITY-1. Previously this discarded everything but
 * `scripts`: `LuaGeneratorAgent`'s actual output is always
 * `{ lua_generator: { server, client, shared, generationMode,
 * mechanicNames, ... } }`, never a top-level `scripts` array, so every
 * durable `LUA_GENERATION` artifact was rebuilt as bare `{ scripts }` and
 * `generationMode`/`mechanicNames` never reached the store — proven by
 * `GenerationArtifactRecorder.provenance.test.ts`. Downstream Studio,
 * debug and audit consumers could not tell primary, repaired,
 * constrained-repair or deterministic-fallback output apart, or see which
 * mechanics the accepted Lua actually named.
 *
 * `scripts` itself is unchanged — same `normalizeLuaScripts` call, same
 * `PlayableLuaScript[]` shape — so Studio materialization, which reads
 * only `scripts`, sees byte-identical content. What changed is that the
 * provenance already sitting on `output.lua_generator` is now preserved
 * alongside it instead of being thrown away.
 */
export function normalizeLuaArtifactContent(
  output: unknown,
): StudioLuaArtifactContent | Record<string, unknown> {
  if (!isRecord(output)) {
    throw new Error("Lua generator output must be an object");
  }

  const scripts = normalizeLuaScripts(output);
  assertPlayableLuaScripts(scripts);

  // Already the canonical `{ scripts, ... }` shape — RepairEngine's
  // re-stored Lua and the legacy Studio package adapter both write this
  // directly, with no `lua_generator` to read provenance from. Preserved
  // exactly, including whatever it already carries, rather than
  // re-derived: this store must not invent provenance for a record that
  // never stated any.
  if (Array.isArray(output.scripts)) return output;

  return { scripts, ...readLuaGenerationProvenance(output.lua_generator) };
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
