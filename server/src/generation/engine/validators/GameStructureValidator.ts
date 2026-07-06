/**
 * GameStructureValidator.ts
 *
 * Validates game structure integrity:
 *   - Required services present
 *   - Correct folder hierarchy
 *   - No duplicate paths/names
 */

import type { GenerationModel } from "../GenerationModel";

export interface StructureValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const REQUIRED_SERVICES = [
  "DataStoreService",
  "GameStateManager",
  "PlayerManager",
  "NetworkManager",
];
const REQUIRED_FOLDERS = [
  "ServerScriptService",
  "ReplicatedStorage",
  "StarterPlayerScripts",
  "Workspace",
];

export class GameStructureValidator {
  validate(model: GenerationModel): StructureValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required services
    for (const required of REQUIRED_SERVICES) {
      if (!model.services.some((s) => s.name === required)) {
        errors.push(`Missing required service: ${required}`);
      }
    }

    // Check required folders
    for (const required of REQUIRED_FOLDERS) {
      if (
        !model.folders.some(
          (f) => f.path === required || f.path.startsWith(required + "/"),
        )
      ) {
        errors.push(`Missing required folder: ${required}`);
      }
    }

    // Check for duplicate folder paths
    const paths = new Set<string>();
    for (const folder of model.folders) {
      if (paths.has(folder.path)) {
        errors.push(`Duplicate folder path: ${folder.path}`);
      }
      paths.add(folder.path);
    }

    // Check for duplicate service names
    const serviceNames = new Set<string>();
    for (const svc of model.services) {
      if (serviceNames.has(svc.name)) {
        errors.push(`Duplicate service name: ${svc.name}`);
      }
      serviceNames.add(svc.name);
    }

    // Warnings for missing optional elements
    if (model.folders.length < 5) {
      warnings.push(
        "Fewer than 5 folders defined — structure may be incomplete",
      );
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
