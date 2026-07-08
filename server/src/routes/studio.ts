/**
 * Studio Bridge API — connection management and status.
 */

import { Router } from "express";
import { StudioBridge } from "../studio/v2/StudioBridge";
import { StudioSessionManager } from "../studio/v2/StudioSession";

export function createStudioRouter(): Router {
  const router = Router();
  const bridge = new StudioBridge();
  const sessionManager = new StudioSessionManager();

  // Periodic timeout check (every 30s)
  setInterval(() => {
    const expired = sessionManager.checkTimeouts();
    for (const sessionId of expired) {
      console.log(`[studio] Session ${sessionId} expired (heartbeat timeout)`);
    }
  }, 30_000);

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

  return router;
}
