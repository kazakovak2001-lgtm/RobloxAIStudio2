/**
 * LiveUpdateEngine.ts
 *
 * Applies incremental, non-destructive changes to game blueprints.
 * Only patches — never full rewrites. Ensures backward compatibility.
 */

import type { RobloxGameBlueprint } from "../../generation/blueprint/GameBlueprintEngine";

export interface LivePatch {
  id: string;
  target: string; // "economy.sources[0].amount" | "npcs[2].behavior" | etc.
  action: "set" | "increment" | "append" | "remove";
  value: unknown;
  reason: string;
  timestamp: Date;
}

export interface PatchResult {
  applied: number;
  skipped: number;
  errors: string[];
  resultingBlueprint: RobloxGameBlueprint;
}

export class LiveUpdateEngine {
  /**
   * Apply a set of live patches to a blueprint.
   * Non-destructive: only modifies specified fields.
   */
  applyPatches(
    blueprint: RobloxGameBlueprint,
    patches: LivePatch[],
  ): PatchResult {
    let applied = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Deep clone to avoid mutating original
    const result = JSON.parse(JSON.stringify(blueprint)) as RobloxGameBlueprint;

    for (const patch of patches) {
      try {
        const success = this.applyPatch(result, patch);
        if (success) applied++;
        else skipped++;
      } catch (err) {
        errors.push(
          `Patch ${patch.id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        skipped++;
      }
    }

    console.log(
      `[LIVE-UPDATE] Applied ${applied}/${patches.length} patches | Skipped: ${skipped}`,
    );

    return { applied, skipped, errors, resultingBlueprint: result };
  }

  private applyPatch(obj: any, patch: LivePatch): boolean {
    const parts = patch.target.split(".");
    let current = obj;

    // Navigate to parent
    for (let i = 0; i < parts.length - 1; i++) {
      const key = this.parseKey(parts[i]);
      if (current[key.name] === undefined) return false;
      current =
        key.index !== null ? current[key.name][key.index] : current[key.name];
      if (current === undefined) return false;
    }

    const lastKey = this.parseKey(parts[parts.length - 1]);
    const target = lastKey.index !== null ? current[lastKey.name] : current;
    const field = lastKey.index !== null ? lastKey.index : lastKey.name;

    switch (patch.action) {
      case "set":
        target[field] = patch.value;
        return true;
      case "increment":
        if (typeof target[field] === "number") {
          target[field] += Number(patch.value);
          return true;
        }
        return false;
      case "append":
        if (Array.isArray(target[field])) {
          target[field].push(patch.value);
          return true;
        }
        return false;
      case "remove":
        if (Array.isArray(target)) {
          target.splice(Number(field), 1);
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  private parseKey(part: string): { name: string; index: number | null } {
    const match = part.match(/^(\w+)\[(\d+)]$/);
    if (match) return { name: match[1], index: Number(match[2]) };
    return { name: part, index: null };
  }
}
