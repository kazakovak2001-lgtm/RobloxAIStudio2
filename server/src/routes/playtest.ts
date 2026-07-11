/**
 * Playtest API — Run automated quality validation on generated experiences.
 */

import { Router } from "express";
import { PlaytestEngine } from "../playtest";
import type { PlaytestInput } from "../playtest";

export function createPlaytestRouter(): Router {
  const router = Router();
  const engine = new PlaytestEngine();

  // POST /api/playtest/run — run playtest analysis
  router.post("/run", (req, res) => {
    const input = req.body as PlaytestInput;

    if (!input.projectId) {
      res.status(400).json({ success: false, error: "projectId is required" });
      return;
    }
    if (!input.scripts || !Array.isArray(input.scripts)) {
      res
        .status(400)
        .json({ success: false, error: "scripts array is required" });
      return;
    }

    const report = engine.run(input);
    res.json({ success: true, data: report });
  });

  // GET /api/playtest/:projectId — get existing report
  router.get("/:projectId", (req, res) => {
    const report = engine.getReport(req.params.projectId);
    if (!report) {
      res
        .status(404)
        .json({ success: false, error: "No playtest report found" });
      return;
    }
    res.json({ success: true, data: report });
  });

  return router;
}
