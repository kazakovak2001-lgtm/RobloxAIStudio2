/**
 * AssetManifestBuilder — Constructs the asset manifest for a project.
 */

import type { GameAsset, AssetManifest } from "./AssetTypes";

export class AssetManifestBuilder {
  build(projectId: string, assets: GameAsset[]): AssetManifest {
    return {
      projectId,
      generatedAt: Date.now(),
      version: "1.0.0",
      assets,
      totalAssets: assets.length,
      generatedCount: assets.filter((a) => a.generated).length,
      placeholderCount: assets.filter((a) => a.placeholder).length,
      totalSizeBytes: assets.reduce((sum, a) => sum + a.sizeBytes, 0),
    };
  }
}
