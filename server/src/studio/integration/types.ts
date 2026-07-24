/**
 * Studio Integration types — v2.4
 */

import { randomUUID } from "crypto";

export type SyncStatus =
  "idle" | "preparing" | "validating" | "syncing" | "completed" | "failed";

export type ArtifactVerificationStatus =
  "idle" | "queued" | "delivered" | "acknowledged" | "verified" | "failed";

export interface StudioProjectSession {
  sessionId: string;
  studioId: string;
  projectId: string;
  packageId?: string;
  status: SyncStatus;
  connectedAt: number;
  lastSyncAt?: number;
  syncCount: number;
  version: number;
  artifactVerified?: boolean;
  verificationStatus?: ArtifactVerificationStatus;
  lastCommandId?: string;
  verifiedExecutionId?: string;
  verifiedArtifactCount?: number;
  verificationError?: string;
}

export interface SyncPayload {
  payloadId: string;
  sessionId: string;
  packageId: string;
  items: SyncItem[];
  totalSize: number;
  createdAt: number;
}

export interface SyncItem {
  path: string;
  type: "script" | "module" | "folder" | "config" | "asset" | "metadata";
  action: "add" | "modify" | "remove";
  content?: unknown;
  size: number;
}

export interface ProjectDiff {
  added: SyncItem[];
  modified: SyncItem[];
  removed: SyncItem[];
  unchanged: number;
  totalChanges: number;
}

export interface SyncResult {
  success: boolean;
  sessionId: string;
  payloadId: string;
  itemsSynced: number;
  totalSize: number;
  durationMs: number;
  error?: string;
}

export interface StudioSyncMetricsData {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  averageDurationMs: number;
  averageItemCount: number;
  averageSizeBytes: number;
  lastSyncAt: number;
  successRate: number;
}

export interface ImportValidationReport {
  valid: boolean;
  packageId: string;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
  errors: string[];
  warnings: string[];
}

export function createSyncPayloadId(): string {
  return `sync-${randomUUID().slice(0, 10)}`;
}
