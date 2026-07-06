/**
 * Asset Generation — public API (v2.6)
 */
export {
  AssetGenerationEngine,
  type AssetGenerationResult,
} from "./AssetGenerationEngine";
export { AssetRegistry } from "./AssetRegistry";
export { AssetManifestBuilder } from "./AssetManifestBuilder";
export { AssetReferenceResolver } from "./AssetReferenceResolver";
export { AssetValidationService } from "./AssetValidationService";
export type {
  AssetDefinitionV2,
  AssetManifest,
  ResourceReference,
  AssetValidationReport,
} from "./types";
