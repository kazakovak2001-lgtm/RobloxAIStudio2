/**
 * Studio Bridge API — connection management and status.
 */

import { Router, type Response } from "express";
import { ArtifactStore } from "../pipeline/v2";
import { DurableStorageError } from "../platform/storage/StorageProvider";
import {
  getSharedStudioRuntime,
  StudioRuntime,
  type StudioCommandActionResult,
  type StudioImportReportInput,
} from "../studio/v2/StudioRuntime";
import type {
  StudioArtifactReceipt,
  StudioScreenReceipt,
} from "../studio/v2/StudioTypes";
import type { SyncChange } from "../studio/v2/sync/SyncTypes";
import { STUDIO_PROJECT_ACCESS_CAPABILITY } from "../platform/security/ApiKeyStore";
import type { ProjectAccessControl } from "./projects";
import {
  ProtocolDispatcher,
  ProtocolValidator,
  PROTOCOL_VERSION,
  createResponse,
} from "../studio/v2/protocol";

interface ParsedImportReport {
  data?: StudioImportReportInput;
  error?: string;
}

type ParsedSyncChanges =
  { data: SyncChange[]; error?: never } | { data?: never; error: string };

function parseSyncChanges(value: unknown): ParsedSyncChanges {
  if (!Array.isArray(value)) {
    return { error: "changes must be an array" };
  }

  const data: SyncChange[] = [];
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { error: `changes[${index}] must be an object` };
    }
    const change = item as Record<string, unknown>;
    if (typeof change.changeId !== "string" || !change.changeId.trim()) {
      return { error: `changes[${index}].changeId must be a non-empty string` };
    }
    if (typeof change.artifactId !== "string" || !change.artifactId.trim()) {
      return {
        error: `changes[${index}].artifactId must be a non-empty string`,
      };
    }
    if (
      typeof change.artifactType !== "string" ||
      !change.artifactType.trim()
    ) {
      return {
        error: `changes[${index}].artifactType must be a non-empty string`,
      };
    }
    if (
      change.changeType !== "create" &&
      change.changeType !== "update" &&
      change.changeType !== "delete"
    ) {
      return {
        error: `changes[${index}].changeType must be create, update, or delete`,
      };
    }
    if (
      typeof change.timestamp !== "number" ||
      !Number.isFinite(change.timestamp) ||
      change.timestamp <= 0
    ) {
      return { error: `changes[${index}].timestamp must be a positive number` };
    }
    data.push({
      changeId: change.changeId,
      artifactId: change.artifactId,
      artifactType: change.artifactType,
      changeType: change.changeType,
      content: change.content,
      timestamp: change.timestamp,
    });
  }

  return { data };
}

/**
 * Exported for contract testing. Both the REST result endpoint and the
 * `COMMAND_RESULT` protocol handler funnel through this parser, so a field it
 * fails to carry is a field the runtime never sees regardless of transport.
 */
export function parseImportReport(
  payload: Record<string, unknown>,
): ParsedImportReport {
  const status = payload.status;
  if (status !== "completed" && status !== "failed") {
    return { error: "status must be completed or failed" };
  }
  if (!payload.executionId || typeof payload.executionId !== "string") {
    return { error: "executionId is required" };
  }
  if (
    payload.reportedAt !== undefined &&
    typeof payload.reportedAt !== "number"
  ) {
    return { error: "reportedAt must be a number" };
  }
  if (payload.error !== undefined && typeof payload.error !== "string") {
    return { error: "error must be a string" };
  }
  if (status === "completed" && !Array.isArray(payload.artifacts)) {
    return { error: "artifacts array is required for completed results" };
  }
  if (payload.artifacts !== undefined && !Array.isArray(payload.artifacts)) {
    return { error: "artifacts must be an array" };
  }

  const artifacts: StudioArtifactReceipt[] = [];
  for (const item of payload.artifacts ?? []) {
    if (!item || typeof item !== "object") {
      return { error: "each artifact receipt must be an object" };
    }
    const receipt = item as Record<string, unknown>;
    if (!receipt.artifactId || typeof receipt.artifactId !== "string") {
      return { error: "each artifact receipt requires artifactId" };
    }
    if (!receipt.hash || typeof receipt.hash !== "string") {
      return { error: "each artifact receipt requires hash" };
    }
    if (
      receipt.instancePath !== undefined &&
      typeof receipt.instancePath !== "string"
    ) {
      return { error: "artifact instancePath must be a string" };
    }

    // Screen receipts must survive the transport boundary. This parser
    // reconstructs each receipt field by field, so anything not named here is
    // silently dropped — which would leave every real UI export arriving with
    // no screens and failing verification.
    let screens: StudioScreenReceipt[] | undefined;
    if (receipt.screens !== undefined) {
      if (!Array.isArray(receipt.screens)) {
        return { error: "artifact screens must be an array" };
      }
      screens = [];
      for (const entry of receipt.screens) {
        if (!entry || typeof entry !== "object") {
          return { error: "each screen receipt must be an object" };
        }
        const screen = entry as Record<string, unknown>;
        if (typeof screen.screenName !== "string" || !screen.screenName) {
          return { error: "each screen receipt requires screenName" };
        }
        if (typeof screen.instancePath !== "string" || !screen.instancePath) {
          return { error: "each screen receipt requires instancePath" };
        }
        screens.push({
          screenName: screen.screenName,
          instancePath: screen.instancePath,
        });
      }
    }

    artifacts.push({
      artifactId: receipt.artifactId,
      hash: receipt.hash,
      instancePath: receipt.instancePath as string | undefined,
      ...(screens ? { screens } : {}),
    });
  }

  return {
    data: {
      status,
      executionId: payload.executionId,
      artifacts,
      error: payload.error as string | undefined,
      reportedAt: payload.reportedAt as number | undefined,
    },
  };
}

function commandFailureStatus(reason: string): number {
  switch (reason) {
    case "command_not_found":
      return 404;
    case "client_mismatch":
      return 403;
    case "invalid_command":
      return 400;
    case "invalid_status":
    case "not_delivered":
    case "verification_failed":
      return 409;
    default:
      return 400;
  }
}

function sendCommandAction(
  res: Response,
  result: StudioCommandActionResult,
): void {
  if (!result.success) {
    res.status(commandFailureStatus(result.reason)).json({
      success: false,
      error: result.message,
      reason: result.reason,
      data: result.command
        ? {
            commandId: result.command.id,
            status: result.command.status,
            verified: false,
          }
        : undefined,
    });
    return;
  }
  res.json({
    success: true,
    data: {
      commandId: result.command.id,
      status: result.command.status,
      verified: result.verified,
      acknowledgedAt: result.command.acknowledgedAt,
      completedAt: result.command.completedAt,
      result: result.command.result,
    },
  });
}

function sendStudioMutationError(res: Response, error: unknown): void {
  if (error instanceof DurableStorageError) {
    res.status(503).json({
      success: false,
      error: "Durable storage is temporarily unavailable",
    });
    return;
  }
  res.status(500).json({ success: false, error: "Studio operation failed" });
}

export function createStudioRouter(
  runtimeOrStore?: StudioRuntime | ArtifactStore,
  access?: ProjectAccessControl,
): Router {
  const router = Router();
  const runtime =
    runtimeOrStore instanceof StudioRuntime
      ? runtimeOrStore
      : runtimeOrStore
        ? new StudioRuntime({ artifacts: runtimeOrStore })
        : getSharedStudioRuntime();
  const bridge = runtime.bridge;
  const sessionManager = runtime.sessions;
  const dispatcher = new ProtocolDispatcher();
  const validator = new ProtocolValidator();

  runtime.startTimeoutMonitor();

  const hasStudioProjectAccess = async (
    req: Parameters<ProjectAccessControl["requireProjectAccess"]>[0],
    projectId?: string,
  ): Promise<boolean> =>
    Boolean(
      projectId &&
      access?.hasProjectAccess &&
      (await access.hasProjectAccess(
        req,
        projectId,
        STUDIO_PROJECT_ACCESS_CAPABILITY,
      )),
    );

  const requireStudioProjectAccess = async (
    req: Parameters<ProjectAccessControl["requireProjectAccess"]>[0],
    res: Response,
    projectId: string,
  ): Promise<boolean> => {
    if (!access) {
      res.status(403).json({
        success: false,
        error: "Studio project access control is unavailable",
      });
      return false;
    }
    return access.requireProjectAccess(
      req,
      res,
      projectId,
      STUDIO_PROJECT_ACCESS_CAPABILITY,
    );
  };

  const requireStudioClientAccess = async (
    req: Parameters<ProjectAccessControl["requireProjectAccess"]>[0],
    res: Response,
    clientId: string,
  ) => {
    const client = bridge.getClient(clientId);
    if (
      !client?.projectId ||
      !(await hasStudioProjectAccess(req, client.projectId))
    ) {
      res.status(404).json({ success: false, error: "Client not found" });
      return null;
    }
    return client;
  };

  const filterAuthorizedClients = async (
    req: Parameters<ProjectAccessControl["requireProjectAccess"]>[0],
    clients: ReturnType<typeof bridge.getConnectedClients>,
  ) => {
    const checks = await Promise.all(
      clients.map(async (client) => ({
        client,
        allowed: await hasStudioProjectAccess(req, client.projectId),
      })),
    );
    return checks.filter(({ allowed }) => allowed).map(({ client }) => client);
  };

  const resolveProtocolProjectId = (
    message: Record<string, unknown>,
  ): string | undefined => {
    const payload =
      message.payload && typeof message.payload === "object"
        ? (message.payload as Record<string, unknown>)
        : undefined;
    if (typeof payload?.projectId === "string") return payload.projectId;
    if (typeof payload?.clientId === "string") {
      return bridge.getClient(payload.clientId)?.projectId;
    }
    return undefined;
  };

  const filterAuthorizedEvents = async (
    req: Parameters<ProjectAccessControl["requireProjectAccess"]>[0],
    events: ReturnType<typeof bridge.events.getHistory>,
  ) => {
    const checks = await Promise.all(
      events.map(async (event) => {
        const record = event as typeof event & {
          projectId?: string;
          clientId?: string;
        };
        const projectId =
          record.projectId ??
          (record.clientId
            ? bridge.getClient(record.clientId)?.projectId
            : undefined);
        return { event, allowed: await hasStudioProjectAccess(req, projectId) };
      }),
    );
    return checks.filter(({ allowed }) => allowed).map(({ event }) => event);
  };

  // ─── Register Sync Protocol Handlers ────────────────────────────────────────

  dispatcher.register("GET_PROJECT", (msg) => {
    const { projectId } = msg.payload;
    if (!projectId || typeof projectId !== "string") {
      return createResponse(msg, "error", {}, "Missing projectId in payload");
    }
    const snapshot = runtime.getProjectSnapshot(projectId);
    if (!snapshot) {
      return createResponse(msg, "error", {}, "Project artifacts not found");
    }
    return createResponse(
      msg,
      "ok",
      snapshot as unknown as Record<string, unknown>,
    );
  });

  dispatcher.register("GET_ARTIFACTS", (msg) => {
    const { artifactIds, projectId } = msg.payload;
    if (!projectId || typeof projectId !== "string") {
      return createResponse(msg, "error", {}, "Missing projectId");
    }
    if (
      !artifactIds ||
      !Array.isArray(artifactIds) ||
      artifactIds.length === 0
    ) {
      return createResponse(msg, "error", {}, "artifactIds array is required");
    }
    const result = runtime.transferProjectArtifacts(
      projectId,
      artifactIds as string[],
    );
    if (!result) {
      return createResponse(msg, "error", {}, "Project artifacts not found");
    }
    if (result.payloadExceeded) {
      return createResponse(
        msg,
        "error",
        { transferred: result.artifacts.length, missing: result.missing },
        "Payload size limit exceeded. Request fewer artifacts.",
      );
    }
    return createResponse(
      msg,
      "ok",
      result as unknown as Record<string, unknown>,
    );
  });

  dispatcher.register("SYNC_REQUEST", async (msg) => {
    const { projectId, changes } = msg.payload;
    if (!projectId || typeof projectId !== "string") {
      return createResponse(msg, "error", {}, "Missing projectId");
    }
    const parsedChanges = parseSyncChanges(changes);
    if ("error" in parsedChanges) {
      return createResponse(msg, "error", {}, parsedChanges.error);
    }
    const result = await runtime.processProjectSyncRequest(
      projectId,
      parsedChanges.data,
    );
    if (!result) {
      return createResponse(msg, "error", {}, "Project artifacts not found");
    }
    return createResponse(
      msg,
      result.status === "error" ? "error" : "ok",
      result as unknown as Record<string, unknown>,
    );
  });

  dispatcher.register("VALIDATE", (msg) => {
    const { projectId, changes } = msg.payload;
    if (!projectId || typeof projectId !== "string") {
      return createResponse(msg, "error", {}, "Missing projectId");
    }
    const parsedChanges = parseSyncChanges(changes);
    if ("error" in parsedChanges) {
      return createResponse(msg, "error", {}, parsedChanges.error);
    }
    const result = runtime.validateProjectChanges(
      projectId,
      parsedChanges.data,
    );
    if (!result) {
      return createResponse(msg, "error", {}, "Project artifacts not found");
    }
    return createResponse(
      msg,
      result.valid ? "ok" : "error",
      result as unknown as Record<string, unknown>,
    );
  });

  dispatcher.register("COMMAND_ACK", async (msg) => {
    const { clientId, commandId } = msg.payload;
    if (typeof clientId !== "string" || typeof commandId !== "string") {
      return createResponse(
        msg,
        "error",
        {},
        "clientId and commandId are required",
      );
    }
    const result = await runtime.acknowledgeProjectExport(clientId, commandId);
    return createResponse(
      msg,
      result.success ? "ok" : "error",
      result.success
        ? {
            commandId: result.command.id,
            status: result.command.status,
            verified: result.verified,
          }
        : {
            reason: result.reason,
            commandStatus: result.command?.status,
          },
      result.success ? undefined : result.message,
    );
  });

  dispatcher.register("COMMAND_RESULT", async (msg) => {
    const { clientId, commandId } = msg.payload;
    if (typeof clientId !== "string" || typeof commandId !== "string") {
      return createResponse(
        msg,
        "error",
        {},
        "clientId and commandId are required",
      );
    }
    const parsed = parseImportReport(msg.payload);
    if (!parsed.data) {
      return createResponse(msg, "error", {}, parsed.error);
    }
    const result = await runtime.reportProjectExport(
      clientId,
      commandId,
      parsed.data,
    );
    return createResponse(
      msg,
      result.success ? "ok" : "error",
      result.success
        ? {
            commandId: result.command.id,
            status: result.command.status,
            verified: result.verified,
            result: result.command.result,
          }
        : {
            reason: result.reason,
            commandStatus: result.command?.status,
          },
      result.success ? undefined : result.message,
    );
  });

  // GET /api/studio/status
  router.get("/status", async (req, res) => {
    const clients = await filterAuthorizedClients(
      req,
      bridge.getConnectedClients(),
    );
    const sessions = sessionManager.getActiveSessions();

    res.json({
      success: true,
      data: {
        connected: clients.length > 0,
        clientCount: clients.length,
        sessionCount: sessions.length,
        clients: clients.map((client) => ({
          clientId: client.clientId,
          studioVersion: client.studioVersion,
          projectId: client.projectId,
          connectedAt: client.connectedAt,
          lastHeartbeat: client.lastHeartbeat,
          status: client.status,
          pendingCommands: bridge.getPendingCommandCount(client.clientId),
          verificationStatus:
            sessionManager.getByClient(client.clientId)?.verificationStatus ??
            "idle",
        })),
      },
    });
  });

  // POST /api/studio/connect
  router.post("/connect", async (req, res) => {
    const { studioVersion, projectId } = req.body;

    if (!studioVersion || typeof studioVersion !== "string") {
      res.status(400).json({
        success: false,
        error: "studioVersion is required",
      });
      return;
    }

    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({ success: false, error: "projectId is required" });
      return;
    }
    if (!(await requireStudioProjectAccess(req, res, projectId))) {
      return;
    }

    const client = bridge.connect(studioVersion, projectId);
    const session = sessionManager.create(client);
    try {
      await runtime.reconcileClient(client.clientId, projectId);
    } catch (error) {
      bridge.disconnect(client.clientId);
      sessionManager.close(client.clientId);
      sendStudioMutationError(res, error);
      return;
    }

    console.log(
      `[studio] Client connected: ${client.clientId} (Studio ${studioVersion})`,
    );

    res.json({
      success: true,
      data: {
        clientId: client.clientId,
        sessionId: session.sessionId,
        studioVersion: client.studioVersion,
        connectedAt: client.connectedAt,
        status: client.status,
      },
    });
  });

  // POST /api/studio/disconnect
  router.post("/disconnect", async (req, res) => {
    const { clientId } = req.body;

    if (!clientId || typeof clientId !== "string") {
      res.status(400).json({ success: false, error: "clientId is required" });
      return;
    }
    if (!(await requireStudioClientAccess(req, res, clientId))) return;

    bridge.disconnect(clientId);
    sessionManager.close(clientId);

    console.log(`[studio] Client disconnected: ${clientId}`);

    res.json({ success: true, data: { clientId, status: "disconnected" } });
  });

  // POST /api/studio/heartbeat
  router.post("/heartbeat", async (req, res) => {
    const { clientId } = req.body;

    if (!clientId || typeof clientId !== "string") {
      res.status(400).json({ success: false, error: "clientId is required" });
      return;
    }
    if (!(await requireStudioClientAccess(req, res, clientId))) return;

    const bridgeOk = bridge.heartbeat(clientId);
    const sessionOk = sessionManager.recordActivity(clientId);

    if (!bridgeOk) {
      res.status(404).json({ success: false, error: "Client not found" });
      return;
    }

    res.json({ success: true, data: { clientId, sessionActive: sessionOk } });
  });

  // GET /api/studio/session
  router.get("/session", async (req, res) => {
    const clientId = req.query.clientId as string | undefined;

    if (clientId) {
      if (!(await requireStudioClientAccess(req, res, clientId))) return;
      const session = sessionManager.getByClient(clientId);
      if (!session) {
        res.status(404).json({ success: false, error: "Session not found" });
        return;
      }
      res.json({ success: true, data: session });
      return;
    }

    const authorizedClients = await filterAuthorizedClients(
      req,
      bridge.getConnectedClients(),
    );
    const authorizedClientIds = new Set(
      authorizedClients.map((client) => client.clientId),
    );
    res.json({
      success: true,
      data: sessionManager
        .getActiveSessions()
        .filter((session) => authorizedClientIds.has(session.clientId)),
    });
  });

  // GET /api/studio/commands — plugin polling of the existing command queue
  router.get("/commands", async (req, res) => {
    const clientId = req.query.clientId as string | undefined;
    if (!clientId) {
      res.status(400).json({ success: false, error: "clientId is required" });
      return;
    }
    const client = await requireStudioClientAccess(req, res, clientId);
    if (!client) return;
    if (client.status !== "connected") {
      res.status(404).json({ success: false, error: "Client not found" });
      return;
    }
    try {
      const commands = await runtime.drainCommands(clientId);
      res.json({ success: true, data: { clientId, commands } });
    } catch (error) {
      sendStudioMutationError(res, error);
    }
  });

  // GET /api/studio/commands/:commandId — command lifecycle status
  router.get("/commands/:commandId", async (req, res) => {
    const clientId = req.query.clientId as string | undefined;
    if (!clientId) {
      res.status(400).json({ success: false, error: "clientId is required" });
      return;
    }
    if (!(await requireStudioClientAccess(req, res, clientId))) return;
    let command;
    try {
      command = await runtime.getCommand(req.params.commandId);
    } catch (error) {
      sendStudioMutationError(res, error);
      return;
    }
    if (!command) {
      res.status(404).json({ success: false, error: "Command not found" });
      return;
    }
    if (command.clientId !== clientId) {
      res.status(403).json({
        success: false,
        error: "Command belongs to a different client",
      });
      return;
    }
    res.json({ success: true, data: command });
  });

  // POST /api/studio/commands/:commandId/acknowledge
  router.post("/commands/:commandId/acknowledge", async (req, res) => {
    const { clientId } = req.body as { clientId?: unknown };
    if (typeof clientId !== "string") {
      res.status(400).json({ success: false, error: "clientId is required" });
      return;
    }
    if (!(await requireStudioClientAccess(req, res, clientId))) return;
    try {
      sendCommandAction(
        res,
        await runtime.acknowledgeProjectExport(clientId, req.params.commandId),
      );
    } catch (error) {
      sendStudioMutationError(res, error);
    }
  });

  // POST /api/studio/commands/:commandId/result
  router.post("/commands/:commandId/result", async (req, res) => {
    const body = req.body as Record<string, unknown>;
    if (typeof body.clientId !== "string") {
      res.status(400).json({ success: false, error: "clientId is required" });
      return;
    }
    const clientId = body.clientId;
    if (!(await requireStudioClientAccess(req, res, clientId))) return;
    const parsed = parseImportReport(body);
    if (!parsed.data) {
      res.status(400).json({ success: false, error: parsed.error });
      return;
    }
    try {
      sendCommandAction(
        res,
        await runtime.reportProjectExport(
          body.clientId,
          req.params.commandId,
          parsed.data,
        ),
      );
    } catch (error) {
      sendStudioMutationError(res, error);
    }
  });

  // GET /api/studio/events
  router.get("/events", async (req, res) => {
    const history = await filterAuthorizedEvents(
      req,
      bridge.events.getHistory(),
    );
    res.json({ success: true, data: history.slice(-50) });
  });

  // ─── Protocol Layer ───────────────────────────────────────────────────────

  // POST /api/studio/protocol/message — dispatch a protocol message
  router.post("/protocol/message", async (req, res) => {
    const message = req.body as Record<string, unknown>;
    const projectId = resolveProtocolProjectId(message);
    if (!projectId) {
      res
        .status(400)
        .json({ success: false, error: "projectId or clientId is required" });
      return;
    }
    if (!(await requireStudioProjectAccess(req, res, projectId))) {
      return;
    }
    try {
      const response = await dispatcher.dispatch(
        message as unknown as Parameters<typeof dispatcher.dispatch>[0],
      );
      res.json({ success: true, data: response });
    } catch (err) {
      sendStudioMutationError(res, err);
    }
  });

  // POST /api/studio/protocol/register — register a plugin client
  router.post("/protocol/register", async (req, res) => {
    const { pluginVersion, studioVersion, projectId, protocolVersion } =
      req.body;

    const validationError = validator.validateRegistration(req.body);
    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }
    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({ success: false, error: "projectId is required" });
      return;
    }
    if (!(await requireStudioProjectAccess(req, res, projectId))) {
      return;
    }

    const client = bridge.connect(studioVersion, projectId);
    const session = sessionManager.create(client);
    try {
      await runtime.reconcileClient(client.clientId, projectId);
    } catch (error) {
      bridge.disconnect(client.clientId);
      sessionManager.close(client.clientId);
      sendStudioMutationError(res, error);
      return;
    }

    console.log(
      `[studio-protocol] Plugin registered: ${client.clientId} (plugin ${pluginVersion}, protocol ${protocolVersion})`,
    );

    res.json({
      success: true,
      data: {
        clientId: client.clientId,
        sessionId: session.sessionId,
        serverProtocol: PROTOCOL_VERSION,
        compatible: true,
        studioVersion,
        pluginVersion,
      },
    });
  });

  // GET /api/studio/protocol/log — get message log
  router.get("/protocol/log", async (req, res) => {
    const clientId = req.query.clientId as string | undefined;
    if (!clientId) {
      res.status(400).json({ success: false, error: "clientId is required" });
      return;
    }
    if (!(await requireStudioClientAccess(req, res, clientId))) return;
    const session = sessionManager.getByClient(clientId);
    if (!session) {
      res.status(404).json({ success: false, error: "Session not found" });
      return;
    }
    const limit = parseInt((req.query.limit as string) ?? "50", 10);
    const log = dispatcher
      .getLog(limit)
      .filter((entry) => entry.sessionId === session.sessionId);
    res.json({ success: true, data: log });
  });

  // GET /api/studio/protocol/info — protocol metadata
  router.get("/protocol/info", (_req, res) => {
    res.json({
      success: true,
      data: {
        protocolVersion: PROTOCOL_VERSION,
        supportedTypes: dispatcher.getSupportedTypes(),
        maxPayloadSize: 1_048_576,
        messageTimeoutMs: 30_000,
      },
    });
  });

  // ─── Sync REST API ────────────────────────────────────────────────────────

  // POST /api/studio/sync/project
  router.post("/sync/project", async (req, res) => {
    const { projectId } = req.body;
    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({ success: false, error: "projectId is required" });
      return;
    }
    if (!(await requireStudioProjectAccess(req, res, projectId))) {
      return;
    }
    const snapshot = runtime.getProjectSnapshot(projectId);
    if (!snapshot) {
      res.status(404).json({ success: false, error: "Project not found" });
      return;
    }
    res.json({ success: true, data: snapshot });
  });

  // POST /api/studio/sync/artifacts
  router.post("/sync/artifacts", async (req, res) => {
    const { artifactIds, projectId } = req.body;
    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({ success: false, error: "projectId is required" });
      return;
    }
    if (!(await requireStudioProjectAccess(req, res, projectId))) {
      return;
    }
    if (
      !artifactIds ||
      !Array.isArray(artifactIds) ||
      artifactIds.length === 0
    ) {
      res
        .status(400)
        .json({ success: false, error: "artifactIds array is required" });
      return;
    }
    const result = runtime.transferProjectArtifacts(projectId, artifactIds);
    if (!result) {
      res.status(404).json({ success: false, error: "Project not found" });
      return;
    }
    if (result.payloadExceeded) {
      res.status(413).json({
        success: false,
        error: "Payload size limit exceeded. Request fewer artifacts.",
        data: { transferred: result.artifacts.length, missing: result.missing },
      });
      return;
    }
    res.json({ success: true, data: result });
  });

  // GET /api/studio/sync/status
  router.get("/sync/status", async (req, res) => {
    const projectId = req.query.projectId as string | undefined;
    if (!projectId) {
      res.status(400).json({ success: false, error: "projectId is required" });
      return;
    }
    if (!(await requireStudioProjectAccess(req, res, projectId))) {
      return;
    }
    const status = runtime.getSyncStatus(projectId);
    res.json({ success: true, data: status });
  });

  return router;
}
