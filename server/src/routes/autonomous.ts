/**
 * Autonomous Orchestrator Preview API.
 *
 * This route invokes bounded deterministic services but remains preview-only.
 * Static playtest evidence is not a Roblox runtime play session, repair is not
 * artifact-applying, and Studio delivery is unavailable without an attached
 * authenticated Studio verification context.
 */

import { Router } from "express";
import { AutonomousOrchestrator } from "../orchestrator";
import type { PipelineEventEmitter } from "../socket/streaming";

export function createAutonomousRouter(events?: PipelineEventEmitter): Router {
  const router = Router();
  const orchestrator = new AutonomousOrchestrator(events);

  // POST /api/autonomous/run — start bounded preview execution
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
        executionMode: session.executionMode,
        resultAuthority: session.resultAuthority,
        productionCompleted: false,
        warning:
          "Bounded preview only. Deterministic generation and static analysis may run, but no Roblox runtime playtest, artifact-applying repair, Studio delivery or artifact verification is performed.",
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

  // GET /api/autonomous/capabilities/:sessionId
  router.get("/capabilities/:sessionId", (req, res) => {
    const capabilities = orchestrator.getCapabilities(req.params.sessionId);
    if (!capabilities) {
      res.status(404).json({ success: false, error: "Session not found" });
      return;
    }
    res.json({ success: true, data: capabilities });
  });

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

  router.post("/recover/:sessionId", (req, res) => {
    const rawCheckpointId: unknown = req.body?.checkpointId;
    if (
      rawCheckpointId !== undefined &&
      (typeof rawCheckpointId !== "string" ||
        rawCheckpointId.trim().length === 0)
    ) {
      res.status(400).json({
        success: false,
        error: "checkpointId must be a non-empty string",
      });
      return;
    }
    const checkpointId =
      typeof rawCheckpointId === "string" ? rawCheckpointId.trim() : undefined;
    const ok = orchestrator.recover(req.params.sessionId, checkpointId);
    if (!ok) {
      res.status(400).json({
        success: false,
        error: "Cannot recover session from the requested checkpoint",
      });
      return;
    }
    res.json({ success: true, data: { status: "running" } });
  });

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
