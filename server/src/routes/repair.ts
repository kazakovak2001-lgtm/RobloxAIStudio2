/**
 * Repair API — AI Self-Repair & Iteration Engine.
 */

import { Router } from "express";
import { RepairEngine } from "../repair";
import type { PlaytestInput } from "../playtest";
import type { ProjectAccessControl } from "./projects";

export function createRepairRouter(access: ProjectAccessControl): Router {
  const router = Router();
  const engine = new RepairEngine();

  // POST /api/repair/run — run repair iteration loop
  router.post("/run", async (req, res) => {
    const { projectId, scripts, assets, dependencyGraph, config } = req.body;

    if (!projectId || !scripts) {
      res
        .status(400)
        .json({ success: false, error: "projectId and scripts required" });
      return;
    }

    if (!(await access.requireProjectAccess(req, res, projectId))) return;

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
  router.get("/:projectId", async (req, res) => {
    const projectId = req.params.projectId;
    const session = engine.getSession(projectId);
    if (!session) {
      res
        .status(404)
        .json({ success: false, error: "No repair session found" });
      return;
    }
    if (access.hasProjectAccess) {
      if (!(await access.hasProjectAccess(req, projectId))) {
        res
          .status(404)
          .json({ success: false, error: "No repair session found" });
        return;
      }
    } else if (!(await access.requireProjectAccess(req, res, projectId))) {
      return;
    }
    res.json({ success: true, data: session });
  });

  // GET /api/repair/history/:projectId — get repair history
  router.get("/history/:projectId", async (req, res) => {
    const projectId = req.params.projectId;
    const history = engine.getHistory(projectId);
    if (access.hasProjectAccess) {
      if (!(await access.hasProjectAccess(req, projectId))) {
        res
          .status(404)
          .json({ success: false, error: "No repair history found" });
        return;
      }
    } else if (!(await access.requireProjectAccess(req, res, projectId))) {
      return;
    }
    res.json({ success: true, data: history });
  });

  return router;
}
