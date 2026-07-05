/**
 * MemorySerializer.ts
 *
 * Pure utility functions for ProjectContext serialization.
 * No side effects — all functions are stateless.
 */

import type { ProjectContext } from "./MemoryTypes";

export class MemorySerializer {
  /**
   * Serialize a ProjectContext to a JSON string.
   * Dates are converted to ISO strings.
   */
  static serialize(context: ProjectContext): string {
    return JSON.stringify(context, (_key, value) => {
      if (value instanceof Date) return value.toISOString();
      if (value instanceof Map) return Object.fromEntries(value);
      if (value instanceof Set) return Array.from(value);
      return value;
    });
  }

  /**
   * Deserialize a JSON string back to a ProjectContext.
   * Restores ISO date strings to Date objects for known date fields.
   */
  static deserialize(json: string): ProjectContext {
    const obj = JSON.parse(json) as Record<string, unknown>;
    // Restore known date fields
    if (obj.pipeline && typeof obj.pipeline === "object") {
      const p = obj.pipeline as Record<string, unknown>;
      if (typeof p.startedAt === "string") {
        p.startedAt = new Date(p.startedAt);
      }
    }
    return obj as unknown as ProjectContext;
  }

  /**
   * Deep-clone a ProjectContext via JSON round-trip.
   * Safe for plain data — no functions or circular refs.
   */
  static clone<T>(value: T): T {
    return JSON.parse(
      JSON.stringify(value, (_key, v) => {
        if (v instanceof Date) return v.toISOString();
        return v;
      }),
    ) as T;
  }

  /**
   * Deep-merge two objects.
   * Arrays in `source` overwrite arrays in `target` (not concatenated).
   * Primitive values in `source` overwrite those in `target`.
   */
  static deepMerge<T extends Record<string, unknown>>(
    target: T,
    source: Partial<T>,
  ): T {
    const result = { ...target } as Record<string, unknown>;
    for (const key of Object.keys(source)) {
      const sv = source[key as keyof T];
      const tv = target[key as keyof T];
      if (
        sv !== null &&
        sv !== undefined &&
        typeof sv === "object" &&
        !Array.isArray(sv) &&
        typeof tv === "object" &&
        tv !== null &&
        !Array.isArray(tv)
      ) {
        result[key] = MemorySerializer.deepMerge(
          tv as Record<string, unknown>,
          sv as Record<string, unknown>,
        );
      } else if (sv !== undefined) {
        result[key] = sv;
      }
    }
    return result as T;
  }

  /**
   * Validate that a deserialized object looks like a ProjectContext.
   * Returns a list of validation issues (empty = valid).
   */
  static validate(obj: unknown): string[] {
    const issues: string[] = [];
    if (typeof obj !== "object" || obj === null) {
      issues.push("Context must be a non-null object");
      return issues;
    }
    const ctx = obj as Record<string, unknown>;
    if (!ctx.pipeline || typeof ctx.pipeline !== "object") {
      issues.push("Context must have a pipeline metadata section");
    }
    if (!Array.isArray(ctx.warnings)) {
      issues.push("Context must have a warnings array");
    }
    if (!Array.isArray(ctx.recommendations)) {
      issues.push("Context must have a recommendations array");
    }
    return issues;
  }
}
