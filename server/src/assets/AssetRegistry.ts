/**
 * AssetRegistry.ts — Central registry for all generated assets.
 */

import type { AssetDefinitionV2 } from "./types";

export class AssetRegistry {
  private assets: Map<string, AssetDefinitionV2> = new Map();

  register(asset: AssetDefinitionV2): { accepted: boolean; reason?: string } {
    if (this.assets.has(asset.id))
      return { accepted: false, reason: `Duplicate asset ID: ${asset.id}` };
    if ([...this.assets.values()].some((a) => a.path === asset.path))
      return { accepted: false, reason: `Duplicate path: ${asset.path}` };
    this.assets.set(asset.id, asset);
    return { accepted: true };
  }

  get(id: string): AssetDefinitionV2 | undefined {
    return this.assets.get(id);
  }
  has(id: string): boolean {
    return this.assets.has(id);
  }
  getByPath(path: string): AssetDefinitionV2 | undefined {
    return [...this.assets.values()].find((a) => a.path === path);
  }
  getByCategory(category: string): AssetDefinitionV2[] {
    return [...this.assets.values()].filter((a) => a.category === category);
  }
  getAll(): AssetDefinitionV2[] {
    return [...this.assets.values()];
  }
  get size(): number {
    return this.assets.size;
  }
  clear(): void {
    this.assets.clear();
  }
}
