import type { GameBlueprint, GameDesignSeed } from "../types/blueprint";

/**
 * Blueprint Assembler
 * Collects agent outputs and assembles them into a complete GameBlueprint
 */
export class BlueprintAssembler {
  /**
   * Assemble blueprint from pipeline outputs
   */
  static assembleBlueprint(
    baseBlueprint: GameBlueprint,
    pipelineOutputs: Record<string, unknown>,
  ): GameBlueprint {
    return {
      ...baseBlueprint,
      requirements: this.extractRequirements(pipelineOutputs),
      gameplay: this.extractGameplay(
        pipelineOutputs,
        (baseBlueprint as any).generation_metadata?.gameDesignSeed,
      ),
      ui_layouts: this.extractUILayouts(pipelineOutputs),
      architecture: this.extractArchitecture(pipelineOutputs),
      assets: this.extractAssets(pipelineOutputs),
      code_spec: this.extractCodeSpec(pipelineOutputs),
      generation_metadata: {
        generated_at: new Date(),
        agents_involved: Object.keys(pipelineOutputs),
      },
    };
  }

  /**
   * Extract requirements from planner/requirements agent output
   */
  private static extractRequirements(outputs: Record<string, unknown>) {
    const req = outputs.requirements || outputs.plan;
    if (!req) return undefined;

    if (typeof req === "object" && req !== null) {
      return {
        functional: (req as any).functional_requirements || [],
        non_functional: (req as any).non_functional_requirements || {},
        constraints: (req as any).constraints || [],
        success_criteria: (req as any).success_criteria || [],
      };
    }

    return {
      functional: [],
      non_functional: {},
      constraints: [],
      success_criteria: [],
    };
  }

  /**
   * Extract gameplay from game designer agent output
   */
  private static extractGameplay(
    outputs: Record<string, unknown>,
    seed?: GameDesignSeed,
  ) {
    const gameplay = outputs.gameplay || outputs.game_designer;
    const gp =
      typeof gameplay === "object" && gameplay !== null
        ? (gameplay as any)
        : {};

    // Seed-derived structure (ensures loop/win/lose/progression/interactions/economy exist even if LLM output is partial)
    const seedLoop = seed?.coreLoop;
    const seedTheme = seed?.theme;
    const seedMechanics: string[] = Array.isArray(seed?.mechanics)
      ? seed.mechanics
      : [];

    const loop =
      typeof gp?.loop === "string"
        ? gp.loop
        : typeof seedLoop === "string"
          ? seedLoop
          : undefined;

    const winCondition =
      typeof gp?.winCondition === "string"
        ? gp.winCondition
        : typeof gp?.win_conditions === "string"
          ? gp.win_conditions
          : "Reach the core objective";

    const loseCondition =
      typeof gp?.loseCondition === "string"
        ? gp.loseCondition
        : typeof gp?.lose_conditions === "string"
          ? gp.lose_conditions
          : "Fail the objective within the constraints";

    const progressionModel =
      typeof gp?.progressionModel === "string"
        ? gp.progressionModel
        : typeof gp?.progression_model === "string"
          ? gp.progression_model
          : "Milestone-based unlocking with escalating difficulty";

    const interactionSystems = Array.isArray(gp?.interactionSystems)
      ? gp.interactionSystems
      : Array.isArray(gp?.interaction_systems)
        ? gp.interaction_systems
        : seedMechanics.slice(0, 5);

    const economyOrScoring =
      typeof gp?.economyOrScoring === "string"
        ? gp.economyOrScoring
        : typeof gp?.economy_or_scoring === "string"
          ? gp.economy_or_scoring
          : "Points/credits earned from successful interactions and milestones";

    // Map into existing GameplaySystem fields without changing top-level schemas.
    // - mechanics: keep existing mechanic list
    // - progression/balance: embed required design strings as structured subfields
    return {
      mechanics: gp.mechanics || gp.game_mechanics || seedMechanics || [],
      progression: {
        ...(gp.progression || {}),
        // Required additions (seed/LLM-derived)
        loop,
        player_progression_model: progressionModel,
        unlocking_system: gp.progression?.unlocking_system ?? undefined,
      },
      balance: {
        ...(gp.balance || {}),
        // Required additions
        winCondition,
        loseCondition,
        interactionSystems,
        economyOrScoring,
        theme: seedTheme ?? undefined,
      },
      // Extended gameplay structure for direct access
      loop: loop,
      winCondition,
      loseCondition,
      progressionModel,
      interactionSystems,
      economyOrScoring,
    };
  }

  /**
   * Extract UI layouts from UI generator agent output
   */
  private static extractUILayouts(outputs: Record<string, unknown>) {
    const ui = outputs.ui_layouts || outputs.ui_generator;
    if (!ui) return [];

    if (Array.isArray(ui)) {
      return ui.map((layout: any) => ({
        name: layout.name || "UI Layout",
        type: layout.type || "hud",
        position: layout.position,
        elements: layout.elements || [],
      }));
    }

    if (typeof ui === "object" && ui !== null) {
      const uiObj = ui as any;
      if (Array.isArray(uiObj.layouts)) {
        return uiObj.layouts;
      }
      return [ui as any];
    }

    return [];
  }

  /**
   * Extract architecture from roblox architect agent output
   */
  private static extractArchitecture(outputs: Record<string, unknown>) {
    const arch = outputs.architecture || outputs.roblox_architect;
    if (!arch) {
      return {
        client_architecture: {},
        server_architecture: {},
        networking: {},
      };
    }

    if (typeof arch === "object" && arch !== null) {
      const a = arch as any;
      return {
        client_architecture: a.client_architecture || {},
        server_architecture: a.server_architecture || {},
        networking: a.networking || {},
      };
    }

    return {
      client_architecture: {},
      server_architecture: {},
      networking: {},
    };
  }

  /**
   * Extract assets from asset planner agent output
   */
  private static extractAssets(outputs: Record<string, unknown>) {
    const assets = outputs.assets || outputs.asset_planner;
    if (!assets) {
      return {
        models: [],
        textures: [],
        sounds: [],
        animations: [],
      };
    }

    if (typeof assets === "object" && assets !== null) {
      const ast = assets as any;
      return {
        models: ast.models || [],
        textures: ast.textures || [],
        sounds: ast.sounds || [],
        animations: ast.animations || [],
      };
    }

    return {
      models: [],
      textures: [],
      sounds: [],
      animations: [],
    };
  }

  /**
   * Extract code specification from lua generator agent output
   */
  private static extractCodeSpec(outputs: Record<string, unknown>) {
    const code = outputs.code_spec || outputs.lua_generator;
    if (!code) {
      return {
        modules: [],
        patterns: [],
        coding_standards: {},
      };
    }

    if (typeof code === "object" && code !== null) {
      const c = code as any;
      return {
        modules: c.modules || [],
        patterns: c.patterns || [],
        coding_standards: c.coding_standards || {},
      };
    }

    return {
      modules: [],
      patterns: [],
      coding_standards: {},
    };
  }

  /**
   * Validate assembled blueprint
   */
  static validateAssembled(blueprint: GameBlueprint): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    if (!blueprint.gameplay || blueprint.gameplay.mechanics.length === 0) {
      issues.push("No gameplay mechanics defined");
    }

    if (!blueprint.ui_layouts || blueprint.ui_layouts.length === 0) {
      issues.push("No UI layouts defined");
    }

    if (!blueprint.architecture) {
      issues.push("No architecture defined");
    }

    if (!blueprint.code_spec || blueprint.code_spec.modules.length === 0) {
      issues.push("No code modules defined");
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Merge partial blueprints
   */
  static mergePartial(
    base: GameBlueprint,
    partial: Partial<GameBlueprint>,
  ): GameBlueprint {
    return {
      ...base,
      ...partial,
      // Deep merge certain fields
      gameplay: partial.gameplay
        ? { ...base.gameplay, ...partial.gameplay }
        : base.gameplay,
      architecture: partial.architecture
        ? { ...base.architecture, ...partial.architecture }
        : base.architecture,
      assets: partial.assets
        ? { ...base.assets, ...partial.assets }
        : base.assets,
      code_spec: partial.code_spec
        ? { ...base.code_spec, ...partial.code_spec }
        : base.code_spec,
    };
  }
}
