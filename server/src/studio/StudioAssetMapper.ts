/**
 * StudioAssetMapper.ts
 *
 * Maps Roblox Studio instances into compiler-compatible asset structures.
 * Maintains bidirectional identity mapping between Studio instanceIds and
 * compiler assetIds.
 */

import type { RobloxInstance, AssetDiff } from "./StudioTypes";
import type { AssetPlaceholder, AssetType } from "../assembly/AssemblyTypes";

const CLASS_TO_ASSET_TYPE: Record<string, AssetType> = {
  MeshPart: "Mesh",
  Part: "Model",
  Model: "Model",
  Texture: "Texture",
  Decal: "Texture",
  Sound: "Audio",
  Animation: "Animation",
  ParticleEmitter: "Particle",
  ImageLabel: "UIGraphic",
  ImageButton: "UIGraphic",
};

export class StudioAssetMapper {
  /** instanceId → assetId */
  private studioToCompiler = new Map<string, string>();
  /** assetId → instanceId */
  private compilerToStudio = new Map<string, string>();
  private counter = 0;

  /**
   * Map a Roblox instance to a compiler AssetPlaceholder.
   */
  mapInstance(instance: RobloxInstance): AssetPlaceholder {
    const existing = this.studioToCompiler.get(instance.instanceId);
    if (existing) {
      return this.buildPlaceholder(existing, instance);
    }

    this.counter++;
    const assetId = `studio-asset-${this.counter}`;
    this.studioToCompiler.set(instance.instanceId, assetId);
    this.compilerToStudio.set(assetId, instance.instanceId);

    return this.buildPlaceholder(assetId, instance);
  }

  /**
   * Resolve a compiler asset back to a Studio instance ID.
   */
  resolveToStudio(assetId: string): string | null {
    return this.compilerToStudio.get(assetId) ?? null;
  }

  /**
   * Resolve a Studio instance to its compiler asset ID.
   */
  resolveToCompiler(instanceId: string): string | null {
    return this.studioToCompiler.get(instanceId) ?? null;
  }

  /**
   * Compute diff between local compiler asset and Studio-side asset.
   */
  diffAssets(
    compilerAsset: AssetPlaceholder,
    studioInstance: RobloxInstance,
  ): AssetDiff {
    const changes: AssetDiff["changes"] = [];

    if (compilerAsset.name !== studioInstance.name) {
      changes.push({
        field: "name",
        before: compilerAsset.name,
        after: studioInstance.name,
      });
    }

    const studioType = CLASS_TO_ASSET_TYPE[studioInstance.className] ?? "Model";
    if (compilerAsset.type !== studioType) {
      changes.push({
        field: "type",
        before: compilerAsset.type,
        after: studioType,
      });
    }

    return { assetId: compilerAsset.id, changes };
  }

  /**
   * Get the full identity map (for debugging/serialization).
   */
  getMapping(): {
    studioToCompiler: Record<string, string>;
    compilerToStudio: Record<string, string>;
  } {
    return {
      studioToCompiler: Object.fromEntries(this.studioToCompiler),
      compilerToStudio: Object.fromEntries(this.compilerToStudio),
    };
  }

  get mappedCount(): number {
    return this.studioToCompiler.size;
  }

  private buildPlaceholder(
    assetId: string,
    instance: RobloxInstance,
  ): AssetPlaceholder {
    const type: AssetType = CLASS_TO_ASSET_TYPE[instance.className] ?? "Model";
    return {
      id: assetId,
      name: instance.name,
      type,
      service: "ServerStorage",
      path: `ServerStorage/StudioAssets/${instance.name}`,
      description: `Imported from Studio: ${instance.className}`,
      properties: instance.properties,
    };
  }
}
