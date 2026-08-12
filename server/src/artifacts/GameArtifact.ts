/**
 * GameArtifact.ts
 *
 * The SINGLE canonical output of the entire pipeline.
 * All generation stages produce partial data that merges into this object.
 * This is the product — everything the system produces lives here.
 */

import type { RobloxGameBlueprint } from "../generation/blueprint/GameBlueprintEngine";
import type { LuaGenerationResult } from "../generation/lua/LuaGenerator";
import type { AssetLayout } from "../generation/assets/AssetGenerator";
import type { GameValidationResult } from "../generation/validation/GameValidationEngine";
import type { EconomyModel } from "../economy/core/EconomyModelEngine";
import type { ImbalanceReport } from "../economy/detection/ImbalanceDetector";
import type { SimulationResult } from "../simulation/core/GameSimulationEngine";
import type { SimulationEvidenceReport } from "../simulation/agents/PlaytestAgent";
import type { EmergenceReport } from "../world/emergence/EmergentBehaviorEngine";

export interface GameArtifact {
  /** Unique artifact ID */
  id: string;
  /** Schema version */
  version: string;
  /** Timestamp of production */
  producedAt: Date;

  /** Core game definition */
  blueprint: RobloxGameBlueprint;

  /** Generated Lua scripts (server + client + shared) */
  scripts: LuaGenerationResult;

  /** Asset placement layout */
  assets: AssetLayout;

  /** Economy model and balance state */
  economy: {
    model: EconomyModel;
    imbalanceReport?: ImbalanceReport;
  };

  /** Simulated world state summary */
  worldState: {
    emergence?: EmergenceReport;
    stability: number;
  };

  /** Validation gate result */
  validationReport: GameValidationResult;

  /** Simulation playtest results */
  simulationReport: {
    simulation: SimulationResult;
    playtest: SimulationEvidenceReport;
  };

  /** Quality evaluation score */
  evaluationReport: {
    overallScore: number;
    passed: boolean;
  };

  /** Pipeline execution metadata */
  pipeline: {
    mode: "deterministic";
    stages: string[];
    totalDurationMs: number;
  };
}
