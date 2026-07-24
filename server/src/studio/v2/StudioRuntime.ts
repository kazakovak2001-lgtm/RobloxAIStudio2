import type { StorageProvider } from "../../platform/storage/StorageProvider";
import { ArtifactStore } from "../../pipeline/v2/ArtifactStore";
import { StudioBridge } from "./StudioBridge";
import { StudioSessionManager, type BridgeSession } from "./StudioSession";
import {
  createCommandId,
  type StudioArtifactReceipt,
  type StudioClient,
  type StudioCommand,
  type StudioCommandResult,
} from "./StudioTypes";
import { PROTOCOL_VERSION } from "./protocol";
import { ProjectSyncManager } from "./sync/ProjectSyncManager";
import type { TransferResult } from "./sync/ArtifactTransferManager";
import type { ProjectSnapshot, SyncStatus } from "./sync/SyncTypes";

export interface QueuedProjectExport {
  command: StudioCommand | null;
  snapshot: ProjectSnapshot;
  transfer: TransferResult;
  noChanges: boolean;
}

export interface StudioImportReportInput {
  status: "completed" | "failed";
  executionId: string;
  artifacts?: StudioArtifactReceipt[];
  error?: string;
  reportedAt?: number;
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

export type StudioCommandActionResult =
  | { success: true; command: StudioCommand; verified: boolean }
  | {
      success: false;
      reason:
        | "command_not_found"
        | "client_mismatch"
        | "invalid_command"
        | "invalid_status"
        | "not_delivered"
        | "verification_failed";
      message: string;
      command?: StudioCommand;
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
  private readonly exportSignatureByClient = new Map<string, string>();

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

  getCommand(commandId: string): StudioCommand | null {
    return this.bridge.getCommand(commandId);
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

    const signature = this.createSnapshotSignature(snapshot);
    const session = this.sessions.getByClient(clientId);
    const previousSignature =
      (session?.syncCount ?? 0) > 0
        ? this.exportSignatureByClient.get(clientId)
        : undefined;
    this.latestExecutionByProject.set(projectId, executionId);

    if (previousSignature === signature) {
      this.sessions.recordNoopExport(clientId, executionId);
      return {
        success: true,
        data: {
          command: null,
          snapshot,
          transfer: {
            artifacts: [],
            missing: [],
            totalSize: 0,
            payloadExceeded: false,
          },
          noChanges: true,
        },
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

    this.exportSignatureByClient.set(clientId, signature);
    this.sessions.recordQueuedExport(
      clientId,
      executionId,
      transfer.artifacts.length,
      command.id,
    );

    return {
      success: true,
      data: { command, snapshot, transfer, noChanges: false },
    };
  }

  drainCommands(clientId: string): StudioCommand[] {
    const commands = this.bridge.getCommands(clientId);
    for (const command of commands) {
      const delivered = this.bridge.markCommandDelivered(clientId, command.id);
      if (!delivered.success || command.type !== "EXPORT_PROJECT") continue;
      const executionId = String(command.payload.executionId ?? "");
      const artifactCount = Array.isArray(command.payload.artifacts)
        ? command.payload.artifacts.length
        : 0;
      this.sessions.recordDeliveredExport(
        clientId,
        executionId,
        artifactCount,
        command.id,
      );
    }
    return commands;
  }

  acknowledgeProjectExport(
    clientId: string,
    commandId: string,
  ): StudioCommandActionResult {
    const command = this.bridge.getCommand(commandId);
    const valid = this.validateExportCommand(clientId, command);
    if (!valid.success) return valid;
    if (!command?.deliveredAt) {
      return {
        success: false,
        reason: "not_delivered",
        message: "Studio command must be polled before acknowledgement.",
        command: command ?? undefined,
      };
    }

    const acknowledged = this.bridge.acknowledgeCommand(clientId, commandId);
    if (!acknowledged.success) return acknowledged;
    const executionId = String(acknowledged.command.payload.executionId ?? "");
    const projectId = String(acknowledged.command.payload.projectId ?? "");
    this.sessions.recordAcknowledgedExport(clientId, commandId, executionId);
    this.bridge.events.emit({
      type: "export.started",
      clientId,
      projectId,
      timestamp: Date.now(),
      data: { commandId, executionId },
    });
    return { success: true, command: acknowledged.command, verified: false };
  }

  reportProjectExport(
    clientId: string,
    commandId: string,
    input: StudioImportReportInput,
  ): StudioCommandActionResult {
    const command = this.bridge.getCommand(commandId);
    const valid = this.validateExportCommand(clientId, command);
    if (!valid.success) return valid;
    if (command?.status !== "acknowledged") {
      return {
        success: false,
        reason: "invalid_status",
        message:
          "Studio command must be acknowledged before reporting a result.",
        command: command ?? undefined,
      };
    }

    const executionId = String(command.payload.executionId ?? "");
    const projectId = String(command.payload.projectId ?? "");
    const reportedArtifacts = input.artifacts ?? [];

    if (input.status === "failed") {
      const error = input.error?.trim() || "Roblox Studio import failed.";
      const result = this.createCommandResult(input, reportedArtifacts, error);
      const failed = this.bridge.failCommand(clientId, commandId, result);
      if (!failed.success) return failed;
      this.exportSignatureByClient.delete(clientId);
      this.sessions.recordFailedExport(clientId, commandId, executionId, error);
      this.bridge.events.emit({
        type: "export.failed",
        clientId,
        projectId,
        timestamp: Date.now(),
        data: { commandId, executionId, error },
      });
      return { success: true, command: failed.command, verified: false };
    }

    const verificationError = this.verifyImportEvidence(
      command,
      input.executionId,
      reportedArtifacts,
    );
    if (verificationError) {
      const result = this.createCommandResult(
        { ...input, status: "failed" },
        reportedArtifacts,
        verificationError,
      );
      const failed = this.bridge.failCommand(clientId, commandId, result);
      if (!failed.success) return failed;
      this.exportSignatureByClient.delete(clientId);
      this.sessions.recordFailedExport(
        clientId,
        commandId,
        executionId,
        verificationError,
      );
      this.bridge.events.emit({
        type: "export.failed",
        clientId,
        projectId,
        timestamp: Date.now(),
        data: { commandId, executionId, error: verificationError },
      });
      return {
        success: false,
        reason: "verification_failed",
        message: verificationError,
        command: failed.command,
      };
    }

    const result = this.createCommandResult(input, reportedArtifacts);
    const completed = this.bridge.completeCommand(clientId, commandId, result);
    if (!completed.success) return completed;
    this.sessions.recordVerifiedExport(
      clientId,
      commandId,
      executionId,
      reportedArtifacts.length,
    );
    this.bridge.events.emit({
      type: "export.completed",
      clientId,
      projectId,
      timestamp: Date.now(),
      data: {
        commandId,
        executionId,
        artifactCount: reportedArtifacts.length,
      },
    });
    return { success: true, command: completed.command, verified: true };
  }

  private createSnapshotSignature(snapshot: ProjectSnapshot): string {
    return snapshot.artifacts
      .map((artifact) => `${artifact.id}:${artifact.hash}`)
      .sort()
      .join("|");
  }

  private validateExportCommand(
    clientId: string,
    command: StudioCommand | null,
  ): StudioCommandActionResult | { success: true } {
    if (!command) {
      return {
        success: false,
        reason: "command_not_found",
        message: "Studio command was not found.",
      };
    }
    if (command.clientId !== clientId) {
      return {
        success: false,
        reason: "client_mismatch",
        message: "Studio command belongs to a different client.",
        command,
      };
    }
    if (command.type !== "EXPORT_PROJECT") {
      return {
        success: false,
        reason: "invalid_command",
        message: "Only EXPORT_PROJECT commands support import verification.",
        command,
      };
    }
    return { success: true };
  }

  private verifyImportEvidence(
    command: StudioCommand,
    reportedExecutionId: string,
    receipts: StudioArtifactReceipt[],
  ): string | null {
    const expectedExecutionId = String(command.payload.executionId ?? "");
    if (!reportedExecutionId || reportedExecutionId !== expectedExecutionId) {
      return "Reported execution ID does not match the queued export.";
    }

    const snapshot = command.payload.snapshot as ProjectSnapshot | undefined;
    if (!snapshot || !Array.isArray(snapshot.artifacts)) {
      return "Queued export does not contain a valid artifact snapshot.";
    }
    if (receipts.length !== snapshot.artifacts.length) {
      return `Expected ${snapshot.artifacts.length} artifact receipts but received ${receipts.length}.`;
    }

    const reportedById = new Map(
      receipts.map((receipt) => [receipt.artifactId, receipt]),
    );
    if (reportedById.size !== receipts.length) {
      return "Artifact receipts contain duplicate artifact IDs.";
    }

    for (const expected of snapshot.artifacts) {
      const receipt = reportedById.get(expected.id);
      if (!receipt) {
        return `Missing receipt for artifact ${expected.id}.`;
      }
      if (receipt.hash !== expected.hash) {
        return `Artifact hash mismatch for ${expected.id}.`;
      }
    }
    return null;
  }

  private createCommandResult(
    input: StudioImportReportInput,
    artifacts: StudioArtifactReceipt[],
    error?: string,
  ): StudioCommandResult {
    return {
      status: error ? "failed" : input.status,
      executionId: input.executionId,
      artifacts,
      error,
      reportedAt: input.reportedAt,
      receivedAt: Date.now(),
    };
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
