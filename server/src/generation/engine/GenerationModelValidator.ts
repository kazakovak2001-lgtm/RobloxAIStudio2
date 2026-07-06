/**
 * GenerationModelValidator.ts
 *
 * Validates the completeness and integrity of a GenerationModel.
 */

import type { GenerationModel } from "./GenerationModel";

export interface ModelValidationResult {
  valid: boolean;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
  errors: string[];
  warnings: string[];
}

export class GenerationModelValidator {
  /**
   * Validate a complete generation model.
   */
  validate(model: GenerationModel): ModelValidationResult {
    const checks: ModelValidationResult["checks"] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // Model ID
    const hasId = !!model.id && model.id.length > 0;
    checks.push({ name: "model-id", passed: hasId });
    if (!hasId) errors.push("Model missing ID");

    // Game metadata
    const hasTitle = !!model.game.title;
    checks.push({ name: "game-title", passed: hasTitle });
    if (!hasTitle) errors.push("Game missing title");

    const hasGenre = !!model.game.genre;
    checks.push({ name: "game-genre", passed: hasGenre });
    if (!hasGenre) errors.push("Game missing genre");

    // Required services
    const hasServices = model.services.length > 0;
    checks.push({
      name: "services-present",
      passed: hasServices,
      detail: `${model.services.length} services`,
    });
    if (!hasServices) warnings.push("No services defined");

    // Unique script IDs
    const scriptIds = model.scripts.map((s) => s.id);
    const uniqueScriptIds = new Set(scriptIds);
    const scriptsUnique = scriptIds.length === uniqueScriptIds.size;
    checks.push({
      name: "unique-script-ids",
      passed: scriptsUnique,
      detail: `${scriptIds.length} scripts`,
    });
    if (!scriptsUnique) errors.push("Duplicate script IDs detected");

    // Unique module IDs
    const moduleIds = model.modules.map((m) => m.id);
    const uniqueModuleIds = new Set(moduleIds);
    const modulesUnique = moduleIds.length === uniqueModuleIds.size;
    checks.push({
      name: "unique-module-ids",
      passed: modulesUnique,
      detail: `${moduleIds.length} modules`,
    });
    if (!modulesUnique) errors.push("Duplicate module IDs detected");

    // Dependency integrity
    const allIds = new Set([
      ...scriptIds,
      ...moduleIds,
      ...model.services.map((s) => s.name),
    ]);
    const brokenDeps: string[] = [];
    for (const dep of model.dependencies) {
      if (!allIds.has(dep.from) && dep.from !== model.id) {
        brokenDeps.push(`${dep.from} → ${dep.to}: "${dep.from}" not found`);
      }
    }
    const depsValid = brokenDeps.length === 0;
    checks.push({
      name: "dependency-integrity",
      passed: depsValid,
      detail: `${model.dependencies.length} deps`,
    });
    if (!depsValid) {
      for (const bd of brokenDeps.slice(0, 5))
        errors.push(`Broken dependency: ${bd}`);
    }

    // Naming consistency (no empty names)
    const emptyNames = [
      ...model.scripts.filter((s) => !s.name),
      ...model.modules.filter((m) => !m.name),
      ...model.services.filter((s) => !s.name),
    ];
    const namingValid = emptyNames.length === 0;
    checks.push({ name: "naming-consistency", passed: namingValid });
    if (!namingValid)
      errors.push(`${emptyNames.length} items have empty names`);

    // Reference integrity (scripts referencing valid paths)
    const allPaths = new Set([
      ...model.scripts.map((s) => s.path),
      ...model.modules.map((m) => m.path),
    ]);
    const scriptDeps = model.scripts.flatMap((s) => s.dependencies);
    const unresolvedRefs = scriptDeps.filter(
      (d) => !allIds.has(d) && !allPaths.has(d),
    );
    const refsValid = unresolvedRefs.length === 0;
    checks.push({
      name: "reference-integrity",
      passed: refsValid,
      detail: `${unresolvedRefs.length} unresolved`,
    });
    if (!refsValid)
      warnings.push(`${unresolvedRefs.length} unresolved references`);

    // Folders defined
    const hasFolders = model.folders.length > 0;
    checks.push({
      name: "folders-defined",
      passed: hasFolders,
      detail: `${model.folders.length} folders`,
    });
    if (!hasFolders) warnings.push("No folders defined");

    return {
      valid: errors.length === 0,
      checks,
      errors,
      warnings,
    };
  }
}
