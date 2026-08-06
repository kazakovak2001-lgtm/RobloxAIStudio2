/**
 * SyncValidator — Validates incoming sync changes and artifact integrity.
 */

import type { SyncChange } from "./SyncTypes";

const VALID_ARTIFACT_TYPES = [
  "json",
  "lua",
  "markdown",
  "text",
  "manifest",
  "ui-layout",
  "asset-plan",
];

export interface ValidationResult {
  valid: boolean;
  validatedCount: number;
  errors: Array<{ changeId: string; error: string }>;
}

export class SyncValidator {
  /**
   * Validate a set of sync changes without applying them.
   */
  validate(
    changes: SyncChange[],
    knownArtifactIds: string[],
  ): ValidationResult {
    const errors: Array<{ changeId: string; error: string }> = [];

    for (const change of changes) {
      const changeErrors = this.validateChange(change, knownArtifactIds);
      for (const error of changeErrors) {
        errors.push({ changeId: change.changeId, error });
      }
    }

    return {
      valid: errors.length === 0,
      validatedCount: changes.length,
      errors,
    };
  }

  private validateChange(
    change: SyncChange,
    knownArtifactIds: string[],
  ): string[] {
    const errors: string[] = [];

    // Validate artifact type
    if (!VALID_ARTIFACT_TYPES.includes(change.artifactType)) {
      errors.push(
        `Invalid artifact type: "${change.artifactType}". Supported: ${VALID_ARTIFACT_TYPES.join(", ")}`,
      );
    }

    if (!change.artifactId || typeof change.artifactId !== "string") {
      errors.push("Missing artifactId");
    }

    if (
      !(["create", "update", "delete"] as const).includes(change.changeType)
    ) {
      errors.push(`Invalid change type: "${String(change.changeType)}"`);
    }

    // Validate content for create/update
    if (
      (change.changeType === "create" || change.changeType === "update") &&
      (change.content === undefined || change.content === null)
    ) {
      errors.push(`Content is required for ${change.changeType} operations`);
    }

    // Validate artifact exists for update/delete
    if (
      (change.changeType === "update" || change.changeType === "delete") &&
      !knownArtifactIds.includes(change.artifactId)
    ) {
      errors.push(
        `Artifact "${change.artifactId}" not found for ${change.changeType} operation`,
      );
    }

    // Validate changeId present
    if (typeof change.changeId !== "string" || !change.changeId.trim()) {
      errors.push("Missing changeId");
    }

    // Validate timestamp
    if (
      typeof change.timestamp !== "number" ||
      !Number.isFinite(change.timestamp) ||
      change.timestamp <= 0
    ) {
      errors.push("Missing or invalid timestamp");
    }

    return errors;
  }
}
