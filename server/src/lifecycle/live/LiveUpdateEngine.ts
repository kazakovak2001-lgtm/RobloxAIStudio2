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
    // SEC-LIFECYCLE-PROTO-001. `target` is caller-supplied. A segment such as
    // `__proto__` or `constructor.prototype` used to walk off the cloned
    // blueprint onto Object.prototype and write to every object in the
    // process. Navigation now only follows the blueprint's own properties and
    // refuses prototype-reaching names outright, so the refusal is reported
    // as an error rather than a silent skip.
    if (typeof patch.target !== "string" || patch.target.length === 0) {
      throw new Error("patch target must be a non-empty string");
    }
    const parts = patch.target.split(".");
    let current = obj;

    // Navigate to parent
    for (let i = 0; i < parts.length - 1; i++) {
      const key = this.parseKey(parts[i]);
      if (!hasOwn(current, key.name)) return false;
      current = current[key.name];
      if (key.index !== null) {
        if (!Array.isArray(current) || !hasOwn(current, key.index)) {
          return false;
        }
        current = current[key.index];
      }
      if (!isContainer(current)) return false;
    }

    const lastKey = this.parseKey(parts[parts.length - 1]);
    let target = current;
    if (lastKey.index !== null) {
      if (!hasOwn(current, lastKey.name)) return false;
      target = current[lastKey.name];
      if (!Array.isArray(target)) return false;
    }
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
    const key = match
      ? { name: match[1], index: Number(match[2]) }
      : { name: part, index: null };
    if (FORBIDDEN_SEGMENTS.has(key.name)) {
      throw new Error(`patch target segment "${key.name}" is not allowed`);
    }
    return key;
  }
}

const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

function isContainer(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOwn(value: unknown, key: string | number): boolean {
  return isContainer(value) && Object.prototype.hasOwnProperty.call(value, key);
}
