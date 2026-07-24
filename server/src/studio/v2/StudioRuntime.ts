import { ArtifactStore } from "../../pipeline/v2";
import { StudioBridge } from "./StudioBridge";
import {
  StudioSessionManager,
  type BridgeSession,
} from "./StudioSession";
import {
  ProtocolDispatcher,
  ProtocolValidator,
  createResponse,
} from "./protocol";
import {
  ProjectSyncManager,
  type ProjectSnapshot,
  type SyncChange,
} from "./sync";
import {
  createCommandId,
  type StudioClient,
  type StudioCommand,
} from "./StudioTypes";

export interface PreparedStudioSync {
  commandId: string;
  clientId: string;
  sessionId: string;
  projectId: string;
  executionId: string;
  artifactIds: string[];
  artifactCount: number;
  totalSizeBytes: number;
  preparedAt: number;
}

export interface StudioProjectConnection {
  status: "connected" | "disconnected" | "syncing" | "error";
  clientId?: string;
  sessionId?: string;
  studioVersion?: string;
  connectedAt?: number;
  lastHeartbeat?: number;
  executionId?: string;
  artifactCount: number;
  pendingChanges: number;
  preparedAt?: number;
  message: string;
}

/**
 * One runtime for the existing Studio v2 bridge, sessions, protocol handlers,
 * artifact snapshots, and transfer manager. Project routes and plugin routes
 * must resolve this same runtime instead of creating parallel connection state.
 */
export class StudioRuntime {
  readonly bridge: StudioBridge;
  readonly sessions: StudioSessionManager;
  readonly dispatcher: ProtocolDispatcher;
  readonly validator: ProtocolValidator;
  readonly artifactStore: ArtifactStore;
  readonly syncManager: ProjectSyncManager;

  private preparedByClient = new Map<string, PreparedStudioSync>();
  private timeoutTimer?: NodeJS.Timeout;

  constructor(
    options: {
      bridge?: StudioBridge;
      sessions?: StudioSessionManager;
      dispatcher?: ProtocolDispatcher;
      validator?: ProtocolValidator;
      artifactStore?: ArtifactStore;
    } = {},
  ) {
    this.bridge = options.bridge ?? new StudioBridge();
    this.sessions = options.sessions ?? new StudioSessionManager();
    this.dispatcher = options.dispatcher ?? new ProtocolDispatcher();
    this.validator = options.validator ?? new ProtocolValidator();
    this.artifactStore = options.artifactStore ?? new ArtifactStore();
    this.syncManager = new ProjectSyncManager(this.artifactStore);
    this.registerProtocolHandlers();
  }

  startTimeoutMonitor(intervalMs = 30_000): void {
    if (this.timeoutTimer) return;
    this.timeoutTimer = setInterval(() => {
      for (const sessionId of this.sessions.checkTimeouts()) {
        console.log(`[studio] Session ${sessionId} expired (heartbeat timeout)`);
      }
    }, intervalMs);
    this.timeoutTimer.unref?.();
  }

  stopTimeoutMonitor(): void {
    if (!this.timeoutTimer) return;
    clearInterval(this.timeoutTimer);
    this.timeoutTimer = undefined;
  }

  connect(
    studioVersion: string,
    projectId?: string,
  ): {
    client: StudioClient;
    session: BridgeSession;
  } {
    const client = this.bridge.connect(studioVersion, projectId);
    const session = this.sessions.create(client);
    return { client, session };
  }

  disconnect(clientId: string): boolean {
    this.bridge.disconnect(clientId);
    this.preparedByClient.delete(clientId);
    return this.sessions.close(clientId);
  }

  heartbeat(clientId: string): boolean {
    const bridgeOk = this.bridge.heartbeat(clientId);
    const sessionOk = this.sessions.recordActivity(clientId);
    return bridgeOk && sessionOk;
  }

  findProjectSession(
    projectId: string,
    clientId?: string,
  ): BridgeSession | null {
    if (clientId) {
      const session = this.sessions.getByClient(clientId);
      return session?.status === "active" && session.projectId === projectId
        ? session
        : null;
    }

    return (
      this.sessions
        .getActiveSessions()
        .find((session) => session.projectId === projectId) ?? null
    );
  }

  getProjectConnection(
    projectId: string,
    executionId?: string,
    clientId?: string,
  ): StudioProjectConnection {
    const session = this.findProjectSession(projectId, clientId);
    const snapshot = executionId
      ? this.syncManager.getProjectSnapshot(executionId)
      : null;

    if (!session) {
      return {
        status: "disconnected",
        executionId,
        artifactCount: snapshot?.artifactCount ?? 0,
        pendingChanges: snapshot?.artifactCount ?? 0,
        message: "No active Studio v2 session is connected to this project.",
      };
    }

    const client = this.bridge.getClient(session.clientId);
    const prepared = this.preparedByClient.get(session.clientId);
    return {
      status: prepared ? "syncing" : "connected",
      clientId: session.clientId,
      sessionId: session.sessionId,
      studioVersion: session.studioVersion,
      connectedAt: client?.connectedAt ?? session.createdAt,
      lastHeartbeat: client?.lastHeartbeat ?? session.lastActivity,
      executionId: prepared?.executionId ?? executionId,
      artifactCount: snapshot?.artifactCount ?? prepared?.artifactCount ?? 0,
      pendingChanges: prepared?.artifactCount ?? snapshot?.artifactCount ?? 0,
      preparedAt: prepared?.preparedAt,
      message: prepared
        ? "A real artifact snapshot is prepared for plugin retrieval. Import acknowledgement is pending."
        : "Roblox Studio is connected through the shared v2 runtime.",
    };
  }

  prepareProjectSync(
    projectId: string,
    executionId: string,
    clientId?: string,
  ): PreparedStudioSync | null {
    const session = this.findProjectSession(projectId, clientId);
    if (!session) return null;

    const snapshot = this.syncManager.getProjectSnapshot(executionId);
    if (!snapshot || snapshot.artifacts.length === 0) return null;

    const preparedAt = Date.now();
    const artifactIds = snapshot.artifacts.map((artifact) => artifact.id);
    const command: StudioCommand = {
      id: createCommandId(),
      type: "EXPORT_PROJECT",
      clientId: session.clientId,
      timestamp: preparedAt,
      status: "pending",
      payload: {
        projectId,
        executionId,
        artifactIds,
        snapshotVersion: snapshot.version,
      },
    };
    this.bridge.sendCommand(session.clientId, command);

    const prepared: PreparedStudioSync = {
      commandId: command.id,
      clientId: session.clientId,
      sessionId: session.sessionId,
      projectId,
      executionId,
      artifactIds,
      artifactCount: snapshot.artifactCount,
      totalSizeBytes: snapshot.artifacts.reduce(
        (total, artifact) => total + artifact.size,
        0,
      ),
      preparedAt,
    };
    this.preparedByClient.set(session.clientId, prepared);
    return prepared;
  }

  getPendingCommands(clientId: string): StudioCommand[] {
    return this.bridge.getCommands(clientId);
  }

  getPreparedSync(clientId: string): PreparedStudioSync | undefined {
    return this.preparedByClient.get(clientId);
  }

  getProjectSnapshot(executionId: string): ProjectSnapshot | null {
    return this.syncManager.getProjectSnapshot(executionId);
  }

  private registerProtocolHandlers(): void {
    this.dispatcher.register("GET_PROJECT", (msg) => {
      const { projectId } = msg.payload;
      if (!projectId || typeof projectId !== "string") {
        return createResponse(msg, "error", {}, "Missing projectId in payload");
      }
      const snapshot = this.syncManager.getProjectSnapshot(projectId);
      return snapshot
        ? createResponse(
            msg,
            "ok",
            snapshot as unknown as Record<string, unknown>,
          )
        : createResponse(msg, "error", {}, "Project not found");
    });

    this.dispatcher.register("GET_ARTIFACTS", (msg) => {
      const { artifactIds } = msg.payload;
      if (!Array.isArray(artifactIds) || artifactIds.length === 0) {
        return createResponse(
          msg,
          "error",
          {},
          "artifactIds array is required",
        );
      }
      const result = this.syncManager
        .getTransferManager()
        .transfer(artifactIds as string[]);
      return result.payloadExceeded
        ? createResponse(
            msg,
            "error",
            { transferred: result.artifacts.length, missing: result.missing },
            "Payload size limit exceeded. Request fewer artifacts.",
          )
        : createResponse(
            msg,
            "ok",
            result as unknown as Record<string, unknown>,
          );
    });

    this.dispatcher.register("SYNC_REQUEST", (msg) => {
      const { projectId, changes } = msg.payload;
      if (!projectId || typeof projectId !== "string") {
        return createResponse(msg, "error", {}, "Missing projectId");
      }
      if (!Array.isArray(changes)) {
        return createResponse(msg, "error", {}, "Missing changes array");
      }
      const result = this.syncManager.processSyncRequest(
        projectId,
        changes as SyncChange[],
      );
      return createResponse(
        msg,
        result.status === "error" ? "error" : "ok",
        result as unknown as Record<string, unknown>,
      );
    });

    this.dispatcher.register("VALIDATE", (msg) => {
      const { projectId, changes } = msg.payload;
      if (!projectId || typeof projectId !== "string") {
        return createResponse(msg, "error", {}, "Missing projectId");
      }
      if (!Array.isArray(changes)) {
        return createResponse(msg, "error", {}, "Missing changes array");
      }
      const result = this.syncManager.validateOnly(
        projectId,
        changes as SyncChange[],
      );
      return createResponse(
        msg,
        result.valid ? "ok" : "error",
        result as unknown as Record<string, unknown>,
      );
    });
  }
}

let sharedStudioRuntime: StudioRuntime | undefined;

export function getStudioRuntime(): StudioRuntime {
  sharedStudioRuntime ??= new StudioRuntime();
  return sharedStudioRuntime;
}
