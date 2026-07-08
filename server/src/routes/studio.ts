/**
 * Studio Bridge API — connection management and status.
 */

import { Router } from "express";
import { StudioBridge } from "../studio/v2/StudioBridge";
import { StudioSessionManager } from "../studio/v2/StudioSession";
import {
  ProtocolDispatcher,
  ProtocolValidator,
  PROTOCOL_VERSION,
  createResponse,
} from "../studio/v2/protocol";
import { ProjectSyncManager } from "../studio/v2/sync";
import { ArtifactStore } from "../pipeline/v2";

// Shared artifact store instance (in production, inject via DI)
const sharedArtifactStore = new ArtifactStore();

export function createStudioRouter(artifactStore?: ArtifactStore): Router {
  const router = Router();
  const bridge = new StudioBridge();
  const sessionManager = new StudioSessionManager();
  const dispatcher = new ProtocolDispatcher();
  const validator = new ProtocolValidator();
  const store = artifactStore ?? sharedArtifactStore;
  const syncManager = new ProjectSyncManager(store);

  // Periodic timeout check (every 30s)
  setInterval(() => {
    const expired = sessionManager.checkTimeouts();
    for (const sessionId of expired) {
      console.log(`[studio] Session ${sessionId} expired (heartbeat timeout)`);
    }
  }, 30_000);

  // ─── Register Sync Protocol Handlers ────────────────────────────────────────

  dispatcher.register("GET_PROJECT", (msg) => {
    const { projectId } = msg.payload;
    if (!projectId || typeof projectId !== "string") {
      return createResponse(msg, "error", {}, "Missing projectId in payload");
    }
    const snapshot = syncManager.getProjectSnapshot(projectId as string);
    if (!snapshot) {
      return createResponse(msg, "error", {}, "Project not found");
    }
    return createResponse(
      msg,
      "ok",
      snapshot as unknown as Record<string, unknown>,
    );
  });

  dispatcher.register("GET_ARTIFACTS", (msg) => {
    const { artifactIds } = msg.payload;
    if (
      !artifactIds ||
      !Array.isArray(artifactIds) ||
      artifactIds.length === 0
    ) {
      return createResponse(msg, "error", {}, "artifactIds array is required");
    }
    const transferManager = syncManager.getTransferManager();
    const result = transferManager.transfer(artifactIds as string[]);
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

  dispatcher.register("SYNC_REQUEST", (msg) => {
    const { projectId, changes } = msg.payload;
    if (!projectId || typeof projectId !== "string") {
      return createResponse(msg, "error", {}, "Missing projectId");
    }
    if (!changes || !Array.isArray(changes)) {
      return createResponse(msg, "error", {}, "Missing changes array");
    }
    const result = syncManager.processSyncRequest(
      projectId as string,
      changes as Array<Record<string, unknown>> as never,
    );
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
    if (!changes || !Array.isArray(changes)) {
      return createResponse(msg, "error", {}, "Missing changes array");
    }
    const result = syncManager.validateOnly(
      projectId as string,
      changes as Array<Record<string, unknown>> as never,
    );
    return createResponse(
      msg,
      result.valid ? "ok" : "error",
      result as unknown as Record<string, unknown>,
    );
  });

  // GET /api/studio/status
  router.get("/status", (_req, res) => {
    const clients = bridge.getConnectedClients();
    const sessions = sessionManager.getActiveSessions();

    res.json({
      success: true,
      data: {
        connected: clients.length > 0,
        clientCount: clients.length,
        sessionCount: sessions.length,
        clients: clients.map((c) => ({
          clientId: c.clientId,
          studioVersion: c.studioVersion,
          projectId: c.projectId,
          connectedAt: c.connectedAt,
          lastHeartbeat: c.lastHeartbeat,
          status: c.status,
        })),
      },
    });
  });

  // POST /api/studio/connect
  router.post("/connect", (req, res) => {
    const { studioVersion, projectId } = req.body;

    if (!studioVersion || typeof studioVersion !== "string") {
      res.status(400).json({
        success: false,
        error: "studioVersion is required",
      });
      return;
    }

    const client = bridge.connect(studioVersion, projectId);
    const session = sessionManager.create(client);

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
  router.post("/disconnect", (req, res) => {
    const { clientId } = req.body;

    if (!clientId || typeof clientId !== "string") {
      res.status(400).json({ success: false, error: "clientId is required" });
      return;
    }

    bridge.disconnect(clientId);
    sessionManager.close(clientId);

    console.log(`[studio] Client disconnected: ${clientId}`);

    res.json({ success: true, data: { clientId, status: "disconnected" } });
  });

  // POST /api/studio/heartbeat
  router.post("/heartbeat", (req, res) => {
    const { clientId } = req.body;

    if (!clientId || typeof clientId !== "string") {
      res.status(400).json({ success: false, error: "clientId is required" });
      return;
    }

    const bridgeOk = bridge.heartbeat(clientId);
    const sessionOk = sessionManager.recordActivity(clientId);

    if (!bridgeOk) {
      res.status(404).json({ success: false, error: "Client not found" });
      return;
    }

    res.json({ success: true, data: { clientId, sessionActive: sessionOk } });
  });

  // GET /api/studio/session
  router.get("/session", (req, res) => {
    const clientId = req.query.clientId as string | undefined;

    if (clientId) {
      const session = sessionManager.getByClient(clientId);
      if (!session) {
        res.status(404).json({ success: false, error: "Session not found" });
        return;
      }
      res.json({ success: true, data: session });
      return;
    }

    // Return all active sessions
    const sessions = sessionManager.getActiveSessions();
    res.json({ success: true, data: sessions });
  });

  // GET /api/studio/events
  router.get("/events", (_req, res) => {
    const history = bridge.events.getHistory();
    res.json({ success: true, data: history.slice(-50) });
  });

  // ─── Protocol Layer ───────────────────────────────────────────────────────

  // POST /api/studio/protocol/message — dispatch a protocol message
  router.post("/protocol/message", async (req, res) => {
    const message = req.body;
    try {
      const response = await dispatcher.dispatch(message);
      res.json({ success: true, data: response });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "Dispatch failed",
      });
    }
  });

  // POST /api/studio/protocol/register — register a plugin client
  router.post("/protocol/register", (req, res) => {
    const { pluginVersion, studioVersion, projectName, protocolVersion } =
      req.body;

    const validationError = validator.validateRegistration(req.body);
    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }

    const client = bridge.connect(studioVersion, projectName);
    const session = sessionManager.create(client);

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
  router.get("/protocol/log", (req, res) => {
    const limit = parseInt((req.query.limit as string) ?? "50", 10);
    const log = dispatcher.getLog(limit);
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
  router.post("/sync/project", (req, res) => {
    const { projectId } = req.body;
    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({ success: false, error: "projectId is required" });
      return;
    }
    const snapshot = syncManager.getProjectSnapshot(projectId);
    if (!snapshot) {
      res.status(404).json({ success: false, error: "Project not found" });
      return;
    }
    res.json({ success: true, data: snapshot });
  });

  // POST /api/studio/sync/artifacts
  router.post("/sync/artifacts", (req, res) => {
    const { artifactIds } = req.body;
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
    const transferManager = syncManager.getTransferManager();
    const result = transferManager.transfer(artifactIds);
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
  router.get("/sync/status", (req, res) => {
    const projectId = req.query.projectId as string | undefined;
    const status = syncManager.getSyncStatus(projectId);
    res.json({ success: true, data: status });
  });

  return router;
}
