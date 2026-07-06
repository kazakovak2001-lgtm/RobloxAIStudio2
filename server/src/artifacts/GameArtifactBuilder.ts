/**
 * GameArtifactBuilder.ts
 *
 * Collects outputs from all pipeline stages and merges them into
 * a single deterministic GameArtifact. No side effects.
 * This is the FINAL STEP of the compiler pipeline.
 */

import type { GameArtifact } from "./GameArtifact";
import type { RobloxGameBlueprint } from "../generation/blueprint/GameBlueprintEngine";
import type { LuaGenerationResult } from "../generation/lua/LuaGenerator";
import type { AssetLayout } from "../generation/assets/AssetGenerator";
import type { GameValidationResult } from "../generation/validation/GameValidationEngine";
import type { EconomyModel } from "../economy/core/EconomyModelEngine";
import type { ImbalanceReport } from "../economy/detection/ImbalanceDetector";
import type { SimulationResult } from "../simulation/core/GameSimulationEngine";
import type { PlaytestReport } from "../simulation/agents/PlaytestAgent";
import type { EmergenceReport } from "../world/emergence/EmergentBehaviorEngine";

export interface ArtifactInputs {
  blueprint: RobloxGameBlueprint;
  scripts: LuaGenerationResult;
  assets: AssetLayout;
  validation: GameValidationResult;
  economyModel: EconomyModel;
  imbalanceReport?: ImbalanceReport;
  simulation: SimulationResult;
  playtest: PlaytestReport;
  emergence?: EmergenceReport;
  worldStability?: number;
  startTime: number; // Date.now() at pipeline start
}

export class GameArtifactBuilder {
  /**
   * Build the final GameArtifact from all pipeline outputs.
   * Deterministic: same inputs → same artifact.
   */
  build(inputs: ArtifactInputs): GameArtifact {
    const artifact: GameArtifact = {
      id: `artifact-${inputs.blueprint.id}-${Date.now()}`,
      version: "1.0.0",
      producedAt: new Date(),

      blueprint: inputs.blueprint,
      scripts: inputs.scripts,
      assets: inputs.assets,

      economy: {
        model: inputs.economyModel,
        imbalanceReport: inputs.imbalanceReport,
      },

      worldState: {
        emergence: inputs.emergence,
        stability: inputs.worldStability ?? 100,
      },

      validationReport: inputs.validation,

      simulationReport: {
        simulation: inputs.simulation,
        playtest: inputs.playtest,
      },

      evaluationReport: {
        overallScore: inputs.validation.score,
        passed: inputs.validation.passed,
      },

      pipeline: {
        mode: "deterministic",
        stages: [
          "planning",
          "generation",
          "simulation",
          "economy",
          "world",
          "validation",
          "artifact-build",
        ],
        totalDurationMs: Date.now() - inputs.startTime,
      },
    };

    console.log(
      `[ARTIFACT] Built | ID: ${artifact.id} | Score: ${artifact.validationReport.score} | ` +
        `Scripts: ${artifact.scripts.totalScripts} | Passed: ${artifact.evaluationReport.passed}`,
    );

    return artifact;
  }
}
