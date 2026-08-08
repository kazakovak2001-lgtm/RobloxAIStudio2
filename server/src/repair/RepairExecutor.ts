/**
 * RepairExecutor — Applies repair strategies to artifacts.
 *
 * REPAIR-1A implements exactly one real strategy: `regenerate_script`, a
 * single whole-package regeneration via LuaGeneratorAgent (the playability
 * contract requires one self-contained server script and one self-contained
 * client script, so there is no per-script or additive patch strategy that
 * can satisfy it). Every other RepairStrategy fails closed.
 */

import type { AgentRegistry } from "../agents/core/AgentRegistry";
import type { ArtifactStore } from "../pipeline/v2";
import {
  getPlayableLuaIssues,
  normalizeLuaScripts,
  type PlayableLuaScript,
} from "../types/playableLua";
import type { RepairPlan, RepairPlanItem, RepairResult } from "./RepairTypes";

/**
 * The minimal blueprint shape RepairExecutor needs. Declared locally
 * (dependency inversion) instead of importing IBlueprintRepository from
 * projects/repository — repair is a domains-layer module and must not
 * depend on the api-layer repository directly. Callers (routes/bootstrap)
 * pass the real repository, which satisfies this structurally.
 */
export interface RepairBlueprintLookup {
  getBlueprintByProjectId(
    projectId: string,
  ): Promise<{ name: string; description: string } | null>;
}

export interface RepairExecutionContext {
  projectId: string;
  parentExecutionId: string;
  scripts: PlayableLuaScript[];
}

export interface RepairExecutionOutcome {
  results: RepairResult[];
  scripts: PlayableLuaScript[];
}

export class RepairExecutor {
  constructor(
    private readonly agentRegistry: AgentRegistry,
    private readonly blueprintRepository: RepairBlueprintLookup,
    private readonly artifactStore: ArtifactStore,
  ) {}

  /**
   * Execute a repair plan. Regeneration replaces the full script package;
   * later plan items see the most recently regenerated scripts, not the
   * original pre-repair ones.
   */
  async execute(
    plan: RepairPlan,
    context: RepairExecutionContext,
  ): Promise<RepairExecutionOutcome> {
    const results: RepairResult[] = [];
    let scripts = context.scripts;

    for (const item of plan.items) {
      if (item.decision === "ignore" || item.decision === "escalate") {
        results.push(
          this.result(item, false, `Skipped: decision=${item.decision}`),
        );
        continue;
      }

      if (item.repairStrategy !== "regenerate_script") {
        results.push(
          this.result(
            item,
            false,
            `Strategy '${item.repairStrategy}' not yet implemented in REPAIR-1A`,
          ),
        );
        continue;
      }

      const regenerated = await this.regenerateScript(
        { ...context, scripts },
        item,
      );
      if (!regenerated) {
        results.push(
          this.result(
            item,
            false,
            "Regeneration failed or the result did not pass the playability check",
          ),
        );
        continue;
      }

      scripts = regenerated;
      results.push(
        this.result(
          item,
          true,
          `Regenerated the full script package for issue ${item.issueId}`,
        ),
      );
    }

    return { results, scripts };
  }

  /**
   * Whole-package regeneration via LuaGeneratorAgent, constrained by the
   * specific failing issue. Reuses the agent's own bounded internal
   * repair/retry ladder (see LuaGeneratorAgent.process) — this method makes
   * exactly one `executeAgent` call, no additional retry loop on top.
   */
  private async regenerateScript(
    context: RepairExecutionContext,
    item: RepairPlanItem,
  ): Promise<PlayableLuaScript[] | null> {
    const blueprint = await this.blueprintRepository.getBlueprintByProjectId(
      context.projectId,
    );
    if (!blueprint) return null;

    const parentArtifacts = this.artifactStore.getByPipeline(
      context.parentExecutionId,
    );
    const architecture = parentArtifacts.find(
      (artifact) => artifact.stage === "ARCHITECTURE",
    )?.content;
    const gameDesign = parentArtifacts.find(
      (artifact) => artifact.stage === "GAME_DESIGN",
    )?.content as Record<string, unknown> | undefined;

    const constrainedBlueprint = {
      ...blueprint,
      description: `${blueprint.description}\n\nPrevious attempt failed a playability check (${item.targetArtifact}): ${item.reason}. ${item.recommendedFix}`,
    };

    const output = await this.agentRegistry.executeAgent("lua_generator", {
      blueprint: constrainedBlueprint,
      architecture,
      gameplay: gameDesign?.gameplay,
    });

    if (output._failed) return null;

    try {
      const scripts = normalizeLuaScripts(output);
      if (getPlayableLuaIssues(scripts).length > 0) return null;
      return scripts;
    } catch {
      return null;
    }
  }

  private result(
    item: RepairPlanItem,
    applied: boolean,
    description: string,
  ): RepairResult {
    return {
      planItem: item,
      applied,
      artifactChanged: item.targetArtifact,
      description,
    };
  }
}
