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

  /**
   * INTENT-DEFAULT-CONTAMINATION-001. Fields the system filled in because the
   * user did not state them, listed by blueprint field name.
   *
   * A project created without a genre used to arrive downstream indistinguishable
   * from one where the user chose that genre deliberately, so an assumption was
   * consumed as a requirement. Anything naming these fields as user intent must
   * consult this first; an empty or absent list means every value was stated.
   */
  assumed_fields?: string[];

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
  /**
   * BLUEPRINT-STALE-001. Content hash of `snapshot`, using the same canonical
   * JSON algorithm as artifact envelopes. It depends on the design content and
   * nothing else, so an execution can state exactly which design it ran and a
   * later edit to the mutable blueprint cannot rewrite that claim.
   *
   * Optional only for versions recorded before this field existed; a version
   * without one has an unknown hash rather than a matching one.
   */
  snapshot_hash?: string;
  change_description?: string;
  is_active: boolean;
}

/**
 * INTENT-FIDELITY-001. One requirement, with an identity that survives the run.
 *
 * Requirements were plain strings passed downstream as an opaque object, so
 * nothing could ask whether a particular one had been satisfied. An identifier
 * makes that question answerable, and `source` keeps the answer honest: a
 * requirement derived from a system default is not something the user asked
 * for, and must not be reported as though it were.
 */
export interface RequirementSpec {
  /** Stable within a run, of the form R-001. */
  id: string;
  text: string;
  kind: "functional" | "non_functional" | "constraint" | "success_criterion";
  source: "user-stated" | "derived";
}

/**
 * What a run can show about the requirements it was given.
 *
 * `uncovered` is the point of this record. A run that cannot show evidence for
 * a requirement has not satisfied it, whatever its prose says, and naming those
 * is more useful than a percentage.
 */
export interface RequirementCoverage {
  total: number;
  covered: number;
  uncoveredIds: string[];
}

/**
 * CHAT-BLUEPRINT-DISCONNECT-001. A proposed change to a blueprint's design.
 *
 * The Define conversation persisted messages and nothing else, so an assistant
 * could state that it had changed the design while the next generation still
 * consumed the old blueprint. A proposal makes the claim into a thing: it is
 * visible, it names exactly which fields would change, and until someone
 * accepts it, it has no effect on any generation.
 */
export interface BlueprintChangeProposal {
  id: string;
  project_id: string;
  blueprint_id: string;
  /** Who or what proposed it — a user id, or an assistant identifier. */
  proposed_by: string;
  created_at: Date;
  /** Only the fields this proposal would change. */
  changes: Partial<GameBlueprint>;
  /** Why, in the proposer's words. Shown alongside the diff. */
  rationale?: string;
  status: "pending" | "accepted" | "rejected";
  decided_at?: Date;
  decided_by?: string;
  /** The version acceptance created, so the effect is traceable. */
  applied_version_id?: string;
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
  /**
   * AUDIT-RECOVERY-001. Set when startup reconciliation closed this execution
   * because a restart left it `running` with no worker. The status is `failed`
   * so existing consumers behave correctly, and this distinguishes "the process
   * died" from "the generation failed on its merits".
   */
  restart_interrupted_at?: number;
  /**
   * BLUEPRINT-STALE-001. The immutable blueprint version this run consumed, and
   * the content hash of that snapshot. Generation used to reference the mutable
   * blueprint, so editing the design after a run silently changed what that run
   * appeared to have been generated from. These record what it actually ran.
   *
   * Absent on executions recorded before the binding existed, where the design
   * that produced them is genuinely unknown rather than assumed to be current.
   */
  blueprint_version_id?: string;
  blueprint_snapshot_hash?: string;
  /**
   * INTENT-FIDELITY-001. What this run could show about the requirements it
   * was given. Absent when no requirements were produced, which is different
   * from having produced some and traced none.
   */
  requirement_coverage?: RequirementCoverage;
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
