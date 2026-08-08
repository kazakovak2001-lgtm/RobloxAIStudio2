/**
 * Repair API — real, artifact-applying repair (REPAIR-1A).
 */

import { Router } from "express";
import { RepairEngine } from "../repair";
import type { AgentRegistry } from "../agents/core/AgentRegistry";
import type { IBlueprintRepository } from "../projects/repository/blueprint.repository";
import { ArtifactStore } from "../pipeline/v2";
import type { ProjectAccessControl } from "./projects";

export function createRepairRouter(
  access: ProjectAccessControl,
  agentRegistry: AgentRegistry,
  blueprintRepository: IBlueprintRepository,
  artifactStore: ArtifactStore = new ArtifactStore(),
): Router {
  const router = Router();
  const engine = new RepairEngine(
    agentRegistry,
    blueprintRepository,
    artifactStore,
  );

  // POST /api/repair/run — attempt a real repair against a specific execution
  router.post("/run", async (req, res) => {
    const { projectId, executionId, config } = req.body;

    if (!projectId || !executionId) {
      res
        .status(400)
        .json({ success: false, error: "projectId and executionId required" });
      return;
    }

    if (!(await access.requireProjectAccess(req, res, projectId))) return;

    try {
      const session = await engine.run(projectId, executionId, config);
      res.json({ success: true, data: session });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "Repair failed",
      });
    }
  });

  // GET /api/repair/:projectId — get repair session
  router.get("/:projectId", async (req, res) => {
    const projectId = req.params.projectId;
    const session = await engine.getSession(projectId);
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
    const history = await engine.getHistory(projectId);
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
