/**
 * Sync Types — Shared type definitions for project synchronization.
 */

export interface ProjectSnapshot {
  projectId: string;
  version: string;
  artifacts: ArtifactRef[];
  generatedAt: number;
  artifactCount: number;
}

export interface ArtifactRef {
  id: string;
  type: string;
  name: string;
  stage: string;
  size: number;
  hash: string;
  version: number;
  createdAt: number;
  reviewStatus: string;
}

export type SyncChangeType = "create" | "update" | "delete";

export interface SyncChange {
  changeId: string;
  artifactId: string;
  artifactType: string;
  changeType: SyncChangeType;
  content: unknown;
  timestamp: number;
}

export interface SyncConflict {
  changeId: string;
  artifactId: string;
  reason: string;
  localVersion: string;
  remoteVersion: string;
}

export type SyncResultStatus = "applied" | "conflict" | "no_changes" | "error";

export interface SyncResult {
  status: SyncResultStatus;
  appliedChanges: string[];
  conflicts: SyncConflict[];
  errors: string[];
  newVersion: string;
  timestamp: number;
}

export interface SyncStatus {
  lastSyncTimestamp: number | null;
  pendingChanges: number;
  conflictCount: number;
  currentVersion: string;
  projectId: string | null;
}
