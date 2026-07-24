import type { StorageProvider } from "../../platform/storage/StorageProvider";
import { ArtifactStore } from "../../pipeline/v2/ArtifactStore";
import { StudioBridge } from "./StudioBridge";
import { StudioSessionManager, type BridgeSession } from "./StudioSession";
import {
  createCommandId,
  type StudioClient,
  type StudioCommand,
} from "./StudioTypes";
import { PROTOCOL_VERSION } from "./protocol";
import { ProjectSyncManager } from "./sync/ProjectSyncManager";
import type { TransferResult } from "./sync/ArtifactTransferManager";
import type { ProjectSnapshot, SyncStatus } from "./sync/SyncTypes";

export interface QueuedProjectExport {
  command: StudioCommand;
  snapshot: ProjectSnapshot;
  transfer: TransferResult;
}

export type QueueProjectExportResult =
  | { success: true; data: QueuedProjectExport }
  | {
      success: false;
      reason:
        | "client_not_found"
        | "project_mismatch"
        | "no_artifacts"
        | "payload_exceeded"
        | "queue_unavailable";
      message: string;
    };

export interface StudioRuntimeOptions {
  storage?: StorageProvider;
  artifacts?: ArtifactStore;
  bridge?: StudioBridge;
  sessions?: StudioSessionManager;
}

/**
 * One process-wide composition root for Studio connectivity and artifact sync.
 * It reuses the existing v2 bridge, session manager, artifact store, and sync
 * manager instead of creating parallel runtime state in project routes.
 */
export class StudioRuntime {
  readonly artifacts: ArtifactStore;
  readonly bridge: StudioBridge;
  readonly sessions: StudioSessionManager;
  readonly sync: ProjectSyncManager;
  readonly protocolVersion = PROTOCOL_VERSION;

  private timeoutMonitor?: ReturnType<typeof setInterval>;
  private readonly latestExecutionByProject = new Map<string, string>();

  constructor(options: StudioRuntimeOptions = {}) {
    this.artifacts = options.artifacts ?? new ArtifactStore(options.storage);
    this.bridge = options.bridge ?? new StudioBridge();
    this.sessions = options.sessions ?? new StudioSessionManager();
    this.sync = new ProjectSyncManager(this.artifacts);
  }

  startTimeoutMonitor(intervalMs = 30_000): void {
    if (this.timeoutMonitor) return;
    this.timeoutMonitor = setInterval(() => {
      const expired = this.sessions.checkTimeouts();
      for (const sessionId of expired) {
        console.log(
          `[studio] Session ${sessionId} expired (heartbeat timeout)`,
        );
      }
    }, intervalMs);
    const monitor = this.timeoutMonitor as ReturnType<typeof setInterval> & {
      unref?: () => void;
    };
    monitor.unref?.();
  }

  stopTimeoutMonitor(): void {
    if (!this.timeoutMonitor) return;
    clearInterval(this.timeoutMonitor);
    this.timeoutMonitor = undefined;
  }

  findClient(projectId: string, clientId?: string): StudioClient | null {
    if (clientId) {
      const client = this.bridge.getClient(clientId);
      if (
        !client ||
        client.status !== "connected" ||
        client.projectId !== projectId
      ) {
        return null;
      }
      return client;
    }

    return (
      this.bridge
        .getConnectedClients()
        .find((client) => client.projectId === projectId) ?? null
    );
  }

  findSession(projectId: string, clientId?: string): BridgeSession | null {
    const client = this.findClient(projectId, clientId);
    if (!client) return null;
    const session = this.sessions.getByClient(client.clientId);
    return session?.status === "active" ? session : null;
  }

  getProjectSnapshot(projectOrExecutionId: string): ProjectSnapshot | null {
    const executionId = this.resolveExecutionId(projectOrExecutionId);
    if (!executionId) return null;
    const snapshot = this.sync.getProjectSnapshot(executionId);
    return snapshot && snapshot.artifactCount > 0 ? snapshot : null;
  }

  getSyncStatus(projectOrExecutionId?: string): SyncStatus {
    if (!projectOrExecutionId) return this.sync.getSyncStatus();
    const executionId = this.resolveExecutionId(projectOrExecutionId);
    return this.sync.getSyncStatus(executionId ?? projectOrExecutionId);
  }

  queueProjectExport(
    clientId: string,
    projectId: string,
    executionId: string,
  ): QueueProjectExportResult {
    const client = this.bridge.getClient(clientId);
    if (!client || client.status !== "connected") {
      return {
        success: false,
        reason: "client_not_found",
        message: "Studio client is not connected.",
      };
    }
    if (client.projectId !== projectId) {
      return {
        success: false,
        reason: "project_mismatch",
        message: "Studio client is connected to a different project.",
      };
    }

    const snapshot = this.sync.getProjectSnapshot(executionId);
    if (!snapshot || snapshot.artifactCount === 0) {
      return {
        success: false,
        reason: "no_artifacts",
        message: "No generated artifacts are available for this execution.",
      };
    }

    const transfer = this.sync
      .getTransferManager()
      .transfer(snapshot.artifacts.map((artifact) => artifact.id));
    if (transfer.payloadExceeded) {
      return {
        success: false,
        reason: "payload_exceeded",
        message: "Generated artifacts exceed the Studio transfer limit.",
      };
    }

    const command: StudioCommand = {
      id: createCommandId(),
      type: "EXPORT_PROJECT",
      payload: {
        projectId,
        executionId,
        snapshot,
        artifacts: transfer.artifacts,
        totalSize: transfer.totalSize,
      },
      timestamp: Date.now(),
      status: "pending",
      clientId,
    };

    if (!this.bridge.sendCommand(clientId, command)) {
      return {
        success: false,
        reason: "queue_unavailable",
        message: "Studio command queue is unavailable.",
      };
    }

    this.latestExecutionByProject.set(projectId, executionId);
    this.sessions.recordQueuedExport(
      clientId,
      executionId,
      transfer.artifacts.length,
    );

    return { success: true, data: { command, snapshot, transfer } };
  }

  drainCommands(clientId: string): StudioCommand[] {
    const commands = this.bridge.getCommands(clientId);
    const latestExport = [...commands]
      .reverse()
      .find((command) => command.type === "EXPORT_PROJECT");
    if (latestExport) {
      const executionId = String(latestExport.payload.executionId ?? "");
      const artifactCount = Array.isArray(latestExport.payload.artifacts)
        ? latestExport.payload.artifacts.length
        : 0;
      this.sessions.recordDeliveredExport(clientId, executionId, artifactCount);
    }
    return commands;
  }

  private resolveExecutionId(projectOrExecutionId: string): string | null {
    if (this.artifacts.getByPipeline(projectOrExecutionId).length > 0) {
      return projectOrExecutionId;
    }
    return this.latestExecutionByProject.get(projectOrExecutionId) ?? null;
  }
}

let sharedRuntime: StudioRuntime | null = null;

export function getSharedStudioRuntime(): StudioRuntime {
  sharedRuntime ??= new StudioRuntime();
  return sharedRuntime;
}

export function resetSharedStudioRuntimeForTests(): void {
  sharedRuntime?.stopTimeoutMonitor();
  sharedRuntime = null;
}
