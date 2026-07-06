/**
 * AssetReferenceResolver.ts — Resolves cross-references between assets.
 */

import { AssetRegistry } from "./AssetRegistry";
import type { ResourceReference } from "./types";

export class AssetReferenceResolver {
  resolve(
    registry: AssetRegistry,
    references: ResourceReference[],
  ): { valid: boolean; unresolved: string[] } {
    const unresolved: string[] = [];
    for (const ref of references) {
      if (ref.type === "asset" && !registry.has(ref.resourceId)) {
        unresolved.push(`${ref.referencedBy} → ${ref.resourceId} (not found)`);
      }
    }
    return { valid: unresolved.length === 0, unresolved };
  }
}
