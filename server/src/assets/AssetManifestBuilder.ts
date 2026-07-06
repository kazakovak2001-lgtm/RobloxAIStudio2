/**
 * AssetManifestBuilder.ts — Builds asset manifest from registry.
 */

import { AssetRegistry } from "./AssetRegistry";
import type { AssetManifest } from "./types";

export class AssetManifestBuilder {
  build(registry: AssetRegistry): AssetManifest {
    const assets = registry.getAll();
    const categories: Record<string, number> = {};
    const dependencies: Array<{ from: string; to: string }> = [];

    for (const asset of assets) {
      categories[asset.category] = (categories[asset.category] ?? 0) + 1;
      for (const dep of asset.dependencies) {
        dependencies.push({ from: asset.id, to: dep });
      }
    }

    return {
      version: "2.6.0",
      generatedAt: Date.now(),
      assets,
      totalAssets: assets.length,
      categories,
      dependencies,
    };
  }
}
