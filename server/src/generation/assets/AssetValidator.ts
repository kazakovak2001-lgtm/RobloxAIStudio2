/**
 * AssetValidator — Validates asset manifests for completeness and correctness.
 */

import type { GameAsset, AssetValidationReport } from "./AssetTypes";

export class AssetValidator {
  validate(
    assets: GameAsset[],
    scriptDependencies?: string[],
  ): AssetValidationReport {
    const errors: string[] = [];
    const warnings: string[] = [];
    const duplicateAssets: string[] = [];
    const missingReferences: string[] = [];
    const invalidPaths: string[] = [];
    const unusedAssets: string[] = [];
    const orphanAssets: string[] = [];

    this.checkDuplicates(assets, duplicateAssets);
    this.checkPaths(assets, invalidPaths);
    this.checkReferences(
      assets,
      scriptDependencies ?? [],
      missingReferences,
      unusedAssets,
    );
    this.checkOrphans(assets, orphanAssets, warnings);

    if (duplicateAssets.length > 0)
      errors.push(`${duplicateAssets.length} duplicate assets`);
    if (invalidPaths.length > 0)
      errors.push(`${invalidPaths.length} invalid paths`);
    if (missingReferences.length > 0)
      warnings.push(`${missingReferences.length} missing references`);
    if (unusedAssets.length > 0)
      warnings.push(`${unusedAssets.length} potentially unused assets`);

    const score = this.calculateScore(errors, warnings, assets);

    return {
      valid: errors.length === 0,
      score,
      errors,
      warnings,
      duplicateAssets,
      missingReferences,
      invalidPaths,
      unusedAssets,
      orphanAssets,
    };
  }

  private checkDuplicates(assets: GameAsset[], duplicates: string[]): void {
    const seen = new Map<string, number>();
    for (const asset of assets) {
      const key = `${asset.targetPath}/${asset.name}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [name, count] of seen) {
      if (count > 1) duplicates.push(name);
    }
  }

  private checkPaths(assets: GameAsset[], invalid: string[]): void {
    const validServices = [
      "ReplicatedStorage",
      "StarterGui",
      "Workspace",
      "Lighting",
      "SoundService",
      "ServerStorage",
    ];
    for (const asset of assets) {
      if (!validServices.includes(asset.targetService)) {
        invalid.push(`${asset.name}: invalid service "${asset.targetService}"`);
      }
      if (!asset.targetPath || asset.targetPath.length < 3) {
        invalid.push(`${asset.name}: path too short`);
      }
    }
  }

  private checkReferences(
    assets: GameAsset[],
    scriptDeps: string[],
    missing: string[],
    unused: string[],
  ): void {
    const assetNames = new Set(assets.map((a) => a.name));

    // Check if scripts reference assets that don't exist
    for (const dep of scriptDeps) {
      if (
        dep.includes("Asset") ||
        dep.includes("Icon") ||
        dep.includes("Texture")
      ) {
        if (!assetNames.has(dep)) {
          missing.push(dep);
        }
      }
    }

    // Mark assets that no script references (potentially unused)
    // This is a soft warning only
    const referencedPattern = /Image|Icon|Texture|Mesh|Audio|Anim/i;
    for (const asset of assets) {
      if (
        !scriptDeps.some((d) => d === asset.name) &&
        !referencedPattern.test(asset.type)
      ) {
        unused.push(asset.name);
      }
    }
  }

  private checkOrphans(
    assets: GameAsset[],
    orphans: string[],
    warnings: string[],
  ): void {
    // Assets with dependencies that reference non-existent assets
    const assetNames = new Set(assets.map((a) => a.name));
    for (const asset of assets) {
      for (const dep of asset.dependencies) {
        if (!assetNames.has(dep)) {
          orphans.push(`${asset.name} depends on missing: ${dep}`);
          warnings.push(`Orphan dependency: ${asset.name} → ${dep}`);
        }
      }
    }
  }

  private calculateScore(
    errors: string[],
    warnings: string[],
    assets: GameAsset[],
  ): number {
    let score = 100;
    score -= errors.length * 15;
    score -= warnings.length * 3;
    if (assets.length >= 10) score += 5;
    if (assets.every((a) => a.validationScore >= 70)) score += 5;
    return Math.max(0, Math.min(100, score));
  }
}
