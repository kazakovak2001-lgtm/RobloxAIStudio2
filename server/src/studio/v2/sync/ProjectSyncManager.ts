/**
 * ProjectSyncManager — Manages project synchronization between DevKit and Studio.
 */

import { createHash } from "crypto";
import { ArtifactStore } from "../../../pipeline/v2/ArtifactStore";
import { SyncValidator, type ValidationResult } from "./SyncValidator";
import { ArtifactTransferManager } from "./ArtifactTransferManager";
import type {
  ProjectSnapshot,
  ArtifactRef,
  SyncChange,
  SyncResult,
  SyncConflict,
  SyncStatus,
} from "./SyncTypes";

export class ProjectSyncManager {
  private artifactStore: ArtifactStore;
  private validator: SyncValidator;
  private transferManager: ArtifactTransferManager;
  private versions: Map<string, string> = new Map();
  private lastSyncTimestamp: number | null = null;
  private pendingChanges: SyncChange[] = [];
  private conflicts: SyncConflict[] = [];

  constructor(artifactStore: ArtifactStore) {
    this.artifactStore = artifactStore;
    this.validator = new SyncValidator();
    this.transferManager = new ArtifactTransferManager(artifactStore);
  }

  /**
   * Generate a project snapshot (metadata + artifact refs).
   */
  getProjectSnapshot(pipelineId: string): ProjectSnapshot | null {
    const refs = this.transferManager.getArtifactRefs(pipelineId);
    const version = this.generateVersion(pipelineId, refs);
    this.versions.set(pipelineId, version);

    return {
      projectId: pipelineId,
      version,
      artifacts: refs,
      generatedAt: Date.now(),
      artifactCount: refs.length,
    };
  }

  /**
   * Tenant-scoped snapshot for security-sensitive Studio delivery.
   */
  getProjectSnapshotForProject(
    projectId: string,
    pipelineId: string,
  ): ProjectSnapshot | null {
    const refs = this.transferManager.getArtifactRefsForProject(
      projectId,
      pipelineId,
    );
    const version = this.generateVersion(pipelineId, refs);
    this.versions.set(pipelineId, version);

    return {
      projectId,
      version,
      artifacts: refs,
      generatedAt: Date.now(),
      artifactCount: refs.length,
    };
  }

  /**
   * Process a sync request with changes from Studio after artifact mutations are
   * durably acknowledged.
   */
  async processSyncRequest(
    pipelineId: string,
    changes: SyncChange[],
  ): Promise<SyncResult> {
    if (changes.length === 0) {
      const currentVersion = this.getProjectSnapshot(pipelineId)?.version;
      return {
        status: "no_changes",
        appliedChanges: [],
        conflicts: [],
        errors: [],
        newVersion: currentVersion ?? "0.0.0",
        timestamp: Date.now(),
      };
    }

    // Validate changes
    const knownIds = this.artifactStore
      .getByPipeline(pipelineId)
      .map((a) => a.id);
    const validation = this.validator.validate(changes, knownIds);

    if (!validation.valid) {
      return {
        status: "error",
        appliedChanges: [],
        conflicts: [],
        errors: validation.errors.map((e) => `[${e.changeId}] ${e.error}`),
        newVersion: this.getProjectSnapshot(pipelineId)?.version ?? "0.0.0",
        timestamp: Date.now(),
      };
    }

    const unsupported = changes.filter(
      (change) =>
        change.changeType === "create" || change.changeType === "delete",
    );
    if (unsupported.length > 0) {
      const detectedConflicts = changes
        .map((change) => this.detectConflict(pipelineId, change))
        .filter((conflict): conflict is SyncConflict => conflict !== null);
      this.conflicts = detectedConflicts;
      return {
        status: detectedConflicts.length > 0 ? "conflict" : "error",
        appliedChanges: [],
        conflicts: detectedConflicts,
        errors: unsupported.map(
          (change) =>
            `[${change.changeId}] ${change.changeType} is not supported by the canonical ArtifactStore`,
        ),
        newVersion: this.getProjectSnapshot(pipelineId)?.version ?? "0.0.0",
        timestamp: Date.now(),
      };
    }

    // Detect conflicts and apply changes
    const appliedChanges: string[] = [];
    const detectedConflicts: SyncConflict[] = [];

    for (const change of changes) {
      const conflict = this.detectConflict(pipelineId, change);
      if (conflict) {
        detectedConflicts.push(conflict);
      } else {
        await this.applyChange(pipelineId, change);
        appliedChanges.push(change.changeId);
      }
    }

    // Publish the new version only after all accepted artifact mutations are
    // acknowledged.
    const newVersion = this.getProjectSnapshot(pipelineId)?.version ?? "0.0.0";
    this.lastSyncTimestamp = Date.now();
    this.conflicts = detectedConflicts;

    return {
      status: detectedConflicts.length > 0 ? "conflict" : "applied",
      appliedChanges,
      conflicts: detectedConflicts,
      errors: [],
      newVersion,
      timestamp: Date.now(),
    };
  }

  /**
   * Validate changes without applying (dry run).
   */
  validateOnly(pipelineId: string, changes: SyncChange[]): ValidationResult {
    const knownIds = this.artifactStore
      .getByPipeline(pipelineId)
      .map((a) => a.id);
    return this.validator.validate(changes, knownIds);
  }

  /**
   * Get current sync status.
   */
  getSyncStatus(pipelineId?: string): SyncStatus {
    return {
      lastSyncTimestamp: this.lastSyncTimestamp,
      pendingChanges: this.pendingChanges.length,
      conflictCount: this.conflicts.length,
      currentVersion:
        (pipelineId ? this.versions.get(pipelineId) : null) ?? "0.0.0",
      projectId: pipelineId ?? null,
    };
  }

  /**
   * Get the transfer manager for artifact operations.
   */
  getTransferManager(): ArtifactTransferManager {
    return this.transferManager;
  }

  private detectConflict(
    _pipelineId: string,
    change: SyncChange,
  ): SyncConflict | null {
    // For update/delete, check if the artifact was modified since the change timestamp
    if (change.changeType === "update" || change.changeType === "delete") {
      const artifact = this.artifactStore.getById(change.artifactId);
      if (artifact && artifact.createdAt > change.timestamp) {
        return {
          changeId: change.changeId,
          artifactId: change.artifactId,
          reason: "Artifact was modified after change was created",
          localVersion: String(artifact.createdAt),
          remoteVersion: String(change.timestamp),
        };
      }
    }
    return null;
  }

  private async applyChange(
    _pipelineId: string,
    change: SyncChange,
  ): Promise<void> {
    if (change.changeType === "update") {
      await this.artifactStore.edit(
        change.artifactId,
        change.content,
        "studio-sync",
      );
    }
    // create and delete are logged but not yet fully implemented
    // (would require extending ArtifactStore further)
    this.pendingChanges = this.pendingChanges.filter(
      (c) => c.changeId !== change.changeId,
    );
  }

  private generateVersion(projectId: string, artifacts: ArtifactRef[]): string {
    const fingerprint = artifacts
      .map((artifact) =>
        [
          artifact.id,
          artifact.hash,
          artifact.size,
          artifact.createdAt,
          artifact.reviewStatus,
        ].join(":"),
      )
      .sort()
      .join("|");
    const hash = createHash("sha256")
      .update(`${projectId}|${fingerprint}`)
      .digest("hex")
      .slice(0, 8);
    return `1.0.0-${hash}`;
  }
}
