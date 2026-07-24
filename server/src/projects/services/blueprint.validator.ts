import type { GameBlueprint } from "../types/blueprint";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class BlueprintValidator {
  validate(blueprint: GameBlueprint): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!blueprint.name) errors.push("Blueprint name is required");
    if (!blueprint.game_type) errors.push("Game type is required");
    if (!blueprint.genre || blueprint.genre.length === 0)
      errors.push("At least one genre is required");
    if (!blueprint.user_id) errors.push("User ID is required");
    if (!blueprint.difficulty) errors.push("Difficulty is required");
    if (!blueprint.estimated_players)
      errors.push("Estimated players is required");

    if (blueprint.gameplay) {
      if (
        !blueprint.gameplay.mechanics ||
        blueprint.gameplay.mechanics.length === 0
      ) {
        warnings.push("No gameplay mechanics defined");
      }
    }

    if (!blueprint.ui_layouts || blueprint.ui_layouts.length === 0) {
      warnings.push("No UI layouts defined");
    }

    if (
      !blueprint.architecture ||
      !blueprint.architecture.client_architecture
    ) {
      warnings.push("Architecture is incomplete");
    }

    if (
      !blueprint.code_spec ||
      !blueprint.code_spec.modules ||
      blueprint.code_spec.modules.length === 0
    ) {
      warnings.push("No code modules defined");
    }

    if (
      !blueprint.assets ||
      (!blueprint.assets.models?.length &&
        !blueprint.assets.textures?.length &&
        !blueprint.assets.sounds?.length)
    ) {
      warnings.push("No assets planned");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateForGeneration(blueprint: GameBlueprint): ValidationResult {
    const base = this.validate(blueprint);
    const errors = [...base.errors];

    if (blueprint.status !== "draft" && blueprint.status !== "validated") {
      errors.push(
        `Cannot generate: blueprint status is ${blueprint.status}, expected draft or validated`,
      );
    }

    return { valid: errors.length === 0, errors, warnings: base.warnings };
  }

  validateForExport(blueprint: GameBlueprint): ValidationResult {
    const base = this.validate(blueprint);
    const errors = [...base.errors];

    if (
      blueprint.status !== "ready_for_export" &&
      blueprint.status !== "exported"
    ) {
      errors.push(
        `Cannot export: blueprint status is ${blueprint.status}, expected ready_for_export or exported`,
      );
    }

    if (!blueprint.generation_metadata?.generated_at) {
      errors.push("Blueprint has not been generated yet");
    }

    return { valid: errors.length === 0, errors, warnings: base.warnings };
  }
}
