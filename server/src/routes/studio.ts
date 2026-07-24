/**
 * Studio Bridge API — connection management, protocol, and artifact sync.
 */

import { Router } from "express";
import { PROTOCOL_VERSION } from "../studio/v2/protocol";
import {
  getStudioRuntime,
  type StudioRuntime,
} from "../studio/v2/StudioRuntime";

export function createStudioRouter(
  runtime: StudioRuntime = getStudioRuntime(),
): Router {
  const router = Router();
  runtime.startTimeoutMonitor();

  // GET /api/studio/status
  router.get("/status", (_req, res) => {
    const clients = runtime.bridge.getConnectedClients();
    const sessions = runtime.sessions.getActiveSessions();

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

    const { client, session } = runtime.connect(
      studioVersion,
      typeof projectId === "string" ? projectId : undefined,
    );

    console.log(
      `[studio] Client connected: ${client.clientId} (Studio ${studioVersion})`,
    );

    res.json({
      success: true,
      data: {
        clientId: client.clientId,
        sessionId: session.sessionId,
        projectId: session.projectId,
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

    runtime.disconnect(clientId);
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

    if (!runtime.bridge.getClient(clientId)) {
      res.status(404).json({ success: false, error: "Client not found" });
      return;
    }

    const sessionActive = runtime.heartbeat(clientId);
    res.json({ success: true, data: { clientId, sessionActive } });
  });

  // GET /api/studio/session
  router.get("/session", (req, res) => {
    const clientId = req.query.clientId as string | undefined;

    if (clientId) {
      const session = runtime.sessions.getByClient(clientId);
      if (!session) {
        res.status(404).json({ success: false, error: "Session not found" });
        return;
      }
      res.json({ success: true, data: session });
      return;
    }

    res.json({ success: true, data: runtime.sessions.getActiveSessions() });
  });

  // GET /api/studio/commands?clientId=...
  // Existing bridge command queue polling for the Studio plugin.
  router.get("/commands", (req, res) => {
    const clientId = req.query.clientId as string | undefined;
    if (!clientId) {
      res.status(400).json({ success: false, error: "clientId is required" });
      return;
    }
    if (!runtime.bridge.getClient(clientId)) {
      res.status(404).json({ success: false, error: "Client not found" });
      return;
    }
    res.json({
      success: true,
      data: runtime.getPendingCommands(clientId),
    });
  });

  // GET /api/studio/events
  router.get("/events", (_req, res) => {
    const history = runtime.bridge.events.getHistory();
    res.json({ success: true, data: history.slice(-50) });
  });

  // POST /api/studio/protocol/message — dispatch a protocol message
  router.post("/protocol/message", async (req, res) => {
    try {
      const response = await runtime.dispatcher.dispatch(req.body);
      res.json({ success: true, data: response });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Dispatch failed",
      });
    }
  });

  // POST /api/studio/protocol/register — register a plugin client
  router.post("/protocol/register", (req, res) => {
    const {
      pluginVersion,
      studioVersion,
      projectId,
      projectName,
      protocolVersion,
    } = req.body;

    const validationError = runtime.validator.validateRegistration(req.body);
    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }

    const projectReference =
      typeof projectId === "string"
        ? projectId
        : typeof projectName === "string"
          ? projectName
          : undefined;
    const { client, session } = runtime.connect(
      studioVersion,
      projectReference,
    );

    console.log(
      `[studio-protocol] Plugin registered: ${client.clientId} (plugin ${pluginVersion}, protocol ${protocolVersion})`,
    );

    res.json({
      success: true,
      data: {
        clientId: client.clientId,
        sessionId: session.sessionId,
        projectId: session.projectId,
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
    res.json({ success: true, data: runtime.dispatcher.getLog(limit) });
  });

  // GET /api/studio/protocol/info — protocol metadata
  router.get("/protocol/info", (_req, res) => {
    res.json({
      success: true,
      data: {
        protocolVersion: PROTOCOL_VERSION,
        supportedTypes: runtime.dispatcher.getSupportedTypes(),
        maxPayloadSize: 1_048_576,
        messageTimeoutMs: 30_000,
      },
    });
  });

  // POST /api/studio/sync/project
  router.post("/sync/project", (req, res) => {
    const { projectId } = req.body;
    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({ success: false, error: "projectId is required" });
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
  router.post("/sync/artifacts", (req, res) => {
    const { artifactIds } = req.body;
    if (!Array.isArray(artifactIds) || artifactIds.length === 0) {
      res
        .status(400)
        .json({ success: false, error: "artifactIds array is required" });
      return;
    }
    const result = runtime.syncManager
      .getTransferManager()
      .transfer(artifactIds);
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
    res.json({
      success: true,
      data: runtime.syncManager.getSyncStatus(projectId),
    });
  });

  return router;
}
