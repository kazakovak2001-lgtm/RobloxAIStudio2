import type { GameBlueprint } from "./blueprint";

export type RobloxLuaCodeBlock = {
  name: string;
  code: string;
};

export type RobloxWorldDefinition = {
  name?: string;
  description?: string;
  places?: unknown[];
  models?: unknown[];
  systemsHooks?: Record<string, unknown>;
};

export type RobloxNPCDefinition = {
  id: string;
  role: string;
  dialogue?: string;
  behaviors?: Record<string, unknown>;
  spawn?: Record<string, unknown>;
};

export type GameplaySystemDefinition = {
  name: string;
  description?: string;
  config?: Record<string, unknown>;
};

export type GameGenerationResultMetadata = {
  executionId: string;
  blueprintId: string;
  generatedAt: Date;
  agentsInvolved: string[];
  sourcePipelineOutputs?: Record<string, unknown>;
};

/**
 * Canonical final output contract for the AI game generation pipeline.
 *
 * NOTE: This intentionally lives separate from GameBlueprint.
 * It is meant to represent the Roblox game artifact that the frontend can
 * render/export to a Studio project.
 */
export interface GameGenerationResult {
  scripts: {
    server: RobloxLuaCodeBlock[];
    client: RobloxLuaCodeBlock[];
    shared: RobloxLuaCodeBlock[];
  };
  world: RobloxWorldDefinition;
  npcs: RobloxNPCDefinition[];
  gameplaySystems: {
    systems: GameplaySystemDefinition[];
  };
  /**
   * High-level metadata + debugging breadcrumbs.
   * (Keep structured for deterministic consumption.)
   */
  metadata: GameGenerationResultMetadata;

  /** Optional: link back to the blueprint used as the generation base. */
  blueprint?: GameBlueprint;
}

