/**
 * Studio Integration Layer — public API (v2.4)
 */

export {
  StudioIntegrationManager,
  type StudioEvent,
  type StudioEventType,
  type StudioEventListener,
} from "./StudioIntegrationManager";
export { StudioConnectionRegistry } from "./StudioConnectionRegistry";
export { PackageSynchronizer } from "./PackageSynchronizer";
export { ProjectDiffEngine } from "./ProjectDiffEngine";
export { StudioImportValidator } from "./StudioImportValidator";
export { StudioSyncMetrics } from "./StudioSyncMetrics";
export type {
  StudioProjectSession,
  SyncPayload,
  SyncItem,
  ProjectDiff,
  SyncResult,
  StudioSyncMetricsData,
  ImportValidationReport,
  SyncStatus,
} from "./types";
