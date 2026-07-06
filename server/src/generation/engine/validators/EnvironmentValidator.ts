/**
 * EnvironmentValidator.ts
 *
 * Validates environment manifest:
 *   - Map integrity
 *   - Object references
 *   - Spawn configuration
 */

import type { EnvironmentManifest } from "../generators/EnvironmentGenerator";

export interface EnvironmentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class EnvironmentValidator {
  validate(
    manifest: EnvironmentManifest | undefined,
  ): EnvironmentValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!manifest) {
      errors.push("Environment manifest is missing");
      return { valid: false, errors, warnings };
    }

    // Must have at least one map
    if (manifest.maps.length === 0) {
      errors.push("No maps defined");
    }

    // Must have initial spawn
    const hasInitial = manifest.spawnPoints.some((s) => s.type === "initial");
    if (!hasInitial) {
      errors.push("No initial spawn point defined");
    }

    // All spawn points must reference existing maps
    const mapIds = new Set(manifest.maps.map((m) => m.id));
    for (const spawn of manifest.spawnPoints) {
      if (!mapIds.has(spawn.mapId)) {
        errors.push(
          `Spawn "${spawn.name}" references non-existent map: ${spawn.mapId}`,
        );
      }
    }

    // All zones must reference existing maps
    for (const zone of manifest.zones) {
      if (!mapIds.has(zone.mapId)) {
        errors.push(
          `Zone "${zone.name}" references non-existent map: ${zone.mapId}`,
        );
      }
    }

    // All objects must reference existing maps
    for (const obj of manifest.environmentObjects) {
      if (!mapIds.has(obj.mapId)) {
        errors.push(
          `Object "${obj.name}" references non-existent map: ${obj.mapId}`,
        );
      }
    }

    // Unique map IDs
    const seenIds = new Set<string>();
    for (const map of manifest.maps) {
      if (seenIds.has(map.id)) errors.push(`Duplicate map ID: ${map.id}`);
      seenIds.add(map.id);
    }

    // Warning: map with no zones
    for (const map of manifest.maps) {
      if (!manifest.zones.some((z) => z.mapId === map.id)) {
        warnings.push(`Map "${map.name}" has no zones defined`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
