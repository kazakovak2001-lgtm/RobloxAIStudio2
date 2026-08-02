/**
 * Playtest API — Run automated quality validation on generated experiences.
 */

import { Router } from "express";
import { PlaytestEngine } from "../playtest";
import type { PlaytestInput } from "../playtest";
import type { ProjectAccessControl } from "./projects";

export function createPlaytestRouter(access: ProjectAccessControl): Router {
  const router = Router();
  const engine = new PlaytestEngine();

  // POST /api/playtest/run — run playtest analysis
  router.post("/run", async (req, res) => {
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
    if (!(await access.requireProjectAccess(req, res, input.projectId))) return;

    const report = engine.run(input);
    res.json({ success: true, data: report });
  });

  // GET /api/playtest/:projectId — get existing report
  router.get("/:projectId", async (req, res) => {
    const projectId = req.params.projectId;
    const report = engine.getReport(projectId);
    if (!report) {
      res
        .status(404)
        .json({ success: false, error: "No playtest report found" });
      return;
    }
    if (access.hasProjectAccess) {
      if (!(await access.hasProjectAccess(req, projectId))) {
        res
          .status(404)
          .json({ success: false, error: "No playtest report found" });
        return;
      }
    } else if (!(await access.requireProjectAccess(req, res, projectId))) {
      return;
    }
    res.json({ success: true, data: report });
  });

  return router;
}
