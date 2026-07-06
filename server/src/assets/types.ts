/**
 * Asset Generation types (v2.6)
 */

import { randomUUID } from "crypto";

export interface AssetDefinitionV2 {
  id: string;
  name: string;
  assetType:
    "model" | "texture" | "sound" | "animation" | "mesh" | "decal" | "particle";
  path: string;
  category: string;
  dependencies: string[];
  metadata: Record<string, unknown>;
  generatedBy: string;
  timestamp: number;
}

export interface AssetManifest {
  version: string;
  generatedAt: number;
  assets: AssetDefinitionV2[];
  totalAssets: number;
  categories: Record<string, number>;
  dependencies: Array<{ from: string; to: string }>;
}

export interface ResourceReference {
  resourceId: string;
  referencedBy: string;
  type: "asset" | "ui" | "script" | "module";
  path: string;
}

export interface AssetValidationReport {
  valid: boolean;
  assetsChecked: number;
  errors: string[];
  warnings: string[];
  duplicates: string[];
  unresolvedRefs: string[];
}

export function createAssetId(): string {
  return `asset-${randomUUID().slice(0, 8)}`;
}
