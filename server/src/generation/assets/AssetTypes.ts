/**
 * Asset Generation Types — Defines types for Roblox game assets.
 */

import { randomUUID } from "crypto";

export type AssetType =
  | "Image"
  | "Texture"
  | "MeshMetadata"
  | "Audio"
  | "AnimationMetadata"
  | "ParticleConfiguration"
  | "SurfaceAppearance"
  | "Decal"
  | "FontReference";

export type AssetTargetService =
  | "ReplicatedStorage"
  | "StarterGui"
  | "Workspace"
  | "Lighting"
  | "SoundService"
  | "ServerStorage";

export interface GameAsset {
  assetId: string;
  type: AssetType;
  name: string;
  targetService: AssetTargetService;
  targetPath: string;
  dependencies: string[];
  generator: string;
  validationScore: number;
  generated: boolean;
  placeholder: boolean;
  metadata: Record<string, unknown>;
  sizeBytes: number;
  createdAt: number;
}

export interface AssetManifest {
  projectId: string;
  generatedAt: number;
  version: string;
  assets: GameAsset[];
  totalAssets: number;
  generatedCount: number;
  placeholderCount: number;
  totalSizeBytes: number;
}

export interface AssetValidationReport {
  valid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
  duplicateAssets: string[];
  missingReferences: string[];
  invalidPaths: string[];
  unusedAssets: string[];
  orphanAssets: string[];
}

export interface AssetGenerationRequest {
  projectId: string;
  gameName: string;
  genre: string;
  systems: string[];
  uiScreens?: string[];
}

export interface AssetGenerationResult {
  projectId: string;
  manifest: AssetManifest;
  validation: AssetValidationReport;
  generationTimeMs: number;
}

export function createAssetId(): string {
  return `asset-${randomUUID().slice(0, 10)}`;
}
