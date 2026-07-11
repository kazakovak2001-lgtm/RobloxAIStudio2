/**
 * AssetGenerationEngine — Top-level facade for asset generation.
 */

import type {
  AssetGenerationRequest,
  AssetGenerationResult,
} from "./AssetTypes";
import { AssetRegistry } from "./AssetRegistry";
import { AssetManifestBuilder } from "./AssetManifestBuilder";
import { AssetValidator } from "./AssetValidator";

export class AssetGenerationEngine {
  private registry: AssetRegistry;
  private manifestBuilder: AssetManifestBuilder;
  private validator: AssetValidator;

  constructor() {
    this.registry = new AssetRegistry();
    this.manifestBuilder = new AssetManifestBuilder();
    this.validator = new AssetValidator();
  }

  /**
   * Generate a complete asset package for a project.
   */
  generate(request: AssetGenerationRequest): AssetGenerationResult {
    const startTime = Date.now();

    const assets = this.registry.generateAssets(request);
    const manifest = this.manifestBuilder.build(request.projectId, assets);
    const validation = this.validator.validate(assets);

    return {
      projectId: request.projectId,
      manifest,
      validation,
      generationTimeMs: Date.now() - startTime,
    };
  }
}
