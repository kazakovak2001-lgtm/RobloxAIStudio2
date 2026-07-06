/**
 * AssetGenerationEngine.ts — Generates asset definitions from GenerationModel.
 */

import type { GenerationModel } from "../generation/engine/GenerationModel";
import { AssetRegistry } from "./AssetRegistry";
import { AssetManifestBuilder } from "./AssetManifestBuilder";
import { AssetValidationService } from "./AssetValidationService";
import type {
  AssetManifest,
  AssetDefinitionV2,
  AssetValidationReport,
} from "./types";
import { createAssetId } from "./types";

export interface AssetGenerationResult {
  success: boolean;
  manifest: AssetManifest;
  validation: AssetValidationReport;
  durationMs: number;
}

export class AssetGenerationEngine {
  private manifestBuilder = new AssetManifestBuilder();
  private validator = new AssetValidationService();

  generate(model: GenerationModel): AssetGenerationResult {
    const start = Date.now();
    const registry = new AssetRegistry();

    // Generate from model assets
    for (const asset of model.assets) {
      const def: AssetDefinitionV2 = {
        id: asset.id || createAssetId(),
        name: asset.name,
        assetType: asset.assetType,
        path: asset.path,
        category: asset.assetType,
        dependencies: [],
        metadata: asset.metadata,
        generatedBy: "AssetGenerationEngine",
        timestamp: Date.now(),
      };
      registry.register(def);
    }

    // Generate standard assets (textures for UI, sounds for game)
    registry.register({
      id: createAssetId(),
      name: "DefaultUI",
      assetType: "texture",
      path: "Assets/Textures/DefaultUI.png",
      category: "ui",
      dependencies: [],
      metadata: { width: 512, height: 512 },
      generatedBy: "AssetGenerationEngine",
      timestamp: Date.now(),
    });
    registry.register({
      id: createAssetId(),
      name: "GameIcon",
      assetType: "texture",
      path: "Assets/Textures/GameIcon.png",
      category: "branding",
      dependencies: [],
      metadata: { width: 256, height: 256 },
      generatedBy: "AssetGenerationEngine",
      timestamp: Date.now(),
    });

    if (
      model.game.mechanics.some(
        (m) => m.includes("collect") || m.includes("pickup"),
      )
    ) {
      registry.register({
        id: createAssetId(),
        name: "CollectibleSFX",
        assetType: "sound",
        path: "Assets/Sounds/Collectible.ogg",
        category: "sfx",
        dependencies: [],
        metadata: { duration: 0.5 },
        generatedBy: "AssetGenerationEngine",
        timestamp: Date.now(),
      });
    }

    const validation = this.validator.validate(registry);
    const manifest = this.manifestBuilder.build(registry);

    return {
      success: validation.valid,
      manifest,
      validation,
      durationMs: Date.now() - start,
    };
  }
}
