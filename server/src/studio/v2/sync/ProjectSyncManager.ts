/**
 * ProjectSyncManager — Manages project synchronization between DevKit and Studio.
 */

import { randomUUID, createHash } from "crypto";
import { ArtifactStore } from "../../../pipeline/v2/ArtifactStore";
import { SyncValidator, type ValidationResult } from "./SyncValidator";
import { ArtifactTransferManager } from "./ArtifactTransferManager";
import type {
  ProjectSnapshot,
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
    const artifacts = this.artifactStore.getByPipeline(pipelineId);
    if (artifacts.length === 0 && !this.versions.has(pipelineId)) {
      // Create base version for empty project
      this.versions.set(pipelineId, this.generateVersion(pipelineId, 0));
    }

    const version =
      this.versions.get(pipelineId) ??
      this.generateVersion(pipelineId, artifacts.length);
    this.versions.set(pipelineId, version);

    const refs = this.transferManager.getArtifactRefs(pipelineId);

    return {
      projectId: pipelineId,
      version,
      artifacts: refs,
      generatedAt: Date.now(),
      artifactCount: refs.length,
    };
  }

  /**
   * Process a sync request with changes from Studio.
   */
  processSyncRequest(pipelineId: string, changes: SyncChange[]): SyncResult {
    if (changes.length === 0) {
      return {
        status: "no_changes",
        appliedChanges: [],
        conflicts: [],
        errors: [],
        newVersion:
          this.versions.get(pipelineId) ?? this.generateVersion(pipelineId, 0),
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
        newVersion:
          this.versions.get(pipelineId) ?? this.generateVersion(pipelineId, 0),
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
        this.applyChange(pipelineId, change);
        appliedChanges.push(change.changeId);
      }
    }

    // Update version
    const newVersion = this.generateVersion(pipelineId, Date.now());
    this.versions.set(pipelineId, newVersion);
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

  private applyChange(_pipelineId: string, change: SyncChange): void {
    if (change.changeType === "update") {
      this.artifactStore.edit(change.artifactId, change.content, "studio-sync");
    }
    // create and delete are logged but not yet fully implemented
    // (would require extending ArtifactStore further)
    this.pendingChanges = this.pendingChanges.filter(
      (c) => c.changeId !== change.changeId,
    );
  }

  private generateVersion(projectId: string, seed: number): string {
    const hash = createHash("md5")
      .update(`${projectId}-${seed}-${randomUUID().slice(0, 6)}`)
      .digest("hex")
      .slice(0, 8);
    return `1.0.0-${hash}`;
  }
}
