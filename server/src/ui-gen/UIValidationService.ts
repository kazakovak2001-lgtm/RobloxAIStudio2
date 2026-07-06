/**
 * UIValidationService.ts — Validates UI hierarchy, references, and layout.
 */

import type { UIScreen, UIObject, UIValidationReport } from "./types";

export class UIValidationService {
  validate(screens: UIScreen[]): UIValidationReport {
    const errors: string[] = [];
    const warnings: string[] = [];
    let objectsChecked = 0;

    for (const screen of screens) {
      const ids = new Set<string>();
      for (const obj of screen.objects) {
        objectsChecked++;
        // Duplicate IDs
        if (ids.has(obj.id))
          errors.push(`Duplicate ID in screen "${screen.name}": ${obj.id}`);
        ids.add(obj.id);
        // Missing parent reference
        if (
          obj.parent !== null &&
          !ids.has(obj.parent) &&
          obj.parent !== screen.rootObject.id
        ) {
          // Parent might come later in array; check at end
        }
        // Empty name
        if (!obj.name)
          errors.push(`Object ${obj.id} in "${screen.name}" has empty name`);
      }

      // Validate parent references
      const allIds = new Set(screen.objects.map((o) => o.id));
      for (const obj of screen.objects) {
        if (obj.parent !== null && !allIds.has(obj.parent)) {
          errors.push(
            `Object "${obj.name}" references missing parent: ${obj.parent}`,
          );
        }
      }

      // Check root is ScreenGui
      if (screen.rootObject.type !== "ScreenGui") {
        errors.push(
          `Screen "${screen.name}" root is not ScreenGui (got ${screen.rootObject.type})`,
        );
      }

      // Depth warning
      const depth = this.computeDepth(screen.objects, screen.rootObject.id);
      if (depth > 10)
        warnings.push(
          `Screen "${screen.name}" has deep hierarchy (${depth} levels)`,
        );
    }

    if (screens.length === 0) warnings.push("No UI screens generated");

    return { valid: errors.length === 0, objectsChecked, errors, warnings };
  }

  private computeDepth(objects: UIObject[], rootId: string): number {
    const childMap = new Map<string, string[]>();
    for (const obj of objects) {
      if (obj.parent) {
        if (!childMap.has(obj.parent)) childMap.set(obj.parent, []);
        childMap.get(obj.parent)!.push(obj.id);
      }
    }

    const measure = (id: string, d: number): number => {
      const children = childMap.get(id) ?? [];
      if (children.length === 0) return d;
      return Math.max(...children.map((c) => measure(c, d + 1)));
    };

    return measure(rootId, 1);
  }
}
