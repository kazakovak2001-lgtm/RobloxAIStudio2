/**
 * AssetValidationService.ts — Validates asset integrity.
 */

import { AssetRegistry } from "./AssetRegistry";
import type { AssetValidationReport } from "./types";

export class AssetValidationService {
  validate(registry: AssetRegistry): AssetValidationReport {
    const assets = registry.getAll();
    const errors: string[] = [];
    const warnings: string[] = [];
    const duplicates: string[] = [];
    const unresolvedRefs: string[] = [];
    const paths = new Set<string>();

    for (const asset of assets) {
      if (!asset.id) errors.push("Asset missing ID");
      if (!asset.name) errors.push(`Asset ${asset.id} missing name`);
      if (!asset.path) errors.push(`Asset ${asset.id} missing path`);
      if (paths.has(asset.path)) duplicates.push(asset.path);
      paths.add(asset.path);
      for (const dep of asset.dependencies) {
        if (!registry.has(dep)) unresolvedRefs.push(`${asset.id} → ${dep}`);
      }
    }

    if (assets.length === 0) warnings.push("No assets registered");

    return {
      valid: errors.length === 0 && duplicates.length === 0,
      assetsChecked: assets.length,
      errors,
      warnings,
      duplicates,
      unresolvedRefs,
    };
  }
}
