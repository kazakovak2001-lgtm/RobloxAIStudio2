/**
 * GenerationSandbox.ts
 *
 * Enforces that AI generation code writes only to valid boundary zones.
 * Prevents generation into the removed root frontend or other local zones.
 */

import {
  resolveBoundary,
  type BoundaryZone,
} from "../architecture/ArchitecturePolicy";

export class GenerationError extends Error {
  constructor(
    message: string,
    public readonly targetPath: string,
    public readonly expectedZone: BoundaryZone,
    public readonly actualZone: BoundaryZone,
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

export type GenerationTarget = "backend" | "studio-plugin";

const TARGET_TO_ZONE: Record<GenerationTarget, BoundaryZone> = {
  backend: "backend",
  "studio-plugin": "studio-plugin",
};

const TARGET_TO_PATH_PREFIX: Record<GenerationTarget, string> = {
  backend: "server/src/",
  "studio-plugin": "studio-plugin/src/",
};

export class GenerationSandbox {
  /**
   * Validate that a generation target path is within the correct boundary.
   * Throws GenerationError if the path violates the boundary.
   */
  validateTarget(target: GenerationTarget, outputPath: string): void {
    const expectedZone = TARGET_TO_ZONE[target];
    const actualZone = resolveBoundary(outputPath);

    if (actualZone !== expectedZone) {
      throw new GenerationError(
        `AI generation boundary violation: target "${target}" must write to "${TARGET_TO_PATH_PREFIX[target]}" but attempted to write to "${outputPath}" (zone: ${actualZone})`,
        outputPath,
        expectedZone,
        actualZone,
      );
    }
  }

  /**
   * Get the valid path prefix for a generation target.
   */
  getValidPrefix(target: GenerationTarget): string {
    return TARGET_TO_PATH_PREFIX[target];
  }

  /**
   * Check if a path is valid for a target (non-throwing).
   */
  isValidTarget(target: GenerationTarget, outputPath: string): boolean {
    const expectedZone = TARGET_TO_ZONE[target];
    return resolveBoundary(outputPath) === expectedZone;
  }

  /**
   * Auto-correct a path to the correct boundary (if safe).
   * Only relocates within the same zone — cross-boundary relocation is forbidden.
   */
  correctPath(target: GenerationTarget, filename: string): string {
    return `${TARGET_TO_PATH_PREFIX[target]}${filename}`;
  }
}
