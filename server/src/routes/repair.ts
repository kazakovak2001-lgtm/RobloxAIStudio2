/**
 * Repair API — AI Self-Repair & Iteration Engine.
 */

import { Router } from "express";
import { RepairEngine } from "../repair";
import type { PlaytestInput } from "../playtest";

export function createRepairRouter(): Router {
  const router = Router();
  const engine = new RepairEngine();

  // POST /api/repair/run — run repair iteration loop
  router.post("/run", (req, res) => {
    const { projectId, scripts, assets, dependencyGraph, config } = req.body;

    if (!projectId || !scripts) {
      res
        .status(400)
        .json({ success: false, error: "projectId and scripts required" });
      return;
    }

    const input: PlaytestInput = {
      projectId,
      scripts: scripts ?? [],
      assets: assets ?? [],
      dependencyGraph,
    };

    const session = engine.run(input, config);
    res.json({ success: true, data: session });
  });

  // GET /api/repair/:projectId — get repair session
  router.get("/:projectId", (req, res) => {
    const session = engine.getSession(req.params.projectId);
    if (!session) {
      res
        .status(404)
        .json({ success: false, error: "No repair session found" });
      return;
    }
    res.json({ success: true, data: session });
  });

  // GET /api/repair/history/:projectId — get repair history
  router.get("/history/:projectId", (req, res) => {
    const history = engine.getHistory(req.params.projectId);
    res.json({ success: true, data: history });
  });

  return router;
}
