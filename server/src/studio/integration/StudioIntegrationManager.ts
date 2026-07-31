/**
 * StudioIntegrationManager.ts
 *
 * Compatibility facade over the canonical Studio v2 runtime. Existing callers
 * keep their public contract, while sessions, artifacts, and outbound commands
 * are owned by one shared runtime.
 */

import type { GenerationPackage } from "../../generation/coordinator/types";
import type { BridgeSession } from "../v2/StudioSession";
import type { StudioOperationalEvidence } from "../v2/StudioEvidenceStore";
import { getSharedStudioRuntime } from "../v2/StudioRuntime";
import { StudioImportValidator } from "./StudioImportValidator";
import { StudioSyncMetrics } from "./StudioSyncMetrics";
import type {
  SyncResult,
  ImportValidationReport,
  StudioSyncMetricsData,
  StudioProjectSession,
} from "./types";

export type StudioEventType =
  | "StudioConnected"
  | "StudioDisconnected"
  | "SyncStarted"
  | "SyncProgress"
  | "SyncCompleted"
  | "SyncFailed"
  | "ImportValidated";
export interface StudioEvent {
  type: StudioEventType;
  studioId: string;
  timestamp: number;
  data: Record<string, unknown>;
}
export type StudioEventListener = (event: StudioEvent) => void;

export class StudioIntegrationManager {
  private readonly runtime = getSharedStudioRuntime();
  private readonly validator = new StudioImportValidator();
  private readonly metrics = new StudioSyncMetrics();
  private listeners: StudioEventListener[] = [];

  constructor(_legacyBridge?: unknown) {}

  // ─── Connection ───────────────────────────────────────────────────────

  connect(studioId: string, projectId: string): StudioProjectSession {
    const client = this.runtime.bridge.connect(
      "legacy-compatible",
      projectId,
      studioId,
    );
    const session = this.runtime.sessions.create(client);
    this.emit({
      type: "StudioConnected",
      studioId,
      timestamp: Date.now(),
      data: { sessionId: session.sessionId, projectId },
    });
    return this.mapSession(session);
  }

  disconnect(studioId: string): void {
    this.runtime.bridge.disconnect(studioId);
    this.runtime.sessions.close(studioId);
    this.emit({
      type: "StudioDisconnected",
      studioId,
      timestamp: Date.now(),
      data: {},
    });
  }

  heartbeat(studioId: string): boolean {
    const bridgeOk = this.runtime.bridge.heartbeat(studioId);
    const sessionOk = this.runtime.sessions.recordActivity(studioId);
    return bridgeOk && sessionOk;
  }

  // ─── Synchronization ──────────────────────────────────────────────────

  /**
   * Compatibility path for callers that already hold a real GenerationPackage.
   * The package is recorded into the canonical ArtifactStore and queued through
   * the same v2 command transport used by project synchronization.
   */
  async synchronize(
    studioId: string,
    pkg: GenerationPackage,
  ): Promise<SyncResult> {
    const validation = this.validator.validate(pkg);
    this.emit({
      type: "ImportValidated",
      studioId,
      timestamp: Date.now(),
      data: { valid: validation.valid, errors: validation.errors.length },
    });
    if (!validation.valid) {
      return this.recordFailure(
        studioId,
        validation.errors.join("; "),
        Date.now(),
      );
    }

    if (this.runtime.artifacts.getByPipeline(pkg.packageId).length === 0) {
      if (pkg.scripts.length > 0) {
        await this.runtime.artifacts.store(
          pkg.packageId,
          "LUA_GENERATION",
          "legacy-package-adapter",
          { scripts: pkg.scripts },
        );
      }
      await this.runtime.artifacts.store(
        pkg.packageId,
        "EXPORT",
        "legacy-package-adapter",
        {
          configs: pkg.configs,
          metadata: pkg.metadata,
          validationReport: pkg.validationReport,
        },
      );
    }

    return await this.synchronizeExecution(
      studioId,
      pkg.projectId,
      pkg.packageId,
    );
  }

  async synchronizeExecution(
    studioId: string,
    projectId: string,
    executionId: string,
  ): Promise<SyncResult> {
    const startedAt = Date.now();
    this.emit({
      type: "SyncStarted",
      studioId,
      timestamp: startedAt,
      data: { projectId, executionId },
    });

    const queued = await this.runtime.queueProjectExport(
      studioId,
      projectId,
      executionId,
    );
    if (!queued.success) {
      return this.recordFailure(studioId, queued.message, startedAt);
    }

    const result: SyncResult = {
      success: true,
      sessionId: this.runtime.sessions.getByClient(studioId)?.sessionId ?? "",
      payloadId: queued.data.command?.id ?? "",
      itemsSynced: queued.data.transfer.artifacts.length,
      totalSize: queued.data.transfer.totalSize,
      durationMs: Date.now() - startedAt,
    };
    this.metrics.record(result);
    this.emit({
      type: "SyncCompleted",
      studioId,
      timestamp: Date.now(),
      data: {
        executionId,
        commandId: queued.data.command?.id,
        noChanges: queued.data.noChanges,
        itemsSynced: result.itemsSynced,
        durationMs: result.durationMs,
      },
    });
    return result;
  }

  // ─── Query ────────────────────────────────────────────────────────────

  validatePackage(pkg: GenerationPackage): ImportValidationReport {
    return this.validator.validate(pkg);
  }

  getSession(studioId: string): StudioProjectSession | null {
    const session = this.runtime.sessions.getByClient(studioId);
    return session?.projectId ? this.mapSession(session) : null;
  }

  async getProjectEvidence(
    projectId: string,
  ): Promise<StudioProjectSession | null> {
    const evidence = await this.runtime.getProjectEvidence(projectId);
    return evidence ? this.mapEvidence(evidence) : null;
  }

  getActiveSessions(): StudioProjectSession[] {
    return this.runtime.sessions
      .getActiveSessions()
      .filter(
        (session): session is BridgeSession & { projectId: string } =>
          typeof session.projectId === "string",
      )
      .map((session) => this.mapSession(session));
  }

  getMetrics(): StudioSyncMetricsData {
    return this.metrics.getMetrics();
  }

  getConnectionCount(): number {
    return this.runtime.bridge.getConnectedClients().length;
  }

  getPendingCommandCount(studioId: string): number {
    return this.runtime.bridge.getPendingCommandCount(studioId);
  }

  getArtifactCount(executionId: string): number {
    return this.runtime.artifacts.getByPipeline(executionId).length;
  }

  get protocolVersion(): string {
    return this.runtime.protocolVersion;
  }

  // ─── Events ───────────────────────────────────────────────────────────

  on(listener: StudioEventListener): void {
    this.listeners.push(listener);
  }

  off(listener: StudioEventListener): void {
    this.listeners = this.listeners.filter(
      (registered) => registered !== listener,
    );
  }

  private mapSession(session: BridgeSession): StudioProjectSession {
    const pending = this.runtime.bridge.getPendingCommandCount(
      session.clientId,
    );
    const syncCount = session.syncCount ?? 0;
    const verificationStatus = session.verificationStatus ?? "idle";
    const status =
      verificationStatus === "failed"
        ? "failed"
        : verificationStatus === "verified"
          ? "completed"
          : verificationStatus === "queued" ||
              verificationStatus === "delivered" ||
              verificationStatus === "acknowledged" ||
              pending > 0
            ? "syncing"
            : "idle";

    return {
      sessionId: session.sessionId,
      studioId: session.clientId,
      projectId: session.projectId ?? "",
      packageId: session.lastExecutionId,
      status,
      connectedAt: session.createdAt,
      lastSyncAt: session.lastSyncAt,
      syncCount,
      version: Math.max(1, syncCount + 1),
      artifactVerified: verificationStatus === "verified",
      verificationStatus,
      lastCommandId: session.lastCommandId,
      verifiedExecutionId: session.verifiedExecutionId,
      verifiedArtifactCount: session.verifiedArtifactCount,
      verificationError: session.verificationError,
    };
  }

  private mapEvidence(
    evidence: StudioOperationalEvidence,
  ): StudioProjectSession {
    const verificationStatus = evidence.verificationStatus;
    const status =
      verificationStatus === "failed"
        ? "failed"
        : verificationStatus === "verified"
          ? "completed"
          : verificationStatus === "queued" ||
              verificationStatus === "delivered" ||
              verificationStatus === "acknowledged"
            ? "syncing"
            : "idle";
    return {
      sessionId: `durable-${evidence.projectId}`,
      studioId: evidence.command.clientId,
      projectId: evidence.projectId,
      packageId: evidence.executionId,
      status,
      connectedAt: evidence.lastQueuedAt,
      lastSyncAt: evidence.lastSyncAt,
      syncCount: evidence.syncCount,
      version: evidence.version,
      artifactVerified: verificationStatus === "verified",
      verificationStatus,
      lastCommandId: evidence.command.id,
      verifiedExecutionId: evidence.verifiedExecutionId,
      verifiedArtifactCount: evidence.verifiedArtifactCount,
      verificationError: evidence.verificationError,
    };
  }

  private recordFailure(
    studioId: string,
    error: string,
    startedAt: number,
  ): SyncResult {
    const result: SyncResult = {
      success: false,
      sessionId: this.runtime.sessions.getByClient(studioId)?.sessionId ?? "",
      payloadId: "",
      itemsSynced: 0,
      totalSize: 0,
      durationMs: Date.now() - startedAt,
      error,
    };
    this.metrics.record(result);
    this.emit({
      type: "SyncFailed",
      studioId,
      timestamp: Date.now(),
      data: { error },
    });
    return result;
  }

  private emit(event: StudioEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* non-blocking */
      }
    }
  }
}
