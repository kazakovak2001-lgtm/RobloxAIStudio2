/**
 * ExportManager — Prepares and validates project exports.
 */

import type { ProjectManifest } from "../../studio/v2/manifest/ProjectManifest";

export type ExportStatus =
  "pending" | "validating" | "ready" | "exporting" | "completed" | "failed";

export interface ExportPackage {
  exportId: string;
  manifest: ProjectManifest;
  status: ExportStatus;
  validationErrors: string[];
  createdAt: number;
  completedAt?: number;
}

export class ExportValidator {
  validate(manifest: ProjectManifest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!manifest.projectId) errors.push("Missing projectId");
    if (!manifest.gameName) errors.push("Missing gameName");
    if (manifest.scripts.length === 0) errors.push("No scripts in manifest");
    if (manifest.folders.length === 0) errors.push("No folders in manifest");
    for (const script of manifest.scripts) {
      if (!script.name) errors.push("Script missing name");
      if (!script.path) errors.push("Script missing path");
    }
    return { valid: errors.length === 0, errors };
  }
}

export class ExportManager {
  private exports: Map<string, ExportPackage> = new Map();
  private validator = new ExportValidator();

  /**
   * Prepare an export from a manifest.
   */
  prepare(manifest: ProjectManifest): ExportPackage {
    const exportId = `export-${Date.now()}`;
    const validation = this.validator.validate(manifest);
    const pkg: ExportPackage = {
      exportId,
      manifest,
      status: validation.valid ? "ready" : "failed",
      validationErrors: validation.errors,
      createdAt: Date.now(),
    };
    this.exports.set(exportId, pkg);
    return pkg;
  }

  /**
   * Mark export as completed.
   */
  complete(exportId: string): void {
    const pkg = this.exports.get(exportId);
    if (pkg) {
      pkg.status = "completed";
      pkg.completedAt = Date.now();
    }
  }

  get(exportId: string): ExportPackage | null {
    return this.exports.get(exportId) ?? null;
  }
  get size(): number {
    return this.exports.size;
  }
}
