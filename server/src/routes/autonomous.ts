/**
 * Autonomous Orchestrator API — Single-prompt to complete Roblox Experience.
 */

import { Router } from "express";
import { AutonomousOrchestrator } from "../orchestrator";

export function createAutonomousRouter(): Router {
  const router = Router();
  const orchestrator = new AutonomousOrchestrator();

  // POST /api/autonomous/run — start autonomous generation
  router.post("/run", (req, res) => {
    const { prompt, projectId, goals } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 5) {
      res
        .status(400)
        .json({ success: false, error: "prompt is required (min 5 chars)" });
      return;
    }

    const session = orchestrator.run(
      prompt.trim(),
      projectId ?? `auto-${Date.now()}`,
      goals,
    );

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        status: session.status,
        currentPhase: session.currentPhase,
      },
    });
  });

  // GET /api/autonomous/status/:sessionId
  router.get("/status/:sessionId", (req, res) => {
    const session = orchestrator.getSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({ success: false, error: "Session not found" });
      return;
    }
    res.json({ success: true, data: session });
  });

  // POST /api/autonomous/pause/:sessionId
  router.post("/pause/:sessionId", (req, res) => {
    const ok = orchestrator.pause(req.params.sessionId);
    if (!ok) {
      res
        .status(400)
        .json({ success: false, error: "Cannot pause (not running)" });
      return;
    }
    res.json({ success: true, data: { status: "paused" } });
  });

  // POST /api/autonomous/resume/:sessionId
  router.post("/resume/:sessionId", (req, res) => {
    const ok = orchestrator.resume(req.params.sessionId);
    if (!ok) {
      res
        .status(400)
        .json({ success: false, error: "Cannot resume (not paused)" });
      return;
    }
    res.json({ success: true, data: { status: "running" } });
  });

  // POST /api/autonomous/cancel/:sessionId
  router.post("/cancel/:sessionId", (req, res) => {
    const ok = orchestrator.cancel(req.params.sessionId);
    if (!ok) {
      res.status(400).json({ success: false, error: "Cannot cancel" });
      return;
    }
    res.json({ success: true, data: { status: "cancelled" } });
  });

  return router;
}
