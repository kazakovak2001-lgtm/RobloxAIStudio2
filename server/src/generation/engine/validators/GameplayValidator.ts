/**
 * GameplayValidator.ts
 *
 * Validates gameplay manifest:
 *   - Gameplay system exists
 *   - Dependencies resolved
 *   - Consistency checks
 */

import type { GameplayManifest } from "../generators/GameplayGenerator";

export interface GameplayValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class GameplayValidator {
  validate(manifest: GameplayManifest | undefined): GameplayValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!manifest) {
      errors.push("Gameplay manifest is missing");
      return { valid: false, errors, warnings };
    }

    // Must have at least one mechanic
    if (manifest.mechanics.length === 0) {
      errors.push("No game mechanics defined");
    }

    // Must have player systems
    if (manifest.playerSystems.length === 0) {
      errors.push("No player systems defined");
    }

    // Progression must have stages > 0
    if (manifest.progression.stages <= 0) {
      errors.push("Progression has no stages");
    }

    // At least one objective
    if (manifest.objectives.length === 0) {
      warnings.push("No objectives defined");
    }

    // Check mechanic service dependencies exist in player systems
    const systemNames = new Set(manifest.playerSystems.map((s) => s.name));
    for (const mechanic of manifest.mechanics) {
      for (const dep of mechanic.requiredServices) {
        if (dep.endsWith("System") && !systemNames.has(dep)) {
          warnings.push(
            `Mechanic "${mechanic.name}" requires "${dep}" but it is not in player systems`,
          );
        }
      }
    }

    // Unique mechanic IDs
    const mechIds = new Set<string>();
    for (const m of manifest.mechanics) {
      if (mechIds.has(m.id)) errors.push(`Duplicate mechanic ID: ${m.id}`);
      mechIds.add(m.id);
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
