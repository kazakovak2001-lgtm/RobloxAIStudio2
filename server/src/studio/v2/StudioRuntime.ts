import {
  ArtifactStore,
  type ArtifactStorageProvider,
} from "../../pipeline/v2/ArtifactStore";
import { StudioBridge } from "./StudioBridge";
import {
  createConfiguredStudioEvidenceStore,
  type StudioEvidenceStore,
  type StudioOperationalEvidence,
} from "./StudioEvidenceStore";
import { StudioSessionManager, type BridgeSession } from "./StudioSession";
import {
  createCommandId,
  type StudioArtifactReceipt,
  type StudioClient,
  type StudioCommand,
  type StudioCommandResult,
} from "./StudioTypes";
import { PROTOCOL_VERSION } from "./protocol";
import {
  UI_TREE_SCHEMA_VERSION,
  expectedScreenInstancePath,
  isMaterializableUITreeCandidate,
} from "../../ui-gen/UIInstanceTreeContract";
import { ProjectSyncManager } from "./sync/ProjectSyncManager";
import type { TransferResult } from "./sync/ArtifactTransferManager";
import type {
  ProjectSnapshot,
  SyncChange,
  SyncResult,
  SyncStatus,
} from "./sync/SyncTypes";
import type { ValidationResult } from "./sync/SyncValidator";

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
  storage?: ArtifactStorageProvider;
  artifacts?: ArtifactStore;
  bridge?: StudioBridge;
  sessions?: StudioSessionManager;
  evidence?: StudioEvidenceStore;
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
  readonly evidence: StudioEvidenceStore;
  readonly protocolVersion = PROTOCOL_VERSION;

  private timeoutMonitor?: ReturnType<typeof setInterval>;
  private readonly latestExecutionByProject = new Map<string, string>();
  private readonly exportSignatureByClient = new Map<string, string>();
  private readiness?: Promise<void>;

  constructor(options: StudioRuntimeOptions = {}) {
    this.artifacts = options.artifacts ?? new ArtifactStore(options.storage);
    this.bridge = options.bridge ?? new StudioBridge();
    this.sessions = options.sessions ?? new StudioSessionManager();
    this.evidence = options.evidence ?? createConfiguredStudioEvidenceStore();
    this.sync = new ProjectSyncManager(this.artifacts);
  }

  async ready(): Promise<void> {
    this.readiness ??= this.evidence.ready();
    await this.readiness;
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

  activateProjectExecution(projectId: string, executionId: string): void {
    if (!projectId.trim() || !executionId.trim()) {
      throw new Error("projectId and executionId are required");
    }
    this.latestExecutionByProject.set(projectId, executionId);
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

  transferProjectArtifacts(
    projectOrExecutionId: string,
    artifactIds: string[],
  ): TransferResult | null {
    const executionId = this.resolveExecutionId(projectOrExecutionId);
    if (!executionId) return null;
    return this.sync
      .getTransferManager()
      .transferForPipeline(executionId, artifactIds);
  }

  async processProjectSyncRequest(
    projectOrExecutionId: string,
    changes: SyncChange[],
  ): Promise<SyncResult | null> {
    const executionId = this.resolveExecutionId(projectOrExecutionId);
    if (!executionId) return null;
    return this.sync.processSyncRequest(executionId, changes);
  }

  validateProjectChanges(
    projectOrExecutionId: string,
    changes: SyncChange[],
  ): ValidationResult | null {
    const executionId = this.resolveExecutionId(projectOrExecutionId);
    if (!executionId) return null;
    return this.sync.validateOnly(executionId, changes);
  }

  async getCommand(commandId: string): Promise<StudioCommand | null> {
    await this.ready();
    await this.evidence.refresh();
    return this.evidence.getCommand(commandId)?.command ?? null;
  }

  async getProjectEvidence(
    projectId: string,
  ): Promise<StudioOperationalEvidence | null> {
    await this.ready();
    await this.evidence.refresh();
    return this.evidence.getLatestByProject(projectId);
  }

  async reconcileClient(clientId: string, projectId?: string): Promise<void> {
    if (!projectId) return;
    const evidence = await this.getProjectEvidence(projectId);
    if (!evidence) return;
    this.sessions.applyEvidence(clientId, evidence);
  }

  async queueProjectExport(
    clientId: string,
    projectId: string,
    executionId: string,
  ): Promise<QueueProjectExportResult> {
    await this.ready();
    await this.evidence.refresh();
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

    this.activateProjectExecution(projectId, executionId);

    const signature = this.createSnapshotSignature(snapshot);
    const session = this.sessions.getByClient(clientId);
    const previousEvidence = this.evidence.getLatestByProject(projectId);
    const previousSignature =
      (session?.syncCount ?? 0) > 0 &&
      previousEvidence?.command.clientId === clientId &&
      previousEvidence.verificationStatus !== "failed"
        ? previousEvidence.snapshotSignature
        : this.exportSignatureByClient.get(clientId);
    if (previousSignature === signature) {
      if (!previousEvidence) {
        return {
          success: false,
          reason: "queue_unavailable",
          message: "Studio evidence is unavailable. Refresh and retry.",
        };
      }
      const noChanges = structuredClone(previousEvidence);
      noChanges.version += 1;
      noChanges.syncCount += 1;
      noChanges.executionId = executionId;
      noChanges.snapshotSignature = signature;
      if (!(await this.evidence.saveTransition(noChanges, "no_changes"))) {
        return {
          success: false,
          reason: "queue_unavailable",
          message:
            "Studio command state changed concurrently. Refresh and retry.",
        };
      }
      this.sessions.applyEvidence(clientId, noChanges);
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

    if (!this.bridge.canSendCommand(clientId)) {
      return {
        success: false,
        reason: "queue_unavailable",
        message: "Studio command queue is unavailable.",
      };
    }

    command.status = "sent";
    const evidence: StudioOperationalEvidence = {
      command,
      projectId,
      executionId,
      artifactCount: transfer.artifacts.length,
      snapshotSignature: signature,
      version: (previousEvidence?.version ?? 0) + 1,
      syncCount: (previousEvidence?.syncCount ?? 0) + 1,
      verificationStatus: "queued",
      lastQueuedAt: Date.now(),
    };
    if (
      !(await this.evidence.saveTransition(evidence, `queued:${command.id}`))
    ) {
      return {
        success: false,
        reason: "queue_unavailable",
        message:
          "Studio command state changed concurrently. Refresh and retry.",
      };
    }

    this.bridge.publishCommand(command, true);
    this.exportSignatureByClient.set(clientId, signature);
    this.sessions.applyEvidence(clientId, evidence);

    return {
      success: true,
      data: { command, snapshot, transfer, noChanges: false },
    };
  }

  async drainCommands(clientId: string): Promise<StudioCommand[]> {
    await this.ready();
    const commands = this.bridge.peekCommands(clientId);
    const deliveredCommands: StudioCommand[] = [];
    for (const command of commands) {
      await this.evidence.refresh();
      const current = this.evidence.getCommand(command.id);
      const latest = current
        ? this.evidence.getLatestByProject(current.projectId)
        : null;
      if (
        !current ||
        current.command.clientId !== clientId ||
        current.command.status !== "sent" ||
        current.command.deliveredAt ||
        latest?.command.id !== current.command.id
      ) {
        if (current?.command.deliveredAt) {
          this.bridge.publishCommand(current.command);
          this.bridge.removeQueuedCommand(clientId, command.id);
          this.sessions.applyEvidence(clientId, current);
        }
        continue;
      }
      const delivered = structuredClone(current);
      delivered.version = (latest?.version ?? 0) + 1;
      delivered.command.deliveredAt = Date.now();
      delivered.lastDeliveredAt = delivered.command.deliveredAt;
      delivered.verificationStatus = "delivered";
      if (
        !(await this.evidence.saveTransition(
          delivered,
          `delivered:${command.id}`,
        ))
      ) {
        const winner = this.evidence.getCommand(command.id);
        if (winner?.command.deliveredAt) {
          this.bridge.publishCommand(winner.command);
          this.bridge.removeQueuedCommand(clientId, command.id);
          this.sessions.applyEvidence(clientId, winner);
        }
        continue;
      }
      this.bridge.publishCommand(delivered.command);
      this.bridge.removeQueuedCommand(clientId, command.id);
      this.sessions.applyEvidence(clientId, delivered);
      deliveredCommands.push(delivered.command);
    }
    return deliveredCommands;
  }

  async acknowledgeProjectExport(
    clientId: string,
    commandId: string,
  ): Promise<StudioCommandActionResult> {
    await this.ready();
    await this.evidence.refresh();
    const current = this.evidence.getCommand(commandId);
    const command = current?.command ?? null;
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

    if (command.status === "acknowledged") {
      return { success: true, command, verified: false };
    }
    if (command.status !== "sent" || !current) {
      return {
        success: false,
        reason: "invalid_status",
        message: `Cannot mark command acknowledged from status ${command.status}.`,
        command,
      };
    }
    const latest = this.evidence.getLatestByProject(current.projectId);
    if (latest?.command.id !== commandId) {
      return {
        success: false,
        reason: "invalid_status",
        message: "A newer Studio export superseded this command.",
        command,
      };
    }
    const acknowledged = structuredClone(current);
    acknowledged.version = latest.version + 1;
    acknowledged.command.status = "acknowledged";
    acknowledged.command.acknowledgedAt = Date.now();
    acknowledged.lastAcknowledgedAt = acknowledged.command.acknowledgedAt;
    acknowledged.verificationStatus = "acknowledged";
    if (
      !(await this.evidence.saveTransition(
        acknowledged,
        `acknowledged:${commandId}`,
      ))
    ) {
      const winner = this.evidence.getCommand(commandId)?.command;
      if (winner?.status === "acknowledged") {
        return { success: true, command: winner, verified: false };
      }
      return {
        success: false,
        reason: "invalid_status",
        message: "Studio command state changed concurrently.",
        command: winner,
      };
    }
    this.bridge.publishCommand(acknowledged.command);
    this.sessions.applyEvidence(clientId, acknowledged);
    const executionId = acknowledged.executionId;
    const projectId = acknowledged.projectId;
    this.bridge.events.emit({
      type: "export.started",
      clientId,
      projectId,
      timestamp: Date.now(),
      data: { commandId, executionId },
    });
    return { success: true, command: acknowledged.command, verified: false };
  }

  async reportProjectExport(
    clientId: string,
    commandId: string,
    input: StudioImportReportInput,
  ): Promise<StudioCommandActionResult> {
    await this.ready();
    await this.evidence.refresh();
    const current = this.evidence.getCommand(commandId);
    const command = current?.command ?? null;
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

    if (!current) {
      return {
        success: false,
        reason: "command_not_found",
        message: "Studio command was not found.",
      };
    }
    const latest = this.evidence.getLatestByProject(current.projectId);
    if (latest?.command.id !== commandId) {
      return {
        success: false,
        reason: "invalid_status",
        message: "A newer Studio export superseded this command.",
        command,
      };
    }

    const executionId = current.executionId;
    const projectId = current.projectId;
    const reportedArtifacts = input.artifacts ?? [];

    if (input.status === "failed") {
      const error = input.error?.trim() || "Roblox Studio import failed.";
      const result = this.createCommandResult(input, reportedArtifacts, error);
      const failed = this.createTerminalEvidence(current, result, error);
      if (
        !(await this.evidence.saveTransition(failed, `terminal:${commandId}`))
      ) {
        return this.concurrentTerminalResult(commandId);
      }
      this.bridge.publishCommand(failed.command);
      this.exportSignatureByClient.delete(clientId);
      this.sessions.applyEvidence(clientId, failed);
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
      const failed = this.createTerminalEvidence(
        current,
        result,
        verificationError,
      );
      if (
        !(await this.evidence.saveTransition(failed, `terminal:${commandId}`))
      ) {
        return this.concurrentTerminalResult(commandId);
      }
      this.bridge.publishCommand(failed.command);
      this.exportSignatureByClient.delete(clientId);
      this.sessions.applyEvidence(clientId, failed);
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
    const completed = this.createTerminalEvidence(current, result);
    if (
      !(await this.evidence.saveTransition(completed, `terminal:${commandId}`))
    ) {
      return this.concurrentTerminalResult(commandId);
    }
    this.bridge.publishCommand(completed.command);
    this.sessions.applyEvidence(clientId, completed);
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

  private createTerminalEvidence(
    current: StudioOperationalEvidence,
    result: StudioCommandResult,
    error?: string,
  ): StudioOperationalEvidence {
    const terminal = structuredClone(current);
    terminal.version += 1;
    terminal.command.status = error ? "failed" : "completed";
    terminal.command.completedAt = Date.now();
    terminal.command.result = result;
    terminal.command.error = error;
    if (error) {
      terminal.verificationStatus = "failed";
      terminal.verificationError = error;
      return terminal;
    }
    terminal.verificationStatus = "verified";
    terminal.verificationError = undefined;
    terminal.lastSyncAt = terminal.command.completedAt;
    terminal.lastVerifiedAt = terminal.command.completedAt;
    terminal.verifiedExecutionId = terminal.executionId;
    terminal.verifiedArtifactCount = result.artifacts.length;
    return terminal;
  }

  private concurrentTerminalResult(
    commandId: string,
  ): StudioCommandActionResult {
    const winner = this.evidence.getCommand(commandId)?.command;
    if (winner?.status === "completed") {
      return { success: true, command: winner, verified: true };
    }
    if (winner?.status === "failed") {
      return { success: true, command: winner, verified: false };
    }
    return {
      success: false,
      reason: "invalid_status",
      message: "Studio command state changed concurrently.",
      command: winner,
    };
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
      const screenError = this.verifyScreenReceipt(expected.id, receipt);
      if (screenError) return screenError;
    }
    return null;
  }

  /**
   * Verify the `{ screenName, instancePath }` pairs for a materialized UI tree.
   *
   * The expected screen set comes from the stored artifact content, which the
   * backend already knows, so the plugin cannot define its own success
   * criteria. Missing, extra, duplicate and path-mismatched screens are each
   * rejected.
   *
   * Only artifacts that positively resolve to a versioned UI tree carry this
   * requirement. An artifact absent from the store imposes none, because the
   * expectation cannot be computed — its hash was still checked above.
   */
  private verifyScreenReceipt(
    artifactId: string,
    receipt: StudioArtifactReceipt,
  ): string | null {
    const stored = this.artifacts.getById(artifactId);
    const content = stored?.content;
    if (!isMaterializableUITreeCandidate(content)) return null;

    const tree = content as { schemaVersion?: unknown; screens?: unknown };
    if (tree.schemaVersion !== UI_TREE_SCHEMA_VERSION) return null;
    if (!Array.isArray(tree.screens)) return null;

    const expectedNames = tree.screens
      .map((screen) =>
        typeof (screen as { screenName?: unknown })?.screenName === "string"
          ? (screen as { screenName: string }).screenName
          : null,
      )
      .filter((name): name is string => name !== null);

    if (!Array.isArray(receipt.screens)) {
      return `Artifact ${artifactId} materialized a UI tree but reported no screen receipts.`;
    }

    const seen = new Set<string>();
    for (const screen of receipt.screens) {
      if (
        typeof screen?.screenName !== "string" ||
        typeof screen?.instancePath !== "string"
      ) {
        return `Artifact ${artifactId} reported a malformed screen receipt.`;
      }
      if (seen.has(screen.screenName)) {
        return `Artifact ${artifactId} reported duplicate screen receipt ${screen.screenName}.`;
      }
      seen.add(screen.screenName);

      if (!expectedNames.includes(screen.screenName)) {
        return `Artifact ${artifactId} reported an unexpected screen ${screen.screenName}.`;
      }

      const expectedPath = expectedScreenInstancePath(
        stored!.stage,
        screen.screenName,
      );
      if (screen.instancePath !== expectedPath) {
        return `Artifact ${artifactId} reported screen ${screen.screenName} at ${screen.instancePath} instead of ${expectedPath}.`;
      }
    }

    for (const name of expectedNames) {
      if (!seen.has(name)) {
        return `Artifact ${artifactId} is missing a receipt for screen ${name}.`;
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
