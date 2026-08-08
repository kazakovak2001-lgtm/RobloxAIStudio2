/**
 * Repair API — real, artifact-applying repair (REPAIR-1A).
 */

import { Router } from "express";
import { RepairEngine } from "../repair";
import type { AgentRegistry } from "../agents/core/AgentRegistry";
import type { IBlueprintRepository } from "../projects/repository/blueprint.repository";
import { ArtifactStore } from "../pipeline/v2";
import type { StudioIntegrationManager } from "../studio/integration/StudioIntegrationManager";
import type { ProjectAccessControl } from "./projects";

export function createRepairRouter(
  access: ProjectAccessControl,
  agentRegistry: AgentRegistry,
  blueprintRepository: IBlueprintRepository,
  studioManager: StudioIntegrationManager,
  artifactStore: ArtifactStore = new ArtifactStore(),
): Router {
  const router = Router();
  const engine = new RepairEngine(
    agentRegistry,
    blueprintRepository,
    artifactStore,
  );

  const findStudioSession = (projectId: string, studioId?: string) => {
    if (studioId) {
      const session = studioManager.getSession(studioId);
      return session && session.projectId === projectId ? session : null;
    }
    return (
      studioManager
        .getActiveSessions()
        .find((session) => session.projectId === projectId) ?? null
    );
  };

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

  // POST /api/repair/:projectId/deliver — push the latest repaired
  // execution's artifacts to a connected Studio session. The target
  // execution is always resolved server-side from the repair session's own
  // history — never client-supplied.
  router.post("/:projectId/deliver", async (req, res) => {
    const projectId = req.params.projectId;
    if (!(await access.requireProjectAccess(req, res, projectId))) return;

    try {
      const session = await engine.getSession(projectId);
      const targetExecutionId = [...(session?.history ?? [])]
        .reverse()
        .find((record) => record.newExecutionId)?.newExecutionId;
      if (!targetExecutionId) {
        res.status(404).json({
          success: false,
          error: "No repaired execution available for this project",
        });
        return;
      }

      const { studioId } = req.body;
      const studioSession = findStudioSession(projectId, studioId);
      if (!studioSession) {
        res.status(404).json({
          success: false,
          error: "No connected Studio session available for this project.",
        });
        return;
      }

      const syncResult = await studioManager.synchronizeExecution(
        studioSession.studioId,
        projectId,
        targetExecutionId,
      );
      if (!syncResult.success) {
        res.status(502).json({
          success: false,
          error: syncResult.error ?? "Studio delivery failed",
          data: { executionId: targetExecutionId, syncResult },
        });
        return;
      }

      res.json({
        success: true,
        data: { executionId: targetExecutionId, syncResult },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "Delivery failed",
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
