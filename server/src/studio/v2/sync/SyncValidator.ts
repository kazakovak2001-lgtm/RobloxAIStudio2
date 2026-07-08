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
    if (!change.changeId) {
      errors.push("Missing changeId");
    }

    // Validate timestamp
    if (!change.timestamp || typeof change.timestamp !== "number") {
      errors.push("Missing or invalid timestamp");
    }

    return errors;
  }
}
