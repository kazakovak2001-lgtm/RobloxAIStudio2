/**
 * Autonomous Orchestrator Preview API.
 *
 * This route invokes bounded deterministic services but remains preview-only.
 * Static playtest evidence is not a Roblox runtime play session, repair is not
 * artifact-applying, and Studio delivery is unavailable without an attached
 * authenticated Studio verification context.
 */

import { Router, type Request, type Response } from "express";
import { AutonomousOrchestrator } from "../orchestrator";
import type { PipelineEventEmitter } from "../socket/streaming";
import { DurableStorageError } from "../platform/storage";
import type { ProjectAccessControl } from "./projects";

export function createAutonomousRouter(
  events?: PipelineEventEmitter,
  access?: ProjectAccessControl,
  orchestrator = new AutonomousOrchestrator(events),
): Router {
  const router = Router();
  const hasSessionAccess = async (
    req: Request,
    res: Response,
    sessionId: string,
  ): Promise<boolean> => {
    await orchestrator.ready();
    const session = orchestrator.getSession(sessionId);
    return !session || !access
      ? true
      : access.requireProjectAccess(req, res, session.projectId);
  };

  // POST /api/autonomous/run — start bounded preview execution
  router.post("/run", async (req, res) => {
    const { prompt, projectId, goals } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 5) {
      res
        .status(400)
        .json({ success: false, error: "prompt is required (min 5 chars)" });
      return;
    }

    try {
      if (
        access &&
        typeof projectId === "string" &&
        !(await access.requireProjectAccess(req, res, projectId))
      ) {
        return;
      }
      const session = await orchestrator.run(
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
    } catch (error) {
      handleAutonomousMutationError(error, res);
    }
  });

  // GET /api/autonomous/status/:sessionId
  router.get("/status/:sessionId", async (req, res) => {
    await orchestrator.ready();
    const session = orchestrator.getSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({ success: false, error: "Session not found" });
      return;
    }
    if (
      access &&
      !(await access.requireProjectAccess(req, res, session.projectId))
    ) {
      return;
    }
    res.json({ success: true, data: session });
  });

  // GET /api/autonomous/project/:projectId/latest — reload/reconnect source of truth
  router.get("/project/:projectId/latest", async (req, res) => {
    if (
      access &&
      !(await access.requireProjectAccess(req, res, req.params.projectId))
    ) {
      return;
    }
    await orchestrator.ready();
    const session = orchestrator.getLatestSessionForProject(
      req.params.projectId,
    );
    if (!session) {
      res.status(404).json({ success: false, error: "Session not found" });
      return;
    }
    res.json({ success: true, data: session });
  });

  // GET /api/autonomous/capabilities/:sessionId
  router.get("/capabilities/:sessionId", async (req, res) => {
    await orchestrator.ready();
    const session = orchestrator.getSession(req.params.sessionId);
    if (
      session &&
      access &&
      !(await access.requireProjectAccess(req, res, session.projectId))
    ) {
      return;
    }
    const capabilities = orchestrator.getCapabilities(req.params.sessionId);
    if (!capabilities) {
      res.status(404).json({ success: false, error: "Session not found" });
      return;
    }
    res.json({ success: true, data: capabilities });
  });

  router.post("/pause/:sessionId", async (req, res) => {
    try {
      if (!(await hasSessionAccess(req, res, req.params.sessionId))) return;
      const ok = await orchestrator.pause(req.params.sessionId);
      if (!ok) {
        res
          .status(400)
          .json({ success: false, error: "Cannot pause (not running)" });
        return;
      }
      res.json({ success: true, data: { status: "paused" } });
    } catch (error) {
      handleAutonomousMutationError(error, res);
    }
  });

  router.post("/resume/:sessionId", async (req, res) => {
    try {
      if (!(await hasSessionAccess(req, res, req.params.sessionId))) return;
      const ok = await orchestrator.resume(req.params.sessionId);
      if (!ok) {
        res
          .status(400)
          .json({ success: false, error: "Cannot resume (not paused)" });
        return;
      }
      res.json({ success: true, data: { status: "running" } });
    } catch (error) {
      handleAutonomousMutationError(error, res);
    }
  });

  router.post("/recover/:sessionId", async (req, res) => {
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
    try {
      if (!(await hasSessionAccess(req, res, req.params.sessionId))) return;
      const ok = await orchestrator.recover(req.params.sessionId, checkpointId);
      if (!ok) {
        res.status(400).json({
          success: false,
          error: "Cannot recover session from the requested checkpoint",
        });
        return;
      }
      res.json({ success: true, data: { status: "running" } });
    } catch (error) {
      handleAutonomousMutationError(error, res);
    }
  });

  router.post("/cancel/:sessionId", async (req, res) => {
    try {
      if (!(await hasSessionAccess(req, res, req.params.sessionId))) return;
      const ok = await orchestrator.cancel(req.params.sessionId);
      if (!ok) {
        res.status(400).json({ success: false, error: "Cannot cancel" });
        return;
      }
      res.json({ success: true, data: { status: "cancelled" } });
    } catch (error) {
      handleAutonomousMutationError(error, res);
    }
  });

  return router;
}

export function handleAutonomousMutationError(
  error: unknown,
  res: Response,
): void {
  if (error instanceof DurableStorageError) {
    console.error("[autonomous] durable mutation rejected", error);
    res.status(503).json({
      success: false,
      error: "Durable storage is temporarily unavailable",
    });
    return;
  }
  console.error("[autonomous] mutation failed", error);
  res.status(500).json({
    success: false,
    error: "Autonomous lifecycle mutation failed",
  });
}
