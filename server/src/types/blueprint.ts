// Blueprint types - Core data model for game design

export type BlueprintStatus =
  | "draft"
  | "validated"
  | "generation_in_progress"
  | "ready_for_export"
  | "exported"
  | "archived";

export interface GameplayMechanic {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface GameplaySystem {
  mechanics: GameplayMechanic[];
  progression: {
    levels?: number;
    difficulty_scaling?: string;
    unlocking_system?: string;
    // Extended: seed-derived progression model
    player_progression_model?: string;
  };
  balance: {
    economy?: Record<string, unknown>;
    difficulty_multipliers?: Record<string, number>;
    // Extended: enriched balance fields
    winCondition?: string;
    loseCondition?: string;
    interactionSystems?: string[];
    economyOrScoring?: string;
    theme?: string;
  };
  // Extended: direct access to seed-derived gameplay structure
  loop?: string;
  winCondition?: string;
  loseCondition?: string;
  progressionModel?: string;
  interactionSystems?: string[];
  economyOrScoring?: string;
}

export interface UILayout {
  name: string;
  type: "hud" | "menu" | "dialog" | "inventory" | "shop" | "settings";
  position?: string;
  elements: {
    id: string;
    type: string;
    label?: string;
    properties?: Record<string, unknown>;
  }[];
}

export interface GameArchitecture {
  client_architecture: {
    main_loop_frequency?: number;
    rendering_engine?: string;
    physics_engine?: string;
  };
  server_architecture: {
    replication_model?: string;
    update_rate?: number;
    persistence_strategy?: string;
  };
  networking: {
    protocol?: string;
    bandwidth_optimization?: string;
    latency_handling?: string;
  };
}

export interface AssetPlan {
  models: Array<{
    id: string;
    name: string;
    description: string;
    complexity: "simple" | "medium" | "complex";
    source?: "builtin" | "marketplace" | "custom";
  }>;
  textures: Array<{
    id: string;
    name: string;
    resolution?: string;
  }>;
  sounds: Array<{
    id: string;
    name: string;
    type: "sfx" | "music" | "ambient";
  }>;
  animations: Array<{
    id: string;
    name: string;
    target: string;
    frames?: number;
  }>;
}

// Re-export GameDesignSeed for use in generation metadata
export type { GameDesignSeed } from "./gameDesignSeed";

export interface CodeGenSpec {
  modules: Array<{
    name: string;
    type: "server" | "client" | "shared";
    functions: Array<{
      name: string;
      parameters: Record<string, string>;
      returns: string;
    }>;
  }>;
  patterns: string[];
  coding_standards?: {
    naming_convention?: string;
    comment_style?: string;
    performance_targets?: Record<string, string>;
  };
}

export interface GameBlueprint {
  // Metadata
  id: string;
  project_id: string;
  user_id: string;
  created_at: Date;
  updated_at: Date;
  status: BlueprintStatus;
  version: number;

  // Core Design
  name: string;
  description: string;
  game_type: string; // e.g., "simulator", "rpg", "tycoon", "platformer"
  genre: string[];
  target_audience: string;
  difficulty: "easy" | "medium" | "hard" | "extreme";
  estimated_players: "solo" | "small-group" | "large-group" | "mmo";

  // Requirements Analysis
  requirements?: {
    functional: string[];
    non_functional: Record<string, string>;
    constraints: string[];
    success_criteria: string[];
  };

  // Game Design
  gameplay: GameplaySystem;

  // UI/UX Design
  ui_layouts: UILayout[];

  // Technical Architecture
  architecture: GameArchitecture;

  // Asset Planning
  assets: AssetPlan;

  // Code Generation Spec
  code_spec: CodeGenSpec;

  // Validation & Metadata
  validation_errors?: string[];
  warnings?: string[];
  generation_metadata?: {
    generated_at?: Date;
    agents_involved?: string[];
    total_duration_ms?: number;
    step_durations?: Record<string, number>;
    gameDesignSeed?: import("./gameDesignSeed").GameDesignSeed;
  };

  // Export metadata
  export_metadata?: {
    exported_at?: Date;
    export_format?: string;
    studio_version?: string;
  };
}

export interface BlueprintVersion {
  id: string;
  blueprint_id: string;
  version_number: number;
  created_at: Date;
  created_by: string;
  snapshot: Partial<GameBlueprint>;
  change_description?: string;
  is_active: boolean;
}

export interface GenerationExecution {
  id: string;
  blueprint_id: string;
  project_id: string;
  user_id: string;
  started_at: Date;
  completed_at?: Date;
  status: "running" | "completed" | "failed" | "cancelled";
  pipeline_steps: Array<{
    agent: string;
    /**
     * AGENT-CONTRACT-1. Version of the agent definition that ran this step.
     *
     * `undefined` on steps recorded before the contract existed: their agent
     * definition is genuinely unknown and must not be assumed to be the
     * current one.
     */
    agent_version?: number;
    status: "pending" | "running" | "completed" | "failed" | "skipped";
    started_at?: Date;
    completed_at?: Date;
    duration_ms?: number;
    error?: string;
    evaluation?: {
      qualityScore: number;
      status: "passed" | "warning" | "failed";
      issueCount: number;
      durationMs: number;
    };
  }>;
  total_duration_ms?: number;
  error_message?: string;
  retry_count: number;
  /**
   * How this execution's content was produced.
   *
   * `"ai"`      — a real provider generated the artifacts.
   * `"fallback"`— no provider resolved, or at least one stage returned
   *               deterministic canned content. `ai_provider` may still be
   *               set: it records what was configured, not what produced the
   *               content. Never present this as an AI generation.
   * `undefined` — recorded before provenance existed; provenance is unknown
   *               and must not be reported as `"ai"`.
   */
  ai_mode?: "ai" | "fallback";
  /** Resolved provider name, e.g. "ollama". Never a key or endpoint. */
  ai_provider?: string;
  /** Resolved model name, e.g. "qwen2.5-coder:7b". */
  ai_model?: string;
  /**
   * Pipeline definition this execution ran, e.g. `"game-generation"`.
   *
   * `undefined` on executions recorded before PIPELINE-1A. Their pipeline
   * shape is genuinely unknown and must not be assumed to be the current one.
   */
  pipeline_definition?: string;
  /**
   * Version of that definition. Together with `pipeline_definition` this is
   * what ties an artifact set to the exact set of stages that produced it.
   */
  pipeline_version?: number;
  /**
   * NOVELTY-2. Whether this generation repeats a structure the project has
   * produced before, and the evidence for that answer.
   *
   * `undefined` on executions recorded before this existed, and on any run
   * that produced no `GAME_DNA` artifact. Absence means the question was never
   * asked — it is not a `distinct` verdict, and must never be read as one.
   *
   * Advisory. Nothing blocks, retries or regenerates on it, and only exact
   * fingerprint equality counts as a repeat. See
   * `docs/00-project-control/NOVELTY-2_PROMOTION_CRITERIA.md`.
   */
  novelty?: import("./novelty").NoveltyVerdictRecord;
}

export type CreateBlueprintInput = Omit<
  GameBlueprint,
  | "id"
  | "created_at"
  | "updated_at"
  | "status"
  | "version"
  | "validation_errors"
  | "warnings"
  | "generation_metadata"
  | "export_metadata"
>;

export type UpdateBlueprintInput = Partial<CreateBlueprintInput> & {
  status?: BlueprintStatus;
};

export interface BlueprintQueryOptions {
  project_id?: string;
  user_id?: string;
  status?: BlueprintStatus;
  limit?: number;
  offset?: number;
  sort_by?: "created_at" | "updated_at" | "status";
  sort_order?: "asc" | "desc";
}
